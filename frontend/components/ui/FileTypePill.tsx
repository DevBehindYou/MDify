import { getMeta } from '@/lib/config';

export function FileTypePill({ filename }: { filename: string }) {
  const meta = getMeta(filename);
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
      style={{ color: meta.color, backgroundColor: `${meta.color}18` }}
    >
      {meta.label}
    </span>
  );
}
