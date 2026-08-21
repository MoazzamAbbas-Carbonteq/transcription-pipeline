import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../config/configuration';
import { AppError } from '../../../../common/errors/app.errors';
import { computeBackoffDelayMs, sleep } from '../../../../common/utils/sleep';

export interface RetryOptions {
  operationName: string;
  jobId?: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private readonly defaultMaxRetries: number;
  private readonly defaultBaseDelayMs: number;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.defaultMaxRetries = this.configService.get('transcriptionMaxRetries', {
      infer: true,
    });
    this.defaultBaseDelayMs = this.configService.get(
      'transcriptionRetryBaseDelayMs',
      { infer: true },
    );
  }

  async execute<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? this.defaultMaxRetries;
    const baseDelayMs = options.baseDelayMs ?? this.defaultBaseDelayMs;
    let attempt = 0;

    // attempt is 1-based for logging; retries mean attempt can go to maxRetries+1
    while (true) {
      attempt += 1;
      try {
        return await operation();
      } catch (error) {
        const retryable = this.isRetryable(error);
        const retriesLeft = maxRetries - (attempt - 1);

        if (!retryable || retriesLeft <= 0) {
          this.logger.warn({
            message: 'Operation failed without further retry',
            operation: options.operationName,
            jobId: options.jobId,
            attempt,
            retryable,
          });
          throw error;
        }

        const retryAfterMs =
          error instanceof AppError ? error.retryAfterMs : undefined;
        const delayMs = computeBackoffDelayMs(
          attempt,
          baseDelayMs,
          retryAfterMs,
        );

        this.logger.warn({
          message: 'Transient failure; retrying with backoff',
          operation: options.operationName,
          jobId: options.jobId,
          attempt,
          delayMs,
        });

        await sleep(delayMs);
      }
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof AppError) {
      return error.retryable;
    }
    return false;
  }
}
