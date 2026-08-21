import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileTypePill } from '@/components/ui/FileTypePill';
import { formatSize, getMeta } from '@/lib/config';
import type { FileItem } from '@/types';

interface Props {
  item: FileItem;
  onConvert: (item: FileItem) => void;
  onRemove: (id: string) => void;
}

export function FileRow({ item, onConvert, onRemove }: Props) {
  const isActive = item.status === 'converting';
  return (
    <div
      className="glass interactive group flex items-center gap-3 px-3 py-2.5 animate-slide-up"
      style={{
        borderRadius: 14,
        borderColor: isActive ? 'color-mix(in srgb, var(--accent) 34%, transparent)' : undefined,
      }}
    >
      <div
        className="w-0.5 h-7 rounded-full flex-none"
        style={{ backgroundColor: getMeta(item.file.name).color }}
        aria-hidden
      />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium t-text truncate leading-tight">{item.file.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <FileTypePill filename={item.file.name} />
          <StatusBadge status={item.status} />
          {item.status === 'pending' && (
            <span className="text-[10px] t-faint">{formatSize(item.file.size)}</span>
          )}
          {item.status === 'error' && item.errorMsg && (
            <span className="text-[10px] text-red-400 truncate max-w-[140px]" title={item.errorMsg} role="alert">
              {item.errorMsg}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-none opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {item.status === 'pending' && (
          <button
            type="button"
            onClick={() => onConvert(item)}
            className="text-[10px] font-medium px-2 py-1 rounded-md t-accent transition-colors"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
          >
            Convert
          </button>
        )}
        {item.status === 'error' && (
          <button
            type="button"
            onClick={() => onConvert(item)}
            className="text-[10px] font-medium px-2 py-1 rounded-md t-muted surface-soft transition-colors"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="w-6 h-6 flex items-center justify-center rounded-md t-faint hover:[color:var(--text)] transition-colors text-base leading-none"
          aria-label={`Remove ${item.file.name}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
