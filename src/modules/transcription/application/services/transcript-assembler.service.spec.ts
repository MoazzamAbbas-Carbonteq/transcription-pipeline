import { TranscriptAssemblerService } from './transcript-assembler.service';

describe('TranscriptAssemblerService', () => {
  const assembler = new TranscriptAssemblerService();

  it('applies chunk offset to relative timestamps', () => {
    const segments = assembler.applyOffset(
      {
        text: 'hello',
        segments: [{ start: 4, end: 7, text: 'hello' }],
      },
      600,
    );

    expect(segments).toEqual([{ start: 604, end: 607, text: 'hello' }]);
  });

  it('assembles multiple chunks into absolute chronological segments', () => {
    const result = assembler.assemble([
      {
        offsetSeconds: 0,
        overlapSeconds: 2,
        providerResult: {
          text: 'one',
          language: 'en',
          duration: 10,
          segments: [{ start: 0, end: 2, text: 'one' }],
        },
      },
      {
        offsetSeconds: 598,
        overlapSeconds: 2,
        providerResult: {
          text: 'two',
          segments: [{ start: 3.5, end: 7.1, text: 'two' }],
        },
      },
      {
        offsetSeconds: 1196,
        overlapSeconds: 2,
        providerResult: {
          text: 'three',
          segments: [{ start: 1, end: 4, text: 'three' }],
        },
      },
    ]);

    expect(result.language).toBe('en');
    expect(result.segments).toEqual([
      { start: 0, end: 2, text: 'one' },
      { start: 601.5, end: 605.1, text: 'two' },
      { start: 1197, end: 1200, text: 'three' },
    ]);
    expect(result.text).toBe('one two three');
    expect(JSON.stringify(result)).not.toContain('x_groq');
    expect(JSON.stringify(result)).not.toContain('task');
  });

  it('orders segments chronologically', () => {
    const result = assembler.assemble([
      {
        offsetSeconds: 10,
        overlapSeconds: 0,
        providerResult: {
          text: 'b',
          segments: [{ start: 0, end: 1, text: 'b' }],
        },
      },
      {
        offsetSeconds: 0,
        overlapSeconds: 0,
        providerResult: {
          text: 'a',
          segments: [{ start: 0, end: 1, text: 'a' }],
        },
      },
    ]);

    expect(result.segments.map((s) => s.text)).toEqual(['a', 'b']);
  });

  it('removes obvious duplicate segments inside overlap windows', () => {
    const result = assembler.assemble([
      {
        offsetSeconds: 0,
        overlapSeconds: 2,
        providerResult: {
          text: 'hello world',
          segments: [
            { start: 0, end: 1, text: 'hello' },
            { start: 8.5, end: 10, text: 'world' },
          ],
        },
      },
      {
        offsetSeconds: 8,
        overlapSeconds: 2,
        providerResult: {
          text: 'world again',
          segments: [
            { start: 0.5, end: 2, text: 'world' },
            { start: 3, end: 4, text: 'again' },
          ],
        },
      },
    ]);

    expect(result.segments).toEqual([
      { start: 0, end: 1, text: 'hello' },
      { start: 8.5, end: 10, text: 'world' },
      { start: 11, end: 12, text: 'again' },
    ]);
  });

  it('rejects invalid timestamp ranges', () => {
    expect(() =>
      assembler.applyOffset(
        {
          text: 'bad',
          segments: [{ start: 5, end: 2, text: 'bad' }],
        },
        0,
      ),
    ).toThrow('invalid timestamp range');
  });
});
