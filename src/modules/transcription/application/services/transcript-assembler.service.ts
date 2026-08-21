import { Injectable } from '@nestjs/common';
import { ValidationAppError } from '../../../../common/errors/app.errors';
import { TranscriptionResult } from '../../domain/transcription-result';
import { TranscriptionSegment } from '../../domain/transcription-segment';
import { ProviderTranscriptionResult } from '../../domain/ports/transcription-provider.port';

export interface ChunkTranscription {
  offsetSeconds: number;
  providerResult: ProviderTranscriptionResult;
  overlapSeconds: number;
}

@Injectable()
export class TranscriptAssemblerService {
  assemble(chunks: ChunkTranscription[]): TranscriptionResult {
    const absoluteSegments: TranscriptionSegment[] = [];
    let language: string | undefined;
    let maxEnd = 0;

    for (const chunk of chunks) {
      language = language ?? chunk.providerResult.language;

      for (const segment of chunk.providerResult.segments) {
        const normalized = this.normalizeSegment(
          segment.start,
          segment.end,
          segment.text,
          chunk.offsetSeconds,
        );
        absoluteSegments.push(normalized);
        maxEnd = Math.max(maxEnd, normalized.end);
      }

      if (typeof chunk.providerResult.duration === 'number') {
        maxEnd = Math.max(
          maxEnd,
          chunk.offsetSeconds + chunk.providerResult.duration,
        );
      }
    }

    const deduped = this.dedupeOverlap(absoluteSegments, chunks);
    const ordered = [...deduped].sort((a, b) => {
      if (a.start === b.start) {
        return a.end - b.end;
      }
      return a.start - b.start;
    });

    const text = ordered
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      text,
      language,
      duration: maxEnd > 0 ? Number(maxEnd.toFixed(3)) : undefined,
      segments: ordered,
    };
  }

  applyOffset(
    providerResult: ProviderTranscriptionResult,
    offsetSeconds: number,
  ): TranscriptionSegment[] {
    return providerResult.segments.map((segment) =>
      this.normalizeSegment(
        segment.start,
        segment.end,
        segment.text,
        offsetSeconds,
      ),
    );
  }

  private normalizeSegment(
    start: number,
    end: number,
    text: string,
    offsetSeconds: number,
  ): TranscriptionSegment {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new ValidationAppError('Provider returned non-numeric timestamps');
    }
    if (start < 0 || end < 0) {
      throw new ValidationAppError('Provider returned negative timestamps');
    }
    if (end < start) {
      throw new ValidationAppError(
        'Provider returned invalid timestamp range (end < start)',
      );
    }

    return {
      start: Number((offsetSeconds + start).toFixed(3)),
      end: Number((offsetSeconds + end).toFixed(3)),
      text: text.trim(),
    };
  }

  /**
   * Simple deterministic overlap handling:
   * drop segments that sit entirely inside a previous chunk's overlap window
   * and match already-emitted text. Ambiguous segments are retained.
   */
  private dedupeOverlap(
    segments: TranscriptionSegment[],
    chunks: ChunkTranscription[],
  ): TranscriptionSegment[] {
    if (chunks.length <= 1) {
      return segments;
    }

    const overlapWindows = chunks
      .slice(1)
      .map((chunk) => ({
        start: chunk.offsetSeconds,
        end: chunk.offsetSeconds + Math.max(chunk.overlapSeconds, 0),
      }))
      .filter((window) => window.end > window.start);

    if (overlapWindows.length === 0) {
      return segments;
    }

    const kept: TranscriptionSegment[] = [];
    const seenTextInWindow = new Set<string>();

    for (const segment of segments) {
      const inOverlap = overlapWindows.some(
        (window) => segment.start >= window.start && segment.end <= window.end,
      );

      if (!inOverlap) {
        kept.push(segment);
        seenTextInWindow.add(this.normalizeText(segment.text));
        continue;
      }

      const key = this.normalizeText(segment.text);
      if (seenTextInWindow.has(key)) {
        continue;
      }

      kept.push(segment);
      seenTextInWindow.add(key);
    }

    return kept;
  }

  private normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
