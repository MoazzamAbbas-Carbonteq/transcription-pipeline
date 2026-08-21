import { Injectable } from '@nestjs/common';
import {
  ProviderTranscriptionResult,
  TranscriptionInput,
  TranscriptionProviderPort,
} from '../../domain/ports/transcription-provider.port';

@Injectable()
export class MockTranscriptionProvider implements TranscriptionProviderPort {
  readonly name = 'mock';

  async transcribe(
    _input: TranscriptionInput,
  ): Promise<ProviderTranscriptionResult> {
    void _input;
    return {
      text: 'This is a mock transcription.',
      language: 'en',
      duration: 2.5,
      segments: [
        {
          start: 0,
          end: 2.5,
          text: 'This is a mock transcription.',
        },
      ],
    };
  }
}
