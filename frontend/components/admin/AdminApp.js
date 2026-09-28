'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import AppIcon from '../AppIcon';
import { relativeTime } from '../../lib/models/adminFormat';
import { useAdminNotice, useAdminSessionViewModel } from '../../viewmodels/useAdminViewModel';
import AdminLogin from './AdminLogin';
import JobsPanel from './JobsPanel';
import { AuditPanel, FilesPanel, ProcessesPanel } from './ListPanels';
import OverviewPanel from './OverviewPanel';
import { Button } from './ui';

const TABS = [
  { id: 'overview', label: 'Overview', Panel: OverviewPanel },
  { id: 'jobs', label: 'Jobs', Panel: JobsPanel },
  { id: 'files', label: 'Files', Panel: FilesPanel },
  { id: 'processes', label: 'Processes', Panel: ProcessesPanel },
  { id: 'audit', label: 'Audit log', Panel: AuditPanel },
];

function Centered({ children }) {
  return <div className="min-h-dvh flex items-center justify-center px-4 bg-[var(--bg)] text-[var(--muted)] text-[13px]">{children}</div>;
}

/** /mdify-controller: two-key sign-in, then the admin tabs. */
export default function AdminApp() {
  const session = useAdminSessionViewModel();
  const { notice, notify, dismiss } = useAdminNotice();
  const [tab, setTab] = useState('overview');

  if (session.state === 'loading') return <Centered>Loading…</Centered>;
  if (session.state === 'unconfigured') {
    return (
      <Centered>
        <p className="max-w-sm text-center m-0">
          The controller is not configured on this deployment (see docs/GO_LIVE.md).
        </p>
      </Centered>
    );
  }
  if (session.state === 'signed-out') return <AdminLogin onLogin={session.login} busy={session.busy} error={session.error} />;

  const Active = TABS.find((t) => t.id === tab)?.Panel || OverviewPanel;

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-4 h-[52px] flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-inherit no-underline min-w-0">
            <AppIcon size={28} className="rounded-[7px]" />
            <b className="text-[15px] tracking-tight truncate">MDify controller</b>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-tech text-[11px] text-[var(--faint)]">session ends {relativeTime(session.expiresAt)}</span>
            <Button onClick={session.logout}>Sign out</Button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-2 sm:px-4 flex gap-1 overflow-x-auto" aria-label="Controller sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`shrink-0 px-3 py-2 text-[12.5px] border-b-2 cursor-pointer transition-colors ${
                tab === t.id ? 'border-amber-500 text-[var(--text)] font-medium' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        <Active handleError={session.handleError} notify={notify} />
      </main>

      {notice ? (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-32px)] flex items-center gap-3 rounded-lg border px-3 py-2 text-[12.5px] shadow-lg ${
            notice.tone === 'error'
              ? 'border-rose-500/50 bg-[var(--surface)] text-rose-600 dark:text-rose-400'
              : 'border-emerald-500/50 bg-[var(--surface)] text-emerald-700 dark:text-emerald-400'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="cursor-pointer text-[var(--faint)]">
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
