import { Injectable } from '@nestjs/common';
import { TranscriptionJob } from '../../domain/transcription-job';
import { TranscriptionRepositoryPort } from '../../domain/ports/transcription-repository.port';

@Injectable()
export class InMemoryTranscriptionRepository implements TranscriptionRepositoryPort {
  private readonly jobs = new Map<string, TranscriptionJob>();
  private readonly idempotencyIndex = new Map<string, string>();

  async save(job: TranscriptionJob): Promise<TranscriptionJob> {
    this.jobs.set(job.id, { ...job });
    if (job.idempotencyKey) {
      this.idempotencyIndex.set(job.idempotencyKey, job.id);
    }
    return { ...job };
  }

  async findById(id: string): Promise<TranscriptionJob | null> {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }

  async findByIdempotencyKey(key: string): Promise<TranscriptionJob | null> {
    const id = this.idempotencyIndex.get(key);
    if (!id) {
      return null;
    }
    return this.findById(id);
  }

  async update(job: TranscriptionJob): Promise<TranscriptionJob> {
    if (!this.jobs.has(job.id)) {
      throw new Error(`Cannot update unknown job ${job.id}`);
    }
    this.jobs.set(job.id, { ...job });
    if (job.idempotencyKey) {
      this.idempotencyIndex.set(job.idempotencyKey, job.id);
    }
    return { ...job };
  }
}
