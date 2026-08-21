import { TranscriptionJob } from '../transcription-job';

export interface TranscriptionRepositoryPort {
  save(job: TranscriptionJob): Promise<TranscriptionJob>;
  findById(id: string): Promise<TranscriptionJob | null>;
  findByIdempotencyKey(key: string): Promise<TranscriptionJob | null>;
  update(job: TranscriptionJob): Promise<TranscriptionJob>;
}

export const TRANSCRIPTION_REPOSITORY = Symbol('TRANSCRIPTION_REPOSITORY');
