import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../config/configuration';
import { ValidationAppError } from '../../../common/errors/app.errors';
import { CreateTranscriptionUseCase } from '../application/use-cases/create-transcription.use-case';
import { GetTranscriptionUseCase } from '../application/use-cases/get-transcription.use-case';
import { IdempotencyKeyHeader } from './decorators/idempotency-key-header.decorator';
import { TranscriptionIdParamDto } from './dto/transcription-id-param.dto';
import {
  TranscriptionAcceptedDto,
  TranscriptionResponseDto,
} from './dto/transcription-response.dto';
import { IdempotencyKeyPipe } from './pipes/idempotency-key.pipe';

@ApiTags('transcriptions')
@Controller('v1/transcriptions')
export class TranscriptionController {
  private readonly maxUploadBytes: number;

  constructor(
    private readonly createTranscription: CreateTranscriptionUseCase,
    private readonly getTranscription: GetTranscriptionUseCase,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.maxUploadBytes =
      configService.get('maxUploadSizeMb', { infer: true }) * 1024 * 1024;
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Upload audio and enqueue an asynchronous transcription job',
    description:
      'Accepts WAV, MP3, M4A, MP4, WebM, OGG, FLAC and related formats. ' +
      'Media is validated with ffprobe. The request returns immediately with a job id. ' +
      'Idempotency-Key is required and must be a UUID v4.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Audio or audiovisual file containing an audio stream',
        },
      },
    },
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required UUID v4. Reusing the same key returns the existing job instead of creating a duplicate.',
    schema: {
      type: 'string',
      format: 'uuid',
      example: '550e8400-e29b-41d4-a716-446655440000',
    },
  })
  @ApiAcceptedResponse({ type: TranscriptionAcceptedDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(tmpdir(), 'transcription-uploads'),
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}-${file.originalname}`);
        },
      }),
      limits: {
        files: 1,
        fileSize: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25) * 1024 * 1024,
      },
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @IdempotencyKeyHeader(new IdempotencyKeyPipe()) idempotencyKey: string,
  ): Promise<TranscriptionAcceptedDto> {
    if (!file) {
      throw new ValidationAppError('Multipart field "file" is required');
    }

    try {
      if (file.size > this.maxUploadBytes) {
        throw new ValidationAppError(
          'Uploaded file exceeds the configured maximum size',
          'FILE_TOO_LARGE',
        );
      }

      const result = await this.createTranscription.execute({
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        stream: createReadStream(file.path),
        idempotencyKey,
      });

      return {
        id: result.id,
        status: result.status,
      };
    } finally {
      if (file.path) {
        await fs.unlink(file.path).catch(() => undefined);
      }
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transcription job status and result' })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'Transcription job UUID',
    schema: {
      type: 'string',
      format: 'uuid',
      example: '550e8400-e29b-41d4-a716-446655440000',
    },
  })
  @ApiOkResponse({ type: TranscriptionResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown transcription job id' })
  async get(
    @Param() params: TranscriptionIdParamDto,
  ): Promise<TranscriptionResponseDto> {
    const job = await this.getTranscription.execute(params.id);
    return {
      id: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
    };
  }
}
