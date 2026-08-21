import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../config/configuration';
import { GroqTranscriptionProvider } from './groq-transcription.provider';

describe('GroqTranscriptionProvider mapping', () => {
  const configService = {
    get: (key: string) => {
      if (key === 'groqApiKey') return 'test-key';
      if (key === 'transcriptionModel') return 'whisper-large-v3-turbo';
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;

  it('maps Groq-like payloads to application-owned types only', () => {
    const provider = new GroqTranscriptionProvider(configService);

    const mapped = provider.mapResponse({
      text: 'hello',
      language: 'en',
      duration: 5.5,
      segments: [
        {
          start: 2,
          end: 5.5,
          text: 'hello',
        },
      ],
      // Groq-only fields that must not leak.
      ...({
        task: 'transcribe',
        x_groq: { id: 'req_123' },
      } as object),
    });

    expect(mapped).toEqual({
      text: 'hello',
      language: 'en',
      duration: 5.5,
      segments: [{ start: 2, end: 5.5, text: 'hello' }],
    });
    expect(mapped).not.toHaveProperty('task');
    expect(mapped).not.toHaveProperty('x_groq');
    expect(Object.keys(mapped).sort()).toEqual(
      ['duration', 'language', 'segments', 'text'].sort(),
    );
  });
});
