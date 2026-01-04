
export interface ChapterMarker {
  title: string;
  start_time_seconds: number;
}

export interface SlicedChapter extends ChapterMarker {
  id: string;
  end_time_seconds?: number;
  blob?: Blob;
  url?: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
}

export interface ProcessingState {
  isUploading: boolean;
  isAnalyzing: boolean;
  isSlicing: boolean;
  error: string | null;
  progress: number;
}
