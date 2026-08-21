import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ProcessTranscriptionUseCase } from './application/use-cases/process-transcription.use-case';
import { JOB_QUEUE, type JobQueuePort } from './domain/ports/job-queue.port';

@Injectable()
export class TranscriptionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscriptionWorker.name);

  constructor(
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueuePort,
    private readonly processTranscription: ProcessTranscriptionUseCase,
  ) {}

  onModuleInit(): void {
    this.jobQueue.start(async (jobId: string) => {
      await this.processTranscription.execute(jobId);
    });
    this.logger.log('Transcription worker started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.jobQueue.stop();
  }
}
