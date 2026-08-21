import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../config/configuration';
import { InMemoryJobQueue } from './in-memory-job.queue';

describe('InMemoryJobQueue', () => {
  it('bounds concurrent processing', async () => {
    const configService = {
      get: () => 2,
    } as unknown as ConfigService<AppConfig, true>;

    const queue = new InMemoryJobQueue(configService);
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];

    queue.start(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });
    });

    await queue.enqueue('1');
    await queue.enqueue('2');
    await queue.enqueue('3');
    await queue.enqueue('4');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(maxActive).toBe(2);
    expect(queue.getStats().queued).toBe(2);

    releases.shift()?.();
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    releases.shift()?.();
    releases.shift()?.();
    await queue.stop();

    expect(maxActive).toBe(2);
    expect(queue.getStats()).toEqual({ active: 0, queued: 0 });
  });
});
