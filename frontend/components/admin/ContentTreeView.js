'use client';

import React, { useState } from 'react';
import { formatBytes } from '../../lib/models/adminFormat';
import { worstStatus } from '../../lib/models/contentTree';
import { Badge } from './ui';

const TYPE_LABEL = {
  ROOT_FILE: 'upload',
  DOCUMENT: 'document',
  TEXT_FILE: 'text',
  CODE_FILE: 'code',
  IMAGE: 'image',
  NESTED_ARCHIVE: 'zip',
  BINARY: 'binary',
  ARCHIVE_ENTRY: 'file',
  PDF_PAGE: 'page',
  PDF_SEGMENT: 'pages',
};

function Row({ entry, depth, defaultOpen }) {
  const hasChildren = entry.children.length > 0;
  const [open, setOpen] = useState(defaultOpen);
  const n = entry.node;
  const status = hasChildren && !n ? worstStatus(entry) : n?.status;

  return (
    <li>
      <div className="flex items-center gap-1.5 min-w-0 py-[3px] pr-1 rounded hover:bg-[var(--panel)]" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
            className="w-4 h-4 shrink-0 flex items-center justify-center text-[10px] text-[var(--faint)] cursor-pointer"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className={`truncate text-[12.5px] ${hasChildren && !n ? 'font-medium' : ''}`} title={entry.path || entry.name}>
          {entry.name}
        </span>
        {n ? <span className="font-tech text-[10px] text-[var(--faint)] shrink-0">{TYPE_LABEL[n.node_type] || n.node_type?.toLowerCase()}</span> : null}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {n?.size_bytes ? <span className="font-tech text-[10px] text-[var(--faint)] hidden sm:inline">{formatBytes(n.size_bytes)}</span> : null}
          {status ? <Badge status={status} title={n?.skip_reason || undefined} /> : null}
        </span>
      </div>
      {n?.skip_reason ? (
        <div className="text-[11px] text-[var(--faint)] truncate" style={{ paddingLeft: depth * 14 + 22 }}>
          {n.skip_reason}
        </div>
      ) : null}
      {hasChildren && open ? (
        <ul className="list-none m-0 p-0">
          {entry.children.map((child) => (
            <Row key={child.key} entry={child} depth={depth + 1} defaultOpen={depth < 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Folder tree of a job's content (ZIP entries, PDF pages). */
export default function ContentTreeView({ tree }) {
  if (!tree) return null;
  const { root, counts } = tree;
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className="font-tech text-[11px] text-[var(--muted)]">{counts.total} part(s):</span>
        {['DONE', 'PENDING', 'RUNNING', 'SKIPPED', 'FAILED'].map((s) =>
          counts[s] ? (
            <Badge key={s} status={s}>
              {counts[s]} {s.toLowerCase()}
            </Badge>
          ) : null
        )}
      </div>
      <ul className="list-none m-0 max-h-[420px] overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-1.5">
        <Row entry={root} depth={0} defaultOpen />
      </ul>
    </div>
  );
}
