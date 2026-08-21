import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { ValidationAppError } from '../../../../common/errors/app.errors';
import { AppConfig } from '../../../../config/configuration';
import { AudioProcessorPort } from '../../domain/ports/audio-processor.port';
import { JobQueuePort } from '../../domain/ports/job-queue.port';
import { TranscriptionRepositoryPort } from '../../domain/ports/transcription-repository.port';
import { TranscriptionStatus } from '../../domain/transcription-status.enum';
import { CreateTranscriptionUseCase } from './create-transcription.use-case';

describe('CreateTranscriptionUseCase', () => {
  const repository: TranscriptionRepositoryPort = {
    save: jest.fn(async (job) => job),
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(async () => null),
    update: jest.fn(),
  };

  const audioProcessor: AudioProcessorPort = {
    createWorkspace: jest.fn(async (jobId) => ({
      jobId,
      rootDir: `/tmp/transcription/${jobId}`,
      originalPath: `/tmp/transcription/${jobId}/original.wav`,
    })),
    inspect: jest.fn(async () => ({
      durationSeconds: 1,
      hasAudio: true,
      formatName: 'wav',
    })),
    normalize: jest.fn(),
    splitIntoChunks: jest.fn(),
    cleanup: jest.fn(async () => undefined),
  };

  const jobQueue: JobQueuePort = {
    enqueue: jest.fn(async () => undefined),
    start: jest.fn(),
    stop: jest.fn(async () => undefined),
    getStats: jest.fn(() => ({ active: 0, queued: 0 })),
  };

  const configService = {
    get: (key: string) => {
      if (key === 'maxUploadSizeMb') return 25;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, 'copyFile').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a queued job and enqueues it', async () => {
    const useCase = new CreateTranscriptionUseCase(
      repository,
      audioProcessor,
      jobQueue,
      configService,
    );

    const result = await useCase.execute({
      originalFilename: 'sample.wav',
      mimeType: 'audio/wav',
      size: 128,
      path: '/tmp/fake-upload.wav',
      stream: Readable.from([]),
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.status).toBe(TranscriptionStatus.QUEUED);
    expect(result.id).toBeDefined();
    expect(repository.save).toHaveBeenCalled();
    expect(jobQueue.enqueue).toHaveBeenCalledWith(result.id);
  });

  it('rejects empty uploads', async () => {
    const useCase = new CreateTranscriptionUseCase(
      repository,
      audioProcessor,
      jobQueue,
      configService,
    );

    await expect(
      useCase.execute({
        originalFilename: 'sample.wav',
        mimeType: 'audio/wav',
        size: 0,
        stream: Readable.from([]),
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
      }),
    ).rejects.toBeInstanceOf(ValidationAppError);
  });
});
