export interface SrtResult {
  srt_content: string;
}

export type ProcessingStep = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

export interface ProcessingState {
  step: ProcessingStep;
  message?: string;
  progress?: number;
}
