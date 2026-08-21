export type JobHandler = (jobId: string) => Promise<void>;

export interface JobQueuePort {
  enqueue(jobId: string): Promise<void>;
  start(handler: JobHandler): void;
  stop(): Promise<void>;
  getStats(): { active: number; queued: number };
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');
