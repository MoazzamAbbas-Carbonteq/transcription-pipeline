import { NotFoundAppError } from '../../../../common/errors/app.errors';
import { TranscriptionRepositoryPort } from '../../domain/ports/transcription-repository.port';
import { TranscriptionStatus } from '../../domain/transcription-status.enum';
import { GetTranscriptionUseCase } from './get-transcription.use-case';

describe('GetTranscriptionUseCase', () => {
  it('returns an existing job', async () => {
    const repository: TranscriptionRepositoryPort = {
      save: jest.fn(),
      update: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(async () => ({
        id: 'job-1',
        status: TranscriptionStatus.QUEUED,
        originalFilename: 'a.wav',
        mimeType: 'audio/wav',
        storagePath: '/tmp/a.wav',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };

    const useCase = new GetTranscriptionUseCase(repository);
    const job = await useCase.execute('job-1');
    expect(job.id).toBe('job-1');
  });

  it('throws when job is missing', async () => {
    const repository: TranscriptionRepositoryPort = {
      save: jest.fn(),
      update: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(async () => null),
    };

    const useCase = new GetTranscriptionUseCase(repository);
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      NotFoundAppError,
    );
  });
});
