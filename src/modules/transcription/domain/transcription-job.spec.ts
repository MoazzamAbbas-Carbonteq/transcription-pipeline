import {
  markCompleted,
  markFailed,
  markProcessing,
  TranscriptionJob,
} from './transcription-job';
import { TranscriptionStatus } from './transcription-status.enum';

function makeJob(
  status: TranscriptionStatus = TranscriptionStatus.QUEUED,
): TranscriptionJob {
  return {
    id: 'job-1',
    status,
    originalFilename: 'sample.wav',
    mimeType: 'audio/wav',
    storagePath: '/tmp/sample.wav',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('TranscriptionJob status transitions', () => {
  it('transitions queued -> processing -> completed', () => {
    const processing = markProcessing(makeJob());
    expect(processing.status).toBe(TranscriptionStatus.PROCESSING);
    expect(processing.startedAt).toBeDefined();

    const completed = markCompleted(processing, {
      text: 'hello',
      segments: [{ start: 0, end: 1, text: 'hello' }],
    });
    expect(completed.status).toBe(TranscriptionStatus.COMPLETED);
    expect(completed.result?.text).toBe('hello');
  });

  it('transitions processing -> failed', () => {
    const processing = markProcessing(makeJob());
    const failed = markFailed(processing, 'boom');
    expect(failed.status).toBe(TranscriptionStatus.FAILED);
    expect(failed.error?.message).toBe('boom');
  });

  it('rejects invalid transitions', () => {
    expect(() =>
      markProcessing(makeJob(TranscriptionStatus.COMPLETED)),
    ).toThrow(/Invalid status transition/);
  });
});
