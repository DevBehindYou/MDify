import type { FileStatus } from '@/types';

const MAP: Record<FileStatus, { dot: string; text: string }> = {
  pending: { dot: 'bg-zinc-500', text: 'Pending' },
  converting: { dot: 'bg-amber-400 animate-pulse', text: 'Converting…' },
  done: { dot: 'bg-emerald-500', text: 'Done' },
  error: { dot: 'bg-red-500', text: 'Error' },
};

export function StatusBadge({ status }: { status: FileStatus }) {
  const cfg = MAP[status] ?? MAP.pending;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-none ${cfg.dot}`} aria-hidden />
      <span className="text-[10px] t-muted font-medium">{cfg.text}</span>
    </span>
  );
}
