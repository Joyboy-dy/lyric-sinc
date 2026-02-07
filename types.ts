export interface SrtResult {
  srt_content: string;
}

export type ProcessingStep = 'idle' | 'uploading' | 'generating' | 'translating' | 'completed' | 'error';

export interface ProcessingState {
  step: ProcessingStep;
  message?: string;
  progress?: number;
}
