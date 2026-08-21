import { TranscriptionSegment } from './transcription-segment';

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments: TranscriptionSegment[];
}
