import { Inject, Injectable } from '@nestjs/common';
import { NotFoundAppError } from '../../../../common/errors/app.errors';
import {
  TRANSCRIPTION_REPOSITORY,
  type TranscriptionRepositoryPort,
} from '../../domain/ports/transcription-repository.port';
import type { TranscriptionJob } from '../../domain/transcription-job';

@Injectable()
export class GetTranscriptionUseCase {
  constructor(
    @Inject(TRANSCRIPTION_REPOSITORY)
    private readonly repository: TranscriptionRepositoryPort,
  ) {}

  async execute(id: string): Promise<TranscriptionJob> {
    const job = await this.repository.findById(id);
    if (!job) {
      throw new NotFoundAppError(`Transcription job ${id} was not found`);
    }
    return job;
  }
}
