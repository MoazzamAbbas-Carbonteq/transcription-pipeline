import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsIn(['mock', 'groq'])
  TRANSCRIPTION_PROVIDER!: string;

  @IsOptional()
  @IsString()
  GROQ_API_KEY?: string;

  @IsOptional()
  @IsString()
  TRANSCRIPTION_MODEL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  MAX_UPLOAD_SIZE_MB?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  AUDIO_CHUNK_DURATION_SECONDS?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  AUDIO_CHUNK_OVERLAP_SECONDS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  TRANSCRIPTION_CONCURRENCY?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  TRANSCRIPTION_MAX_RETRIES?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  TRANSCRIPTION_RETRY_BASE_DELAY_MS?: number;

  @IsOptional()
  @IsString()
  TEMP_DIR?: string;

  @IsOptional()
  @IsString()
  FFMPEG_PATH?: string;

  @IsOptional()
  @IsString()
  FFPROBE_PATH?: string;
}

function coerceEnv(config: Record<string, unknown>): Record<string, unknown> {
  const numericKeys = [
    'PORT',
    'MAX_UPLOAD_SIZE_MB',
    'AUDIO_CHUNK_DURATION_SECONDS',
    'AUDIO_CHUNK_OVERLAP_SECONDS',
    'TRANSCRIPTION_CONCURRENCY',
    'TRANSCRIPTION_MAX_RETRIES',
    'TRANSCRIPTION_RETRY_BASE_DELAY_MS',
  ];

  const next = { ...config };
  for (const key of numericKeys) {
    const value = next[key];
    if (typeof value === 'string' && value.trim() !== '') {
      next[key] = Number(value);
    }
  }
  return next;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(
    EnvironmentVariables,
    coerceEnv({
      TRANSCRIPTION_PROVIDER: 'mock',
      ...config,
    }),
    {
      enableImplicitConversion: false,
    },
  );

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Configuration validation failed: ${messages}`);
  }

  if (
    validated.TRANSCRIPTION_PROVIDER === 'groq' &&
    !(validated.GROQ_API_KEY && validated.GROQ_API_KEY.trim().length > 0)
  ) {
    throw new Error(
      'Configuration validation failed: GROQ_API_KEY is required when TRANSCRIPTION_PROVIDER=groq',
    );
  }

  return validated;
}
