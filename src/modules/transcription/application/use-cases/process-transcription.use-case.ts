import { dirname, join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../config/configuration';
import { AppError } from '../../../../common/errors/app.errors';
import {
  AUDIO_PROCESSOR,
  type AudioChunk,
  type AudioProcessorPort,
} from '../../domain/ports/audio-processor.port';
import {
  TRANSCRIPTION_PROVIDER,
  type TranscriptionProviderPort,
} from '../../domain/ports/transcription-provider.port';
import {
  TRANSCRIPTION_REPOSITORY,
  type TranscriptionRepositoryPort,
} from '../../domain/ports/transcription-repository.port';
import {
  markCompleted,
  markFailed,
  markProcessing,
} from '../../domain/transcription-job';
import { TranscriptAssemblerService } from '../services/transcript-assembler.service';
import { RetryService } from '../services/retry.service';

@Injectable()
export class ProcessTranscriptionUseCase {
  private readonly logger = new Logger(ProcessTranscriptionUseCase.name);

  constructor(
    @Inject(TRANSCRIPTION_REPOSITORY)
    private readonly repository: TranscriptionRepositoryPort,
    @Inject(AUDIO_PROCESSOR)
    private readonly audioProcessor: AudioProcessorPort,
    @Inject(TRANSCRIPTION_PROVIDER)
    private readonly transcriptionProvider: TranscriptionProviderPort,
    private readonly assembler: TranscriptAssemblerService,
    private readonly retryService: RetryService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async execute(jobId: string): Promise<void> {
    const existing = await this.repository.findById(jobId);
    if (!existing) {
      this.logger.warn({ message: 'Skipping unknown job', jobId });
      return;
    }

    let job = markProcessing(existing);
    await this.repository.update(job);

    const workspaceRoot = dirname(job.storagePath);
    const startedAt = Date.now();

    try {
      this.logger.log({
        message: 'Processing transcription job',
        jobId,
        stage: 'processing',
        provider: this.transcriptionProvider.name,
        model: this.configService.get('transcriptionModel', { infer: true }),
      });

      const normalizedPath = join(workspaceRoot, 'normalized.wav');
      const normalized = await this.audioProcessor.normalize(
        job.storagePath,
        normalizedPath,
      );

      const chunkDuration = this.configService.get(
        'audioChunkDurationSeconds',
        { infer: true },
      );
      const overlapSeconds = this.configService.get(
        'audioChunkOverlapSeconds',
        { infer: true },
      );

      const chunksDir = join(workspaceRoot, 'chunks');
      const chunks = await this.audioProcessor.splitIntoChunks(
        normalized.path,
        chunksDir,
        chunkDuration,
        overlapSeconds,
      );

      const chunkResults = [];
      for (const chunk of chunks) {
        const providerResult = await this.transcribeChunk(jobId, chunk);
        chunkResults.push({
          offsetSeconds: chunk.offsetSeconds,
          providerResult,
          overlapSeconds,
        });
      }

      const result = this.assembler.assemble(chunkResults);
      if (!result.duration) {
        result.duration = normalized.durationSeconds;
      }

      job = markCompleted(job, result);
      await this.repository.update(job);

      this.logger.log({
        message: 'Transcription completed',
        jobId,
        stage: 'completed',
        provider: this.transcriptionProvider.name,
        chunkCount: chunks.length,
        durationMs: Date.now() - startedAt,
        audioDurationSeconds: result.duration,
      });
    } catch (error) {
      const safeMessage = this.toSafeErrorMessage(error);
      job = markFailed(job, safeMessage);
      await this.repository.update(job);

      this.logger.error({
        message: 'Transcription failed',
        jobId,
        stage: 'failed',
        error: safeMessage,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      await this.audioProcessor.cleanup(workspaceRoot);
    }
  }

  private async transcribeChunk(jobId: string, chunk: AudioChunk) {
    return this.retryService.execute(
      () =>
        this.transcriptionProvider.transcribe({
          audioPath: chunk.chunkPath,
          filename: `chunk-${chunk.index}.wav`,
          mimeType: 'audio/wav',
        }),
      {
        operationName: 'transcribe-chunk',
        jobId,
      },
    );
  }

  private toSafeErrorMessage(error: unknown): string {
    if (error instanceof AppError) {
      return error.message;
    }
    return 'Transcription processing failed';
  }
}
