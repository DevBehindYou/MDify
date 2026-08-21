// Shared domain types for MDify Pro. These mirror the backend schemas in
// backend/app/schemas/conversion.py — keep the two in sync.

export type FileStatus = 'pending' | 'converting' | 'done' | 'error';

// Explicit backend lifecycle the UI reflects (no infinite generic spinner).
export type ServerStatus = 'checking' | 'starting' | 'online' | 'offline';

export type ProfileId = 'standard' | 'clean' | 'compact' | 'rag_ready';

export interface DocumentStats {
  char_count: number;
  word_count: number;
  line_count: number;
  input_bytes: number;
  output_bytes: number;
  tokenizer: string;
  estimated_tokens: number;
  estimated_tokens_source: number;
  token_reduction_pct: number;
}

export type IssueSeverity = 'info' | 'warning' | 'error';

export interface QualityIssue {
  type: string;
  severity: IssueSeverity;
  message: string;
  line: number | null;
}

export interface QualitySummary {
  quality_score: number;
  headings: number;
  tables: number;
  links: number;
  images: number;
  code_blocks: number;
  structure_warning: boolean;
  issues: QualityIssue[];
}

export interface ConversionResult {
  filename: string;
  original_name: string;
  content: string;
  format: string;
  profile: string;
  stats: DocumentStats;
  quality: QualitySummary;
  duration_ms: number;
}

// A queued file plus its UI state.
export interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  errorMsg?: string;
}

// A completed conversion tied back to its queue item.
export interface ResultItem extends ConversionResult {
  id: string;
}
