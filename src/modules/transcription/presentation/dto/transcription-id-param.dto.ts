import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TranscriptionIdParamDto {
  @ApiProperty({
    name: 'id',
    description: 'Transcription job UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id!: string;
}
