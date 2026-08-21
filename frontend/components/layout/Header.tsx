'use client';

import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { MAX_FILES } from '@/lib/config';
import type { ServerStatus } from '@/types';

interface Props {
  fileCount: number;
  serverStatus: ServerStatus;
  countdown: number | null;
  onRetry: () => void;
}

function statusText(status: ServerStatus, countdown: number | null): string {
  if (status === 'online') return 'Backend ready';
  if (status === 'checking') return 'Connecting…';
  if (countdown !== null && countdown > 0) return `Waking up… ${countdown}s`;
  return 'Backend offline';
}

export function Header({ fileCount, serverStatus, countdown, onRetry }: Props) {
  const dotClass =
    serverStatus === 'online'
      ? 'bg-emerald-500'
      : countdown !== null
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500';

  return (
    <header className="glass interactive flex-none flex items-center justify-between gap-3 px-4 py-2.5 m-3 mb-0">
      {/* Left: brand + refractive breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 flex-none">
          <div
            className="w-8 h-8 rounded-lg grid place-items-center font-extrabold text-base flex-none"
            style={{
              color: 'var(--accent-ink)',
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              boxShadow: '0 4px 14px rgba(245,158,11,.4), inset 0 1px 0 rgba(255,255,255,.5)',
            }}
          >
            M
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold t-text tracking-tight m-0">MDify Pro</h1>
            <p className="text-[10px] t-muted m-0">Document → Markdown</p>
          </div>
        </div>

        <Breadcrumb
          items={[
            { label: 'Converter', href: '/', current: true },
            { label: 'Why Use It?', href: '/usecase' },
          ]}
        />
      </div>

      {/* Right: backend status · file count · theme toggle */}
      <div className="flex items-center gap-3 flex-none">
        <button
          type="button"
          onClick={onRetry}
          className="hidden sm:flex items-center gap-1.5 text-[11px] hover:opacity-80 transition-opacity"
          title="Click to retry backend connection"
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-none ${dotClass}`} aria-hidden />
          <span className="t-muted" role="status" aria-live="polite">
            {statusText(serverStatus, countdown)}
          </span>
        </button>

        <div className="hidden md:flex items-center gap-1 text-[11px] t-faint">
          <span style={{ fontFamily: 'var(--mono)' }}>
            {fileCount}/{MAX_FILES}
          </span>
          <span>files</span>
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
