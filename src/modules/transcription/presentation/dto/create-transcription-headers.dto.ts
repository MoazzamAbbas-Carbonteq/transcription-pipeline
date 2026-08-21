import { IsUUID } from 'class-validator';

/**
 * Validated shape for the required Idempotency-Key request header.
 * Swagger documents this via @ApiHeader on the controller (single field).
 */
export class CreateTranscriptionHeadersDto {
  @IsUUID('4', { message: 'Idempotency-Key must be a valid UUID v4' })
  idempotencyKey!: string;
}
