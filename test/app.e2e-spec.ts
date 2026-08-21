import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/global-exception.filter';
import { TranscriptionStatus } from '../src/modules/transcription/domain/transcription-status.enum';

describe('Transcription API (e2e)', () => {
  let app: INestApplication<App>;
  const samplePath = join(__dirname, '..', 'samples', 'sample.wav');

  beforeAll(() => {
    process.env.TRANSCRIPTION_PROVIDER = 'mock';
    process.env.MAX_UPLOAD_SIZE_MB = '1';
    process.env.TRANSCRIPTION_CONCURRENCY = '2';
    process.env.TEMP_DIR = join('/tmp', 'transcription-e2e');

    mkdirSync(join(__dirname, '..', 'samples'), { recursive: true });
    if (!existsSync(samplePath)) {
      const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
      execFileSync(
        ffmpeg,
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=1',
          '-ac',
          '1',
          '-ar',
          '16000',
          samplePath,
        ],
        { stdio: 'ignore' },
      );
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('rejects missing file uploads', async () => {
    await request(app.getHttpServer()).post('/v1/transcriptions').expect(400);
  });

  it('rejects unsupported/corrupt media', async () => {
    const corruptPath = join('/tmp', 'corrupt-upload.txt');
    writeFileSync(corruptPath, 'not-an-audio-file');

    await request(app.getHttpServer())
      .post('/v1/transcriptions')
      .attach('file', corruptPath, 'corrupt.txt')
      .expect((res) => {
        expect([400, 415, 422]).toContain(res.status);
      });
  });

  it('rejects oversized uploads', async () => {
    const bigPath = join('/tmp', 'oversized.wav');
    // Create a file larger than MAX_UPLOAD_SIZE_MB=1
    writeFileSync(bigPath, Buffer.alloc(1.5 * 1024 * 1024, 1));

    await request(app.getHttpServer())
      .post('/v1/transcriptions')
      .attach('file', bigPath, 'oversized.wav')
      .expect(413);
  });

  it('returns 404 for unknown jobs', async () => {
    await request(app.getHttpServer())
      .get('/v1/transcriptions/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('uploads audio, processes asynchronously, and returns timestamped segments', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/v1/transcriptions')
      .attach('file', samplePath)
      .expect(202);

    expect(createResponse.body).toMatchObject({
      status: TranscriptionStatus.QUEUED,
    });
    expect(createResponse.body.id).toBeDefined();

    const jobId = createResponse.body.id as string;
    let body: {
      status: string;
      result?: {
        text: string;
        segments: Array<{ start: number; end: number; text: string }>;
      };
    } = { status: TranscriptionStatus.QUEUED };

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const poll = await request(app.getHttpServer())
        .get(`/v1/transcriptions/${jobId}`)
        .expect(200);
      body = poll.body as typeof body;
      if (
        body.status === TranscriptionStatus.COMPLETED ||
        body.status === TranscriptionStatus.FAILED
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(body.status).toBe(TranscriptionStatus.COMPLETED);
    expect(body.result?.text).toBe('This is a mock transcription.');
    expect(body.result?.segments?.length).toBeGreaterThan(0);
    expect(body.result?.segments?.[0]).toEqual({
      start: 0,
      end: 2.5,
      text: 'This is a mock transcription.',
    });
  }, 15000);
});
