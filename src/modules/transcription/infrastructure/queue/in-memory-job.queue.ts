import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../config/configuration';
import { JobHandler, JobQueuePort } from '../../domain/ports/job-queue.port';

@Injectable()
export class InMemoryJobQueue implements JobQueuePort, OnModuleDestroy {
  private readonly logger = new Logger(InMemoryJobQueue.name);
  private readonly pending: string[] = [];
  private activeCount = 0;
  private handler?: JobHandler;
  private started = false;
  private accepting = true;
  private readonly concurrency: number;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.concurrency = this.configService.get('transcriptionConcurrency', {
      infer: true,
    });
  }

  start(handler: JobHandler): void {
    this.handler = handler;
    this.started = true;
    this.pump();
  }

  async enqueue(jobId: string): Promise<void> {
    if (!this.accepting) {
      throw new Error('Job queue has been stopped');
    }
    this.pending.push(jobId);
    this.logger.log({
      message: 'Job enqueued',
      jobId,
      queued: this.pending.length,
      active: this.activeCount,
    });
    this.pump();
  }

  getStats(): { active: number; queued: number } {
    return { active: this.activeCount, queued: this.pending.length };
  }

  async stop(): Promise<void> {
    this.accepting = false;
    while (this.activeCount > 0 || this.pending.length > 0) {
      if (this.pending.length > 0) {
        this.pump();
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 25);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private pump(): void {
    if (!this.started || !this.handler) {
      return;
    }

    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (!jobId) {
        break;
      }

      this.activeCount += 1;
      void this.runJob(jobId);
    }
  }

  private async runJob(jobId: string): Promise<void> {
    const handler = this.handler;
    if (!handler) {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.notifyWaiters();
      return;
    }

    try {
      this.logger.log({
        message: 'Job started by queue worker',
        jobId,
        active: this.activeCount,
        queued: this.pending.length,
      });
      await handler(jobId);
    } catch (error) {
      this.logger.error({
        message: 'Unhandled queue worker error',
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.notifyWaiters();
      this.pump();
    }
  }

  private notifyWaiters(): void {
    while (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      resolve?.();
    }
  }
}
