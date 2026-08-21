export interface MediaInspection {
  durationSeconds: number;
  hasAudio: boolean;
  formatName: string;
  codecName?: string;
  sampleRate?: number;
  channels?: number;
}

export interface AudioChunk {
  chunkPath: string;
  offsetSeconds: number;
  durationSeconds: number;
  index: number;
}

export interface NormalizedAudio {
  path: string;
  durationSeconds: number;
}

export interface JobWorkspace {
  jobId: string;
  rootDir: string;
  originalPath: string;
}

export interface AudioProcessorPort {
  createWorkspace(
    jobId: string,
    originalFilename: string,
  ): Promise<JobWorkspace>;
  inspect(filePath: string): Promise<MediaInspection>;
  normalize(inputPath: string, outputPath: string): Promise<NormalizedAudio>;
  splitIntoChunks(
    normalizedPath: string,
    outputDir: string,
    chunkDurationSeconds: number,
    overlapSeconds: number,
  ): Promise<AudioChunk[]>;
  cleanup(rootDir: string): Promise<void>;
}

export const AUDIO_PROCESSOR = Symbol('AUDIO_PROCESSOR');
