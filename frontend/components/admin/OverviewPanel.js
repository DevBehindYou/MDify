'use client';

import React from 'react';
import { adminApi } from '../../lib/models/adminApi';
import { formatBytes, formatMs } from '../../lib/models/adminFormat';
import { useAdminResource } from '../../viewmodels/useAdminViewModel';
import { Button, Card, ErrorLine, Stat } from './ui';

export default function OverviewPanel({ handleError }) {
  const { data, loading, error, reload } = useAdminResource(adminApi.overview, { handleError, refreshMs: 30_000 });
  const k = data?.kpis || {};
  const s = data?.storage || {};
  const usedPct = s.used_bytes != null && s.budget_bytes ? Math.min(100, Math.round((s.used_bytes / s.budget_bytes) * 100)) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-[12px] text-[var(--faint)]">Refreshes every 30 s while this tab is open.</p>
        <Button onClick={reload} busy={loading}>
          Refresh
        </Button>
      </div>
      <ErrorLine error={error} onRetry={reload} />

      <Card title="Jobs today">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Started" value={k.jobs?.today} />
          <Stat label="Completed" value={k.jobs?.completed_today} />
          <Stat label="Failed" value={k.jobs?.failed_today} tone={k.jobs?.failed_today ? 'bad' : undefined} />
          <Stat label="Partial results" value={k.jobs?.partial_today} tone={k.jobs?.partial_today ? 'warn' : undefined} hint="skipped or failed parts" />
          <Stat label="Processing now" value={k.jobs?.processing} />
          <Stat label="Queued now" value={k.jobs?.queued} />
          <Stat label="Avg time" value={formatMs(k.performance?.avg_processing_ms_today)} />
          <Stat label="p95 time" value={formatMs(k.performance?.p95_processing_ms_today)} />
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Work mix today">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="Documents" value={k.workloads?.normal_today} />
            <Stat label="Images (OCR)" value={k.workloads?.ocr_today} />
            <Stat label="PDFs" value={k.workloads?.pdf_today} />
            <Stat label="Scanned PDFs" value={k.workloads?.hybrid_pdf_today} hint="with OCR pages" />
            <Stat label="ZIP files" value={k.workloads?.archive_today} />
            <Stat label="Files per ZIP" value={k.nodes?.avg_per_archive} />
            <Stat label="Parts done" value={k.nodes?.processed_today} />
            <Stat label="OCR parts" value={k.nodes?.ocr_today} />
            <Stat label="Skipped parts" value={k.nodes?.skipped_today} />
          </div>
        </Card>

        <Card title="Queue and instances">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="Items queued" value={k.queue?.queued} />
            <Stat label="Items running" value={k.queue?.running} />
            {Object.entries(k.queue?.by_pool || {}).map(([pool, n]) => (
              <Stat key={pool} label={`${pool} pool`} value={n} hint="queued + running" />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(k.instances_today || {}).length ? (
              Object.entries(k.instances_today).map(([inst, n]) => (
                <span key={inst} className="font-tech text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--panel)]">
                  {inst.toUpperCase()}: {n}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-[var(--faint)]">No jobs handled by an instance yet today.</span>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Storage">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="Bucket in use" value={formatBytes(s.used_bytes)} hint={`budget ${formatBytes(s.budget_bytes)}`} tone={usedPct >= 90 ? 'bad' : usedPct >= 70 ? 'warn' : undefined} />
            <Stat label="Input files" value={k.storage?.input_files} />
            <Stat label="Result files" value={k.storage?.output_files} />
          </div>
          {usedPct !== null ? (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-[var(--panel)] border border-[var(--border)] overflow-hidden" aria-label={`${usedPct}% of the storage budget used`}>
                <div className={`h-full ${usedPct >= 90 ? 'bg-rose-500' : usedPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
              </div>
              <p className="m-0 mt-1 text-[11px] text-[var(--faint)]">
                {usedPct}% of the budget. New uploads wait when a job would pass it.
              </p>
            </div>
          ) : null}
        </Card>

        <Card title="Retention">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Deleted within 6 h" value={k.retention?.expiring_6h} />
            <Stat label="Deleted within 24 h" value={k.retention?.expiring_24h} />
            <Stat label="Kept (no auto delete)" value={k.retention?.kept} />
            <Stat label="Cleanup errors" value={k.retention?.cleanup_errors} tone={k.retention?.cleanup_errors ? 'bad' : undefined} />
          </div>
        </Card>
      </div>
    </div>
  );
}
