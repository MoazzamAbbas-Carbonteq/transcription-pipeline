import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../config/configuration';
import {
  InvalidMediaError,
  UnsupportedMediaError,
} from '../../../../common/errors/app.errors';
import {
  AudioChunk,
  AudioProcessorPort,
  JobWorkspace,
  MediaInspection,
  NormalizedAudio,
} from '../../domain/ports/audio-processor.port';

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
}

interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.wav',
  '.mp3',
  '.m4a',
  '.mp4',
  '.webm',
  '.ogg',
  '.flac',
  '.aac',
  '.mpeg',
  '.mpga',
]);

@Injectable()
export class FfmpegAudioProcessor implements AudioProcessorPort {
  private readonly logger = new Logger(FfmpegAudioProcessor.name);
  private readonly tempDir: string;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.tempDir = this.configService.get('tempDir', { infer: true });
    this.ffmpegPath = this.configService.get('ffmpegPath', { infer: true });
    this.ffprobePath = this.configService.get('ffprobePath', { infer: true });
  }

  async createWorkspace(
    jobId: string,
    originalFilename: string,
  ): Promise<JobWorkspace> {
    const rootDir = join(this.tempDir, jobId);
    await fs.mkdir(rootDir, { recursive: true });

    const safeName = basename(originalFilename).replace(/[^\w.-]+/g, '_');
    const originalPath = join(rootDir, `original${extname(safeName) || ''}`);

    return { jobId, rootDir, originalPath };
  }

  async inspect(filePath: string): Promise<MediaInspection> {
    let probe: FfprobeResult;
    try {
      const stdout = await this.runCommand(this.ffprobePath, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);
      probe = JSON.parse(stdout) as FfprobeResult;
    } catch {
      throw new InvalidMediaError(
        'Unable to inspect media file; the upload may be corrupt or unreadable',
      );
    }

    const audioStream = (probe.streams ?? []).find(
      (stream) => stream.codec_type === 'audio',
    );

    if (!audioStream) {
      throw new InvalidMediaError(
        'Media does not contain a usable audio stream',
      );
    }

    const durationSeconds = Number(
      probe.format?.duration ?? audioStream.duration ?? NaN,
    );

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new InvalidMediaError('Media duration could not be determined');
    }

    const formatName = (probe.format?.format_name ?? '').toLowerCase();
    if (!this.isSupportedFormat(filePath, formatName, audioStream.codec_name)) {
      throw new UnsupportedMediaError(
        `Unsupported media format: ${formatName || 'unknown'}`,
      );
    }

    return {
      durationSeconds,
      hasAudio: true,
      formatName,
      codecName: audioStream.codec_name,
      sampleRate: audioStream.sample_rate
        ? Number(audioStream.sample_rate)
        : undefined,
      channels: audioStream.channels,
    };
  }

  async normalize(
    inputPath: string,
    outputPath: string,
  ): Promise<NormalizedAudio> {
    await this.runCommand(this.ffmpegPath, [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      outputPath,
    ]);

    const inspection = await this.inspect(outputPath);
    return {
      path: outputPath,
      durationSeconds: inspection.durationSeconds,
    };
  }

  async splitIntoChunks(
    normalizedPath: string,
    outputDir: string,
    chunkDurationSeconds: number,
    overlapSeconds: number,
  ): Promise<AudioChunk[]> {
    await fs.mkdir(outputDir, { recursive: true });
    const inspection = await this.inspect(normalizedPath);
    const duration = inspection.durationSeconds;

    if (duration <= chunkDurationSeconds) {
      const singlePath = join(outputDir, 'chunk-000.wav');
      await fs.copyFile(normalizedPath, singlePath);
      return [
        {
          chunkPath: singlePath,
          offsetSeconds: 0,
          durationSeconds: duration,
          index: 0,
        },
      ];
    }

    const step = Math.max(chunkDurationSeconds - overlapSeconds, 1);
    const chunks: AudioChunk[] = [];
    let offset = 0;
    let index = 0;

    while (offset < duration) {
      const remaining = duration - offset;
      const chunkDuration = Math.min(chunkDurationSeconds, remaining);
      const chunkPath = join(
        outputDir,
        `chunk-${String(index).padStart(3, '0')}.wav`,
      );

      await this.runCommand(this.ffmpegPath, [
        '-y',
        '-ss',
        offset.toFixed(3),
        '-t',
        chunkDuration.toFixed(3),
        '-i',
        normalizedPath,
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        chunkPath,
      ]);

      chunks.push({
        chunkPath,
        offsetSeconds: offset,
        durationSeconds: chunkDuration,
        index,
      });

      if (offset + chunkDuration >= duration) {
        break;
      }

      offset += step;
      index += 1;
    }

    this.logger.log({
      message: 'Audio split into chunks',
      chunkCount: chunks.length,
      durationSeconds: duration,
      chunkDurationSeconds,
      overlapSeconds,
    });

    return chunks;
  }

  async cleanup(rootDir: string): Promise<void> {
    try {
      await fs.rm(rootDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn({
        message: 'Failed to clean temporary workspace',
        rootDir,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private isSupportedFormat(
    filePath: string,
    formatName: string,
    codecName?: string,
  ): boolean {
    const extension = extname(filePath).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(extension)) {
      return true;
    }

    const tokens = new Set(
      `${formatName},${codecName ?? ''}`
        .toLowerCase()
        .split(/[,\s]+/)
        .filter(Boolean),
    );

    const supportedTokens = [
      'wav',
      'mp3',
      'mp4',
      'm4a',
      'aac',
      'webm',
      'ogg',
      'opus',
      'flac',
      'mpeg',
      'mov',
    ];

    return supportedTokens.some((token) => tokens.has(token));
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        reject(error);
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(
          new Error(
            `${command} exited with code ${code}: ${stderr.slice(0, 500)}`,
          ),
        );
      });
    });
  }
}
