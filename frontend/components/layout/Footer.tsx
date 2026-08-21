import { MAX_FILES } from '@/lib/config';

export function Footer({ doneCount }: { doneCount: number }) {
  return (
    <div className="glass flex-none flex items-center justify-between gap-3 px-4 py-2 m-3 mt-0 text-[10px] t-muted flex-wrap">
      <div className="flex items-center gap-3">
        <span>MDify Pro</span>
        <span className="t-faint">·</span>
        <a
          href="https://github.com/DevBehindYou"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:[color:var(--accent)] transition-colors"
        >
          DevBehindYou
        </a>
        <span className="t-faint">·</span>
        <span>Powered by MarkItDown</span>
      </div>
      <div className="flex items-center gap-3">
        {doneCount > 0 && (
          <span className="text-emerald-500">
            {doneCount} file{doneCount !== 1 ? 's' : ''} converted
          </span>
        )}
        <span>Up to {MAX_FILES} files per session</span>
      </div>
    </div>
  );
}
