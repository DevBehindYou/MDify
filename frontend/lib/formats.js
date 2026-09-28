// Format rules shared by the conversion route (server) and the upload queue
// (browser). Keep this module dependency-free so importing it never pulls a
// converter library into the client bundle.

// Documents go to the normal pool (backendN: N1/N2, MarkItDown).
export const NORMAL_EXTENSIONS = [
  'txt', 'md', 'markdown',
  'csv', 'tsv', 'json', 'xml',
  'html', 'htm',
  'pdf', 'docx', 'xlsx', 'xls', 'pptx', 'epub',
];

// Images go to the OCR pool (backendO: O1/O2, Tesseract).
export const OCR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'bmp', 'gif'];

// Archives go to the archive pool (backendZ: Z1/Z2): code, documents and
// images inside are converted into one project result.
export const ARCHIVE_EXTENSIONS = ['zip'];

export const SUPPORTED_EXTENSIONS = [...NORMAL_EXTENSIONS, ...OCR_EXTENSIONS, ...ARCHIVE_EXTENSIONS];

// Byte limits per pool (archives count as documents). The backends enforce the same values
// (DEFAULT_MAX_UPLOAD_BYTES in backend*/app/common/config.py). OCR memory
// depends on decoded pixels, which backendO caps separately (25 MP).
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // documents, 15MB
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // images, 10MB

/** Byte limit for a file with this extension. */
export function maxFileSizeFor(ext) {
  return OCR_EXTENSIONS.includes(ext) ? MAX_IMAGE_FILE_SIZE : MAX_FILE_SIZE;
}

/** User-facing message for a file over its limit. */
export function sizeLimitMessage(ext) {
  const mb = maxFileSizeFor(ext) / (1024 * 1024);
  return OCR_EXTENSIONS.includes(ext) ? `Images are limited to ${mb}MB` : `Exceeds the ${mb}MB limit`;
}

export const MAX_QUEUE_FILES = 20;

export const PROFILES = ['Standard', 'Clean', 'Compact', 'RAG-ready'];

/** Value for the file picker's `accept` attribute. */
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/**
 * Splits a client-supplied file name into its safe base name, lowercase
 * extension and stem. Any path component is dropped so a crafted
 * "../../etc/passwd"-style name can't leak into a response.
 */
export function splitFileName(name) {
  const base = String(name || 'unknown').split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return { base, ext: '', stem: base };
  return { base, ext: base.slice(dot + 1).toLowerCase(), stem: base.slice(0, dot) };
}

export function isSupportedExtension(ext) {
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/** Backend pool for a file extension: 'ocr', 'normal', 'archive', or null if unsupported. */
export function poolForExtension(ext) {
  if (OCR_EXTENSIONS.includes(ext)) return 'ocr';
  if (NORMAL_EXTENSIONS.includes(ext)) return 'normal';
  if (ARCHIVE_EXTENSIONS.includes(ext)) return 'archive';
  return null;
}

/**
 * Returns a user-facing reason why this file can't be converted, or null if
 * it passes the cheap checks. The server repeats these checks — this only
 * saves a round trip for files that are certain to be rejected.
 */
export function validateUpload({ name, size }) {
  const { ext } = splitFileName(name);
  if (!isSupportedExtension(ext)) return `Unsupported format: .${ext || 'unknown'}`;
  if (size === 0) return 'The file is empty';
  if (size > maxFileSizeFor(ext)) return sizeLimitMessage(ext);
  return null;
}
