import { TranscriptionResult } from './transcription-result';
import { TranscriptionStatus } from './transcription-status.enum';

export interface TranscriptionJobError {
  message: string;
}

export interface TranscriptionJob {
  id: string;
  status: TranscriptionStatus;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: TranscriptionJobError;
  result?: TranscriptionResult;
  idempotencyKey?: string;
}

export function assertQueued(job: TranscriptionJob): void {
  if (job.status !== TranscriptionStatus.QUEUED) {
    throw new Error(
      `Invalid status transition: expected QUEUED, got ${job.status}`,
    );
  }
}

export function markProcessing(job: TranscriptionJob): TranscriptionJob {
  assertQueued(job);
  const now = new Date();
  return {
    ...job,
    status: TranscriptionStatus.PROCESSING,
    startedAt: now,
    updatedAt: now,
  };
}

export function markCompleted(
  job: TranscriptionJob,
  result: TranscriptionResult,
): TranscriptionJob {
  if (job.status !== TranscriptionStatus.PROCESSING) {
    throw new Error(
      `Invalid status transition: expected PROCESSING, got ${job.status}`,
    );
  }
  const now = new Date();
  return {
    ...job,
    status: TranscriptionStatus.COMPLETED,
    result,
    completedAt: now,
    updatedAt: now,
    error: undefined,
  };
}

export function markFailed(
  job: TranscriptionJob,
  message: string,
): TranscriptionJob {
  if (
    job.status !== TranscriptionStatus.PROCESSING &&
    job.status !== TranscriptionStatus.QUEUED
  ) {
    throw new Error(
      `Invalid status transition: expected PROCESSING or QUEUED, got ${job.status}`,
    );
  }
  const now = new Date();
  return {
    ...job,
    status: TranscriptionStatus.FAILED,
    error: { message },
    failedAt: now,
    updatedAt: now,
  };
}
