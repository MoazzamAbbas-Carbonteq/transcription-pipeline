import { IsUUID } from 'class-validator';

export class TranscriptionIdParamDto {
  @IsUUID('4')
  id!: string;
}
