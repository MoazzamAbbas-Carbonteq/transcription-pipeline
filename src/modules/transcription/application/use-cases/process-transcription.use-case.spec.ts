import { ConfigService } from '@nestjs/config';
import {
  PermanentProviderError,
  TransientProviderError,
} from '../../../../common/errors/app.errors';
import { AppConfig } from '../../../../config/configuration';
import { AudioProcessorPort } from '../../domain/ports/audio-processor.port';
import { TranscriptionProviderPort } from '../../domain/ports/transcription-provider.port';
import { TranscriptionRepositoryPort } from '../../domain/ports/transcription-repository.port';
import { TranscriptionStatus } from '../../domain/transcription-status.enum';
import { TranscriptAssemblerService } from '../services/transcript-assembler.service';
import { RetryService } from '../services/retry.service';
import { ProcessTranscriptionUseCase } from './process-transcription.use-case';

describe('ProcessTranscriptionUseCase', () => {
  const job = {
    id: 'job-1',
    status: TranscriptionStatus.QUEUED,
    originalFilename: 'sample.wav',
    mimeType: 'audio/wav',
    storagePath: '/tmp/transcription/job-1/original.wav',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const configService = {
    get: (key: string) => {
      const values: Record<string, unknown> = {
        transcriptionModel: 'whisper-large-v3-turbo',
        audioChunkDurationSeconds: 600,
        audioChunkOverlapSeconds: 2,
        transcriptionMaxRetries: 3,
        transcriptionRetryBaseDelayMs: 1,
      };
      return values[key];
    },
  } as unknown as ConfigService<AppConfig, true>;

  function build(
    provider: TranscriptionProviderPort,
    repositoryOverrides: Partial<TranscriptionRepositoryPort> = {},
  ) {
    const repository: TranscriptionRepositoryPort = {
      findById: jest.fn(async () => ({ ...job })),
      update: jest.fn(async (updated) => updated),
      save: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      ...repositoryOverrides,
    };

    const audioProcessor: AudioProcessorPort = {
      createWorkspace: jest.fn(),
      inspect: jest.fn(),
      normalize: jest.fn(async () => ({
        path: '/tmp/transcription/job-1/normalized.wav',
        durationSeconds: 2.5,
      })),
      splitIntoChunks: jest.fn(async () => [
        {
          chunkPath: '/tmp/transcription/job-1/chunks/chunk-000.wav',
          offsetSeconds: 0,
          durationSeconds: 2.5,
          index: 0,
        },
      ]),
      cleanup: jest.fn(async () => undefined),
    };

    return {
      useCase: new ProcessTranscriptionUseCase(
        repository,
        audioProcessor,
        provider,
        new TranscriptAssemblerService(),
        new RetryService(configService),
        configService,
      ),
      repository,
      audioProcessor,
    };
  }

  it('processes successfully and stores timestamped result', async () => {
    const provider: TranscriptionProviderPort = {
      name: 'mock',
      transcribe: jest.fn(async () => ({
        text: 'This is a mock transcription.',
        language: 'en',
        duration: 2.5,
        segments: [
          { start: 0, end: 2.5, text: 'This is a mock transcription.' },
        ],
      })),
    };

    const { useCase, repository, audioProcessor } = build(provider);
    await useCase.execute('job-1');

    expect(repository.update).toHaveBeenCalled();
    const finalJob = (repository.update as jest.Mock).mock.calls.at(-1)?.[0];
    expect(finalJob.status).toBe(TranscriptionStatus.COMPLETED);
    expect(finalJob.result.segments[0]).toEqual({
      start: 0,
      end: 2.5,
      text: 'This is a mock transcription.',
    });
    expect(audioProcessor.cleanup).toHaveBeenCalled();
  });

  it('marks the job failed on permanent provider errors', async () => {
    const provider: TranscriptionProviderPort = {
      name: 'mock',
      transcribe: jest.fn(async () => {
        throw new PermanentProviderError('bad credentials');
      }),
    };

    const { useCase, repository } = build(provider);
    await useCase.execute('job-1');

    const finalJob = (repository.update as jest.Mock).mock.calls.at(-1)?.[0];
    expect(finalJob.status).toBe(TranscriptionStatus.FAILED);
    expect(finalJob.error.message).toBe('bad credentials');
  });

  it('retries transient provider errors before succeeding', async () => {
    let attempts = 0;
    const provider: TranscriptionProviderPort = {
      name: 'mock',
      transcribe: jest.fn(async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new TransientProviderError('rate limited');
        }
        return {
          text: 'recovered',
          language: 'en',
          duration: 1,
          segments: [{ start: 0, end: 1, text: 'recovered' }],
        };
      }),
    };

    const { useCase, repository } = build(provider);
    await useCase.execute('job-1');

    expect(attempts).toBe(2);
    const finalJob = (repository.update as jest.Mock).mock.calls.at(-1)?.[0];
    expect(finalJob.status).toBe(TranscriptionStatus.COMPLETED);
  });
});
