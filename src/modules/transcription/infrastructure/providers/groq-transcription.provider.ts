import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
  toFile,
} from 'groq-sdk';
import { AppConfig } from '../../../../config/configuration';
import {
  PermanentProviderError,
  TransientProviderError,
} from '../../../../common/errors/app.errors';
import {
  ProviderTranscriptionResult,
  ProviderTranscriptionSegment,
  TranscriptionInput,
  TranscriptionProviderPort,
} from '../../domain/ports/transcription-provider.port';

interface GroqVerboseSegment {
  start?: number;
  end?: number;
  text?: string;
}

interface GroqVerboseTranscription {
  text?: string;
  language?: string;
  duration?: number;
  segments?: GroqVerboseSegment[];
}

@Injectable()
export class GroqTranscriptionProvider implements TranscriptionProviderPort {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqTranscriptionProvider.name);
  private readonly client: Groq;
  private readonly model: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const apiKey = this.configService.get('groqApiKey', { infer: true });
    this.model = this.configService.get('transcriptionModel', { infer: true });
    this.client = new Groq({ apiKey });
  }

  async transcribe(
    input: TranscriptionInput,
  ): Promise<ProviderTranscriptionResult> {
    const filename = input.filename ?? basename(input.audioPath);

    this.logger.log({
      message: 'Calling Groq transcription API',
      provider: this.name,
      model: this.model,
      filename,
    });

    try {
      const response = (await this.client.audio.transcriptions.create({
        file: await toFile(createReadStream(input.audioPath), filename),
        model: this.model,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      })) as GroqVerboseTranscription;

      return this.mapResponse(response);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** Visible for unit tests — maps provider payload to application types only. */
  mapResponse(response: GroqVerboseTranscription): ProviderTranscriptionResult {
    const segments = (response.segments ?? [])
      .map((segment) => this.mapSegment(segment))
      .filter((segment): segment is ProviderTranscriptionSegment =>
        Boolean(segment),
      );

    return {
      text: (response.text ?? '').trim(),
      language: response.language,
      duration: response.duration,
      segments,
    };
  }

  private mapSegment(
    segment: GroqVerboseSegment,
  ): ProviderTranscriptionSegment | null {
    if (
      typeof segment.start !== 'number' ||
      typeof segment.end !== 'number' ||
      typeof segment.text !== 'string'
    ) {
      return null;
    }

    return {
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
    };
  }

  private mapError(error: unknown): Error {
    if (error instanceof AuthenticationError) {
      return new PermanentProviderError(
        'Transcription provider authentication failed',
        'PROVIDER_AUTH_ERROR',
      );
    }

    if (error instanceof BadRequestError) {
      return new PermanentProviderError(
        'Transcription provider rejected the request',
        'PROVIDER_BAD_REQUEST',
      );
    }

    if (error instanceof RateLimitError) {
      return new TransientProviderError(
        'Transcription provider rate limit exceeded',
        this.extractRetryAfterMs(error),
        'PROVIDER_RATE_LIMIT',
      );
    }

    if (
      error instanceof APIConnectionTimeoutError ||
      error instanceof APIConnectionError
    ) {
      return new TransientProviderError(
        'Temporary network failure talking to transcription provider',
      );
    }

    if (error instanceof APIError) {
      const status = error.status;
      if (status !== undefined && status >= 500) {
        return new TransientProviderError(
          'Transcription provider is temporarily unavailable',
          this.extractRetryAfterMs(error),
        );
      }
      if (status === 429) {
        return new TransientProviderError(
          'Transcription provider rate limit exceeded',
          this.extractRetryAfterMs(error),
          'PROVIDER_RATE_LIMIT',
        );
      }
      if (status !== undefined && status >= 400 && status < 500) {
        return new PermanentProviderError(
          'Transcription provider rejected the request',
        );
      }
    }

    return new TransientProviderError(
      'Unexpected transcription provider failure',
    );
  }

  private extractRetryAfterMs(error: {
    headers?: Headers | Record<string, string> | null;
  }): number | undefined {
    const headers = error.headers;
    if (!headers) {
      return undefined;
    }

    const header =
      typeof (headers as Headers).get === 'function'
        ? (headers as Headers).get('retry-after')
        : (headers as Record<string, string>)['retry-after'];

    if (!header) {
      return undefined;
    }

    const asSeconds = Number(header);
    if (!Number.isNaN(asSeconds)) {
      return Math.max(0, asSeconds * 1000);
    }

    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) {
      return Math.max(0, asDate - Date.now());
    }

    return undefined;
  }
}
