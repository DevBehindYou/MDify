// Centralized configuration and small pure helpers. No React here — this is
// safe to import from anywhere (components, hooks, the API client).

import type { ProfileId } from '@/types';

export const MAX_FILES = 10;

// Mirrors backend/app/pipeline/profiles.py.
export interface ProfileOption {
  id: ProfileId;
  label: string;
  hint: string;
}

export const PROFILES: ProfileOption[] = [
  { id: 'standard', label: 'Standard', hint: 'Faithful. Whitespace normalized only.' },
  { id: 'clean', label: 'Clean', hint: 'Strip HTML artifacts, tighten whitespace.' },
  { id: 'compact', label: 'Compact', hint: 'Clean + drop images & repeated headers/footers.' },
  { id: 'rag_ready', label: 'RAG-ready', hint: 'Normalized headings, boilerplate removed. LLM-ready.' },
];

export const DEFAULT_PROFILE: ProfileId = 'standard';

// Direct backend origin, used only for the fire-and-forget cold-start wake
// ping. All real requests go through the Next.js proxy (see next.config.js),
// so this may be empty in local dev.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

// Proxied API paths (Next rewrites these to the backend's /api/v1/*).
export const API_HEALTH = '/api/health';
export const API_CONVERT = '/api/convert';

// Mirrors backend/app/formats.py ALLOWED_EXTENSIONS.
export const ACCEPTED_EXTENSIONS = [
  '.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.epub',
  '.html', '.htm', '.txt', '.md', '.csv', '.tsv', '.json', '.xml',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp',
];

interface ExtMeta {
  label: string;
  color: string;
}

const EXT_META: Record<string, ExtMeta> = {
  pdf:  { label: 'PDF',        color: '#F43F5E' },
  docx: { label: 'Word',       color: '#3B82F6' },
  pptx: { label: 'PowerPoint', color: '#F97316' },
  xlsx: { label: 'Excel',      color: '#22C55E' },
  xls:  { label: 'Excel',      color: '#22C55E' },
  epub: { label: 'ePub',       color: '#C084FC' },
  html: { label: 'HTML',       color: '#A78BFA' },
  htm:  { label: 'HTML',       color: '#A78BFA' },
  txt:  { label: 'Text',       color: '#94A3B8' },
  md:   { label: 'Markdown',   color: '#94A3B8' },
  csv:  { label: 'CSV',        color: '#2DD4BF' },
  tsv:  { label: 'TSV',        color: '#2DD4BF' },
  json: { label: 'JSON',       color: '#FBBF24' },
  xml:  { label: 'XML',        color: '#FB923C' },
  jpg:  { label: 'Image',      color: '#60A5FA' },
  jpeg: { label: 'Image',      color: '#60A5FA' },
  png:  { label: 'Image',      color: '#60A5FA' },
  gif:  { label: 'Image',      color: '#60A5FA' },
  bmp:  { label: 'Image',      color: '#60A5FA' },
  tiff: { label: 'Image',      color: '#60A5FA' },
  tif:  { label: 'Image',      color: '#60A5FA' },
  webp: { label: 'Image',      color: '#60A5FA' },
};

const DEFAULT_META: ExtMeta = { label: 'File', color: '#6B7280' };

export const getExt = (filename: string): string =>
  filename.split('.').pop()?.toLowerCase() ?? '';

export const getMeta = (filename: string): ExtMeta =>
  EXT_META[getExt(filename)] ?? DEFAULT_META;

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const uid = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
