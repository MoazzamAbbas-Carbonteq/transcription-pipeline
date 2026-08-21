import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTranscriptionHeadersDto } from '../dto/create-transcription-headers.dto';

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const dto = plainToInstance(CreateTranscriptionHeadersDto, {
      idempotencyKey: value.trim(),
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message =
        Object.values(errors[0]?.constraints ?? {})[0] ??
        'Idempotency-Key must be a valid UUID v4';
      throw new BadRequestException(message);
    }

    return dto.idempotencyKey;
  }
}
