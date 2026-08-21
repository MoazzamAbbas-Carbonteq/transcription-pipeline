import { ConfigService } from '@nestjs/config';
import {
  PermanentProviderError,
  TransientProviderError,
} from '../../../../common/errors/app.errors';
import { AppConfig } from '../../../../config/configuration';
import { RetryService } from './retry.service';

describe('RetryService', () => {
  const configService = {
    get: (key: string) => {
      if (key === 'transcriptionMaxRetries') return 3;
      if (key === 'transcriptionRetryBaseDelayMs') return 1;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;

  it('retries transient failures then succeeds', async () => {
    const service = new RetryService(configService);
    let attempts = 0;

    const result = await service.execute(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new TransientProviderError('temporary');
        }
        return 'ok';
      },
      { operationName: 'test' },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry permanent failures', async () => {
    const service = new RetryService(configService);
    let attempts = 0;

    await expect(
      service.execute(
        async () => {
          attempts += 1;
          throw new PermanentProviderError('bad request');
        },
        { operationName: 'test' },
      ),
    ).rejects.toBeInstanceOf(PermanentProviderError);

    expect(attempts).toBe(1);
  });

  it('fails after retries are exhausted', async () => {
    const service = new RetryService(configService);
    let attempts = 0;

    await expect(
      service.execute(
        async () => {
          attempts += 1;
          throw new TransientProviderError('still failing');
        },
        { operationName: 'test', maxRetries: 2 },
      ),
    ).rejects.toBeInstanceOf(TransientProviderError);

    expect(attempts).toBe(3);
  });
});
