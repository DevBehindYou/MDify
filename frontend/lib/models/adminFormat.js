// Display helpers for the admin screens.

export function formatBytes(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  const v = Number(ms);
  if (v < 1000) return `${Math.round(v)} ms`;
  if (v < 60_000) return `${(v / 1000).toFixed(1)} s`;
  return `${Math.floor(v / 60_000)} min ${Math.round((v % 60_000) / 1000)} s`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "in 5 h", "3 min ago". */
export function relativeTime(value, now = Date.now()) {
  if (!value) return '—';
  const diff = new Date(value).getTime() - now;
  if (Number.isNaN(diff)) return '—';
  const abs = Math.abs(diff);
  const unit = abs < 3_600_000 ? [60_000, 'min'] : abs < 172_800_000 ? [3_600_000, 'h'] : [86_400_000, 'd'];
  const n = Math.max(1, Math.round(abs / unit[0]));
  return diff >= 0 ? `in ${n} ${unit[1]}` : `${n} ${unit[1]} ago`;
}

export const shortId = (id) => (id ? String(id).slice(0, 8) : '—');

/** Tailwind classes for a status badge. */
export function statusTone(status) {
  switch (status) {
    case 'COMPLETED':
    case 'DONE':
    case 'SUCCEEDED':
    case 'ACTIVE':
    case 'ready':
      return 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    case 'FAILED':
    case 'ERROR':
    case 'PARTIAL':
    case 'unreachable':
    case 'timeout':
      return 'text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10';
    case 'PROCESSING':
    case 'RUNNING':
    case 'QUEUED':
    case 'PENDING':
    case 'UPLOADING':
    case 'BLOCKED':
    case 'not_ready':
      return 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10';
    default:
      return 'text-[var(--muted)] border-[var(--border)] bg-[var(--panel)]';
  }
}
