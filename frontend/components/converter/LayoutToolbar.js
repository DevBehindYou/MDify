'use client';

import React, { memo } from 'react';
import { MAX_QUEUE_FILES } from '../../lib/formats';

const pill = (active) =>
  `px-2.5 py-0.5 rounded-full border cursor-pointer ${
    active
      ? 'border-[var(--text)] bg-[var(--surface)] text-[var(--text)] font-semibold'
      : 'border-[var(--border-3)] bg-[var(--surface-2)] text-[var(--muted)]'
  }`;

/** Desktop row above the workspace: layout switch, recent items, queue counts. */
function LayoutToolbar({
  isThreeColumn,
  onSelectLayout,
  sidebarOpen,
  onToggleSidebar,
  recentCount,
  queueCount,
  resultCount,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3 text-[11.5px] font-tech text-[var(--faint)]">
      <div className="flex flex-wrap items-center gap-2">
        <span>LAYOUT:</span>
        <button type="button" onClick={() => onSelectLayout('1a')} className={pill(!isThreeColumn)}>
          1a Landing 50/50
        </button>
        <button type="button" onClick={() => onSelectLayout('1c')} className={pill(isThreeColumn)}>
          1c Three Columns (Densest)
        </button>

        <span className="text-[var(--border-3)]">·</span>

        <button
          type="button"
          onClick={onToggleSidebar}
          className={`px-2.5 py-0.5 rounded-full border cursor-pointer flex items-center gap-1.5 transition-all ${
            sidebarOpen
              ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold shadow-xs'
              : 'border-[var(--border-3)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--text)]'
          }`}
          title="Toggle Recent Conversion Sessions Sidebar (⌘B)"
        >
          <span className="text-amber-500">⏱</span>
          <span>Recent Items</span>
          <span className="bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.2 rounded-full font-tech">
            {recentCount}/5
          </span>
        </button>
      </div>

      {queueCount > 0 && (
        <div className="flex items-center gap-2">
          <span>
            {queueCount}/{MAX_QUEUE_FILES} in queue
          </span>
          <span>·</span>
          <span>{resultCount} converted</span>
        </div>
      )}
    </div>
  );
}

export default memo(LayoutToolbar);
