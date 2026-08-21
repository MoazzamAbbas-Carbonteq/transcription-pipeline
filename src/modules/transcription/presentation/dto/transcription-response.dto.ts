import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TranscriptionStatus } from '../../domain/transcription-status.enum';

export class TranscriptionSegmentDto {
  @ApiProperty({ example: 0 })
  start!: number;

  @ApiProperty({ example: 3.8 })
  end!: number;

  @ApiProperty({ example: 'Hello and welcome.' })
  text!: string;
}

export class TranscriptionResultDto {
  @ApiProperty({ example: 'Hello and welcome.' })
  text!: string;

  @ApiPropertyOptional({ example: 'en' })
  language?: string;

  @ApiPropertyOptional({ example: 3.8 })
  duration?: number;

  @ApiProperty({ type: [TranscriptionSegmentDto] })
  segments!: TranscriptionSegmentDto[];
}

export class TranscriptionErrorDto {
  @ApiProperty({ example: 'Safe user-facing error' })
  message!: string;
}

export class TranscriptionAcceptedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: TranscriptionStatus,
    example: TranscriptionStatus.QUEUED,
  })
  status!: TranscriptionStatus;
}

export class TranscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TranscriptionStatus })
  status!: TranscriptionStatus;

  @ApiPropertyOptional({ type: TranscriptionResultDto })
  result?: TranscriptionResultDto;

  @ApiPropertyOptional({ type: TranscriptionErrorDto })
  error?: TranscriptionErrorDto;
}
