'use client';

import React from 'react';
import { formatBytes, formatDate, relativeTime, shortId } from '../../lib/models/adminFormat';
import { EXTEND_OPTIONS, useAdminJobsViewModel } from '../../viewmodels/useAdminViewModel';
import JobDetail from './JobDetail';
import { Badge, Button, Empty, ErrorLine, Select } from './ui';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'UPLOADING', label: 'Uploading' },
  { value: 'CLEANUP_ERROR', label: 'Cleanup problem' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'DOCUMENT', label: 'Documents' },
  { value: 'PDF', label: 'PDFs' },
  { value: 'IMAGE', label: 'Images' },
  { value: 'ARCHIVE', label: 'ZIP files' },
];

function retentionText(j) {
  if (j.files_deleted_at) return 'files deleted';
  if (j.retention_mode === 'KEEP') return 'kept';
  return `deletes ${relativeTime(j.delete_at)}`;
}

export default function JobsPanel({ handleError, notify }) {
  const vm = useAdminJobsViewModel({ handleError, notify });
  const count = vm.selected.size;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Status" value={vm.status} onChange={vm.setStatus} options={STATUS_OPTIONS} />
        <Select label="Type" value={vm.source} onChange={vm.setSource} options={SOURCE_OPTIONS} />
        <Button onClick={vm.reload} busy={vm.loading && !vm.items.length}>
          Refresh
        </Button>
      </div>

      {count ? (
        <div className="sticky top-[52px] z-20 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-md">
          <span className="text-[12.5px] font-medium mr-1">{count} selected</span>
          <Button onClick={vm.zipSelected} busy={vm.working === 'ZIP'}>
            Results as ZIP
          </Button>
          <Button onClick={() => vm.runBulk('KEEP')} busy={vm.working === 'KEEP'}>
            Keep
          </Button>
          <Button onClick={() => vm.runBulk('EXTEND', EXTEND_OPTIONS[2].hours)} busy={vm.working === 'EXTEND'}>
            +7 days
          </Button>
          <Button onClick={() => vm.runBulk('AUTO')} busy={vm.working === 'AUTO'}>
            Back to 48 h
          </Button>
          <Button tone="danger" onClick={() => vm.runBulk('DELETE_NOW')} busy={vm.working === 'DELETE_NOW'}>
            Delete files
          </Button>
          <Button tone="danger" onClick={() => vm.runBulk('DELETE_JOB')} busy={vm.working === 'DELETE_JOB'}>
            Delete jobs
          </Button>
          <Button onClick={vm.clearSelection} className="ml-auto">
            Clear
          </Button>
        </div>
      ) : null}

      <ErrorLine error={vm.error} onRetry={vm.reload} />

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[760px] text-[12.5px] border-collapse">
          <thead className="bg-[var(--panel)] text-[var(--faint)] font-tech text-[10px] uppercase">
            <tr>
              <th className="px-2 py-2 w-8">
                <input type="checkbox" aria-label="Select all jobs on this page" checked={vm.allSelected} onChange={vm.toggleAll} />
              </th>
              <th className="text-left px-2 py-2 font-normal">Job</th>
              <th className="text-left px-2 py-2 font-normal">Status</th>
              <th className="text-left px-2 py-2 font-normal">Type</th>
              <th className="text-left px-2 py-2 font-normal">Parts</th>
              <th className="text-left px-2 py-2 font-normal">Size</th>
              <th className="text-left px-2 py-2 font-normal">Created</th>
              <th className="text-left px-2 py-2 font-normal">Retention</th>
            </tr>
          </thead>
          <tbody>
            {vm.items.map((j) => (
              <tr
                key={j.job_id}
                className={`border-t border-[var(--border)] hover:bg-[var(--panel)] ${vm.selected.has(j.job_id) ? 'bg-[var(--panel)]' : ''}`}
              >
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select job ${shortId(j.job_id)}`}
                    checked={vm.selected.has(j.job_id)}
                    onChange={() => vm.toggle(j.job_id)}
                  />
                </td>
                <td className="px-2 py-1.5 max-w-[260px]">
                  <button type="button" onClick={() => vm.openJob(j.job_id)} className="text-left w-full cursor-pointer group">
                    <span className="block truncate font-medium group-hover:underline">{j.original_filename || '(name removed)'}</span>
                    <span className="block font-tech text-[10.5px] text-[var(--faint)]">{shortId(j.job_id)}</span>
                  </button>
                </td>
                <td className="px-2 py-1.5">
                  <Badge status={j.status} title={j.error_code || undefined} />
                  {j.cleanup_state === 'PARTIAL' || j.cleanup_state === 'ERROR' ? (
                    <span className="ml-1">
                      <Badge status="ERROR" title={j.cleanup_last_error || undefined}>
                        cleanup
                      </Badge>
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {j.source_type?.toLowerCase() || '—'}
                  {j.source_extension ? <span className="text-[var(--faint)]"> .{j.source_extension}</span> : null}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                  {j.items_done}/{j.items_total}
                  {j.items_failed ? <span className="text-rose-500"> · {j.items_failed} failed</span> : null}
                  {j.items_skipped ? <span className="text-amber-500"> · {j.items_skipped} skipped</span> : null}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap font-tech text-[11.5px]">
                  {formatBytes(j.input_bytes)}
                  {j.output_bytes ? <span className="text-[var(--faint)]"> → {formatBytes(j.output_bytes)}</span> : null}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(j.created_at)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-[var(--muted)]">{retentionText(j)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!vm.items.length && !vm.loading && !vm.error ? <Empty>No jobs match.</Empty> : null}
      </div>

      <div className="flex justify-center">
        {vm.next ? (
          <Button onClick={vm.loadMore} busy={vm.loading}>
            Load more
          </Button>
        ) : vm.items.length ? (
          <span className="text-[11.5px] text-[var(--faint)]">End of list</span>
        ) : null}
      </div>

      {vm.openJobId ? (
        <JobDetail jobId={vm.openJobId} onClose={vm.closeJob} handleError={handleError} notify={notify} onChanged={vm.reload} />
      ) : null}
    </div>
  );
}
