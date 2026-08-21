export interface ProviderTranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface ProviderTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments: ProviderTranscriptionSegment[];
}

export interface TranscriptionInput {
  audioPath: string;
  mimeType?: string;
  filename?: string;
}

export interface TranscriptionProviderPort {
  readonly name: string;
  transcribe(input: TranscriptionInput): Promise<ProviderTranscriptionResult>;
}

export const TRANSCRIPTION_PROVIDER = Symbol('TRANSCRIPTION_PROVIDER');
