import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { CreateTranscriptionUseCase } from './application/use-cases/create-transcription.use-case';
import { GetTranscriptionUseCase } from './application/use-cases/get-transcription.use-case';
import { ProcessTranscriptionUseCase } from './application/use-cases/process-transcription.use-case';
import { TranscriptAssemblerService } from './application/services/transcript-assembler.service';
import { RetryService } from './application/services/retry.service';
import { AUDIO_PROCESSOR } from './domain/ports/audio-processor.port';
import { JOB_QUEUE } from './domain/ports/job-queue.port';
import { TRANSCRIPTION_PROVIDER } from './domain/ports/transcription-provider.port';
import { TRANSCRIPTION_REPOSITORY } from './domain/ports/transcription-repository.port';
import { FfmpegAudioProcessor } from './infrastructure/audio/ffmpeg-audio.processor';
import { GroqTranscriptionProvider } from './infrastructure/providers/groq-transcription.provider';
import { MockTranscriptionProvider } from './infrastructure/providers/mock-transcription.provider';
import { InMemoryJobQueue } from './infrastructure/queue/in-memory-job.queue';
import { InMemoryTranscriptionRepository } from './infrastructure/repositories/in-memory-transcription.repository';
import { TranscriptionController } from './presentation/transcription.controller';
import { TranscriptionWorker } from './transcription.worker';

@Module({
  imports: [ConfigModule],
  controllers: [TranscriptionController],
  providers: [
    CreateTranscriptionUseCase,
    GetTranscriptionUseCase,
    ProcessTranscriptionUseCase,
    TranscriptAssemblerService,
    RetryService,
    TranscriptionWorker,
    {
      provide: TRANSCRIPTION_REPOSITORY,
      useClass: InMemoryTranscriptionRepository,
    },
    {
      provide: JOB_QUEUE,
      useClass: InMemoryJobQueue,
    },
    {
      provide: AUDIO_PROCESSOR,
      useClass: FfmpegAudioProcessor,
    },
    {
      provide: TRANSCRIPTION_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const provider = configService.get('transcriptionProvider', {
          infer: true,
        });
        if (provider === 'groq') {
          return new GroqTranscriptionProvider(configService);
        }
        return new MockTranscriptionProvider();
      },
    },
  ],
})
export class TranscriptionModule {}
