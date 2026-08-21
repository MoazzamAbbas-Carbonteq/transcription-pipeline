import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../../config/configuration';
import {
  InvalidMediaError,
  UnsupportedMediaError,
  ValidationAppError,
} from '../../../../common/errors/app.errors';
import {
  AUDIO_PROCESSOR,
  type AudioProcessorPort,
} from '../../domain/ports/audio-processor.port';
import {
  JOB_QUEUE,
  type JobQueuePort,
} from '../../domain/ports/job-queue.port';
import {
  TRANSCRIPTION_REPOSITORY,
  type TranscriptionRepositoryPort,
} from '../../domain/ports/transcription-repository.port';
import type { TranscriptionJob } from '../../domain/transcription-job';
import { TranscriptionStatus } from '../../domain/transcription-status.enum';

export interface CreateTranscriptionCommand {
  originalFilename: string;
  mimeType: string;
  size: number;
  stream: Readable;
  path?: string;
  idempotencyKey?: string;
}

@Injectable()
export class CreateTranscriptionUseCase {
  private readonly logger = new Logger(CreateTranscriptionUseCase.name);
  private readonly maxUploadBytes: number;

  constructor(
    @Inject(TRANSCRIPTION_REPOSITORY)
    private readonly repository: TranscriptionRepositoryPort,
    @Inject(AUDIO_PROCESSOR)
    private readonly audioProcessor: AudioProcessorPort,
    @Inject(JOB_QUEUE)
    private readonly jobQueue: JobQueuePort,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.maxUploadBytes =
      this.configService.get('maxUploadSizeMb', { infer: true }) * 1024 * 1024;
  }

  async execute(
    command: CreateTranscriptionCommand,
  ): Promise<Pick<TranscriptionJob, 'id' | 'status'>> {
    if (!command.originalFilename) {
      throw new ValidationAppError('Uploaded file is missing a filename');
    }

    if (!command.size || command.size <= 0) {
      throw new ValidationAppError('Uploaded file is empty');
    }

    if (command.size > this.maxUploadBytes) {
      throw new ValidationAppError(
        `File exceeds configured maximum size of ${this.configService.get('maxUploadSizeMb', { infer: true })} MB`,
        'FILE_TOO_LARGE',
      );
    }

    if (command.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(
        command.idempotencyKey,
      );
      if (existing) {
        return { id: existing.id, status: existing.status };
      }
    }

    const id = randomUUID();
    const workspace = await this.audioProcessor.createWorkspace(
      id,
      command.originalFilename,
    );

    try {
      if (command.path) {
        await fs.copyFile(command.path, workspace.originalPath);
      } else {
        await pipeline(
          command.stream,
          createWriteStream(workspace.originalPath),
        );
      }

      await this.audioProcessor.inspect(workspace.originalPath);

      const now = new Date();
      const job: TranscriptionJob = {
        id,
        status: TranscriptionStatus.QUEUED,
        originalFilename: command.originalFilename,
        mimeType: command.mimeType || 'application/octet-stream',
        storagePath: workspace.originalPath,
        createdAt: now,
        updatedAt: now,
        idempotencyKey: command.idempotencyKey,
      };

      await this.repository.save(job);
      await this.jobQueue.enqueue(id);

      this.logger.log({
        message: 'Transcription job accepted',
        jobId: id,
        stage: 'queued',
        originalFilename: command.originalFilename,
      });

      return { id, status: TranscriptionStatus.QUEUED };
    } catch (error) {
      await this.audioProcessor.cleanup(workspace.rootDir);

      if (
        error instanceof InvalidMediaError ||
        error instanceof UnsupportedMediaError ||
        error instanceof ValidationAppError
      ) {
        throw error;
      }

      this.logger.error({
        message: 'Failed to accept transcription upload',
        jobId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ValidationAppError('Unable to accept uploaded media');
    }
  }
}
