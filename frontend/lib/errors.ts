// Error model mirroring backend/app/core/errors.py. The API client throws
// ApiError so the UI can branch on `code` and show a specific message instead
// of a generic "Something went wrong."

export type ErrorCode =
  | 'INVALID_FILE'
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'UPLOAD_FAILED'
  | 'CONVERSION_FAILED'
  | 'CONVERSION_TIMEOUT'
  | 'RATE_LIMITED'
  | 'STORAGE_ERROR'
  | 'BACKEND_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

const MESSAGES: Record<ErrorCode, string> = {
  INVALID_FILE: 'This file is invalid or empty.',
  UNSUPPORTED_FORMAT: 'This file type is not supported.',
  FILE_TOO_LARGE: 'This file is too large (max 25 MB).',
  UPLOAD_FAILED: 'Upload failed — please try again.',
  CONVERSION_FAILED: 'Could not convert this document.',
  CONVERSION_TIMEOUT: 'Conversion took too long and timed out.',
  RATE_LIMITED: 'Too many requests — wait a moment and retry.',
  STORAGE_ERROR: 'A storage error occurred.',
  BACKEND_UNAVAILABLE: 'The backend is unavailable. Please retry shortly.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
};

export class ApiError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? MESSAGES[code] ?? MESSAGES.UNKNOWN_ERROR);
    this.name = 'ApiError';
    this.code = code;
  }
}

// A short, user-facing message for a code (falls back gracefully).
export const messageForCode = (code: string, fallback?: string): string =>
  MESSAGES[code as ErrorCode] ?? fallback ?? MESSAGES.UNKNOWN_ERROR;
