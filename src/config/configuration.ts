export type TranscriptionProviderName = 'mock' | 'groq';

export interface AppConfig {
  port: number;
  transcriptionProvider: TranscriptionProviderName;
  groqApiKey: string;
  transcriptionModel: string;
  maxUploadSizeMb: number;
  audioChunkDurationSeconds: number;
  audioChunkOverlapSeconds: number;
  transcriptionConcurrency: number;
  transcriptionMaxRetries: number;
  transcriptionRetryBaseDelayMs: number;
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  transcriptionProvider: (process.env.TRANSCRIPTION_PROVIDER ??
    'mock') as TranscriptionProviderName,
  groqApiKey: process.env.GROQ_API_KEY ?? '',
  transcriptionModel:
    process.env.TRANSCRIPTION_MODEL ?? 'whisper-large-v3-turbo',
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '25', 10),
  audioChunkDurationSeconds: parseInt(
    process.env.AUDIO_CHUNK_DURATION_SECONDS ?? '600',
    10,
  ),
  audioChunkOverlapSeconds: parseInt(
    process.env.AUDIO_CHUNK_OVERLAP_SECONDS ?? '2',
    10,
  ),
  transcriptionConcurrency: parseInt(
    process.env.TRANSCRIPTION_CONCURRENCY ?? '2',
    10,
  ),
  transcriptionMaxRetries: parseInt(
    process.env.TRANSCRIPTION_MAX_RETRIES ?? '3',
    10,
  ),
  transcriptionRetryBaseDelayMs: parseInt(
    process.env.TRANSCRIPTION_RETRY_BASE_DELAY_MS ?? '500',
    10,
  ),
  tempDir: process.env.TEMP_DIR ?? '/tmp/transcription',
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
});
