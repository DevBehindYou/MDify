'use client';

import React, { useState } from 'react';
import { adminApi } from '../../lib/models/adminApi';
import { formatBytes, formatDate, formatMs, shortId } from '../../lib/models/adminFormat';
import { useAdminResource, usePagedList } from '../../viewmodels/useAdminViewModel';
import { Badge, Button, Empty, ErrorLine, Select } from './ui';

function LoadMore({ list }) {
  return (
    <div className="flex justify-center">
      {list.next ? (
        <Button onClick={list.loadMore} busy={list.loading}>
          Load more
        </Button>
      ) : list.items.length ? (
        <span className="text-[11.5px] text-[var(--faint)]">End of list</span>
      ) : null}
    </div>
  );
}

const FILE_STATUS = [
  { value: 'ACTIVE', label: 'Stored' },
  { value: 'PENDING', label: 'Upload pending' },
  { value: 'DELETED', label: 'Deleted' },
  { value: 'ERROR', label: 'Error' },
  { value: '', label: 'All' },
];

/** Files registered in the database (inputs and results), newest first. */
export function FilesPanel({ handleError }) {
  const [status, setStatus] = useState('ACTIVE');
  const list = usePagedList(
    async (cursor) => {
      const page = await adminApi.files({ status, limit: 100, before: cursor?.before, before_id: cursor?.before_id });
      return { items: page.files, next: page.next };
    },
    [status],
    { handleError }
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Status" value={status} onChange={setStatus} options={FILE_STATUS} />
        <Button onClick={list.reload}>Refresh</Button>
      </div>
      <p className="m-0 text-[12px] text-[var(--faint)]">
        Open a job (Jobs tab) to preview or download its files. Intermediate pieces of scanned PDFs and ZIP files are not listed here; they
        are deleted together with their job.
      </p>
      <ErrorLine error={list.error} onRetry={list.reload} />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[640px] text-[12.5px] border-collapse">
          <thead className="bg-[var(--panel)] text-[var(--faint)] font-tech text-[10px] uppercase">
            <tr>
              <th className="text-left px-2 py-2 font-normal">Job</th>
              <th className="text-left px-2 py-2 font-normal">Kind</th>
              <th className="text-left px-2 py-2 font-normal">Object</th>
              <th className="text-left px-2 py-2 font-normal">Size</th>
              <th className="text-left px-2 py-2 font-normal">Status</th>
              <th className="text-left px-2 py-2 font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((f) => (
              <tr key={f.file_id} className="border-t border-[var(--border)]">
                <td className="px-2 py-1.5 font-tech text-[11.5px]">{shortId(f.job_id)}</td>
                <td className="px-2 py-1.5">{f.kind.toLowerCase()}</td>
                <td className="px-2 py-1.5 font-tech text-[11.5px] truncate max-w-[260px]">{f.object_path.split('/').slice(2).join('/')}</td>
                <td className="px-2 py-1.5 font-tech text-[11.5px] whitespace-nowrap">{formatBytes(f.size_bytes)}</td>
                <td className="px-2 py-1.5">
                  <Badge status={f.storage_status} />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(f.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.items.length && !list.loading && !list.error ? <Empty>No files.</Empty> : null}
      </div>
      <LoadMore list={list} />
    </div>
  );
}

/** Readiness of N1/N2, O1/O2, Z1/Z2 (a sleeping Render instance shows as timeout). */
export function ProcessesPanel({ handleError }) {
  const { data, loading, error, reload } = useAdminResource(adminApi.processes, { handleError });
  const instances = data?.instances || [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[12px] text-[var(--faint)]">
          {data ? `Checked ${formatDate(data.checked_at)}.` : ' '} Instances on a free plan may need about a minute to wake up.
        </p>
        <Button onClick={reload} busy={loading}>
          Check again
        </Button>
      </div>
      <ErrorLine error={error} onRetry={reload} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {instances.map((i) => (
          <div key={`${i.pool}-${i.label}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[14px]">{i.label}</span>
              <Badge status={i.state} />
            </div>
            <div className="font-tech text-[11px] text-[var(--faint)] truncate">
              {i.pool} pool · {i.host}
            </div>
            <div className="text-[12px] text-[var(--muted)]">
              {i.engine || '—'} · {formatMs(i.ms)}
              {i.storage_configured === false ? <span className="text-rose-500"> · Storage not configured</span> : null}
            </div>
            {i.detail ? <div className="font-tech text-[10.5px] text-[var(--faint)] break-words">{i.detail}</div> : null}
          </div>
        ))}
      </div>
      {data && !instances.length ? <Empty>No backend instances are configured.</Empty> : null}
    </div>
  );
}

function auditDetails(details) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
}

/** The audit log, newest first (append-only). */
export function AuditPanel({ handleError }) {
  const list = usePagedList(
    async (cursor) => {
      const page = await adminApi.audit({ limit: 100, before: cursor?.before, before_id: cursor?.before_id });
      return { items: page.entries, next: page.next };
    },
    [],
    { handleError }
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={list.reload}>Refresh</Button>
      </div>
      <ErrorLine error={list.error} onRetry={list.reload} />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[640px] text-[12.5px] border-collapse">
          <thead className="bg-[var(--panel)] text-[var(--faint)] font-tech text-[10px] uppercase">
            <tr>
              <th className="text-left px-2 py-2 font-normal">When</th>
              <th className="text-left px-2 py-2 font-normal">Actor</th>
              <th className="text-left px-2 py-2 font-normal">Action</th>
              <th className="text-left px-2 py-2 font-normal">Job</th>
              <th className="text-left px-2 py-2 font-normal">Details</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((a) => (
              <tr key={a.audit_id} className="border-t border-[var(--border)] align-top">
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(a.created_at)}</td>
                <td className="px-2 py-1.5 font-tech text-[11px] whitespace-nowrap">{a.actor_id || a.actor_type}</td>
                <td className="px-2 py-1.5 font-tech text-[11px] whitespace-nowrap">{a.action}</td>
                <td className="px-2 py-1.5 font-tech text-[11px]">{shortId(a.job_id)}</td>
                <td className="px-2 py-1.5 font-tech text-[11px] text-[var(--muted)] break-words max-w-[360px]">{auditDetails(a.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.items.length && !list.loading && !list.error ? <Empty>No audit entries yet.</Empty> : null}
      </div>
      <LoadMore list={list} />
    </div>
  );
}
