import { MockTranscriptionProvider } from './mock-transcription.provider';

describe('MockTranscriptionProvider', () => {
  it('returns a deterministic transcript without credentials', async () => {
    const provider = new MockTranscriptionProvider();
    const first = await provider.transcribe({ audioPath: '/tmp/a.wav' });
    const second = await provider.transcribe({ audioPath: '/tmp/b.wav' });

    expect(first).toEqual(second);
    expect(first).toEqual({
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
    });
  });
});
