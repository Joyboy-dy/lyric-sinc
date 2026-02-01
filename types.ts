export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  score?: number;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
}

export interface AlignmentResult {
  srt_content: string;
  word_segments: WordTimestamp[]; // Flattened list of all words
  full_json: {
    segments: Segment[];
  };
}

export type ProcessingStep = 'idle' | 'uploading' | 'transcribing' | 'aligning' | 'completed' | 'error';

export interface ProcessingState {
  step: ProcessingStep;
  message?: string;
  progress?: number;
}