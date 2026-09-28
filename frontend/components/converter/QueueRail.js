'use client';

import React, { memo } from 'react';
import { MAX_QUEUE_FILES } from '../../lib/formats';

function QueueRow({ item, hasResult, isSelected, onSelect, onRetry, onRemove }) {
  return (
    <div
      onClick={() => hasResult && onSelect(item.id)}
      className={`p-2 rounded-lg border text-[12px] font-sans flex items-center justify-between cursor-pointer transition-all ${
        isSelected
          ? 'border-[#2a78d6] bg-[#2a78d6]/10 shadow-sm'
          : 'border-[var(--border-3)] bg-[var(--surface)] hover:border-[var(--text)]'
      }`}
    >
      <div className="truncate pr-2 font-medium" title={item.name}>
        {item.name}
      </div>
      <div className="flex items-center gap-1.5 flex-none font-tech text-[10px]">
        {item.status === 'done' && <span className="text-[#2a78d6] dark:text-[#60a5fa]">✓ done</span>}
        {item.status === 'converting' && (
          <span className="text-amber-500 animate-pulse">{item.progress || 50}%</span>
        )}
        {item.status === 'error' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(item.id);
            }}
            className="tap-target text-rose-500 hover:underline bg-transparent border-0 p-0 cursor-pointer"
            title={item.errorMsg || 'Conversion failed'}
          >
            retry
          </button>
        )}
        {item.status === 'pending' && <span className="text-[var(--faint)]">queued</span>}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="tap-target text-[var(--faint)] hover:text-rose-500 ml-1 bg-transparent border-0 cursor-pointer text-[12px]"
          aria-label={`Remove ${item.name}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const MemoQueueRow = memo(QueueRow);

/** Column 1 of the three-column layout: queue list + "Convert all". */
function QueueRail({
  items,
  resultIds,
  activeResultId,
  isBusy,
  hasConvertible,
  onSelect,
  onRetry,
  onRemove,
  onClear,
  onBrowse,
  onConvertAll,
}) {
  return (
    <div className="row-span-2 lg:row-span-1 min-w-0 border-r-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-3 flex flex-col gap-2.5 bg-[var(--surface-2)]">
      <div className="font-tech text-[10.5px] text-[var(--faint)] uppercase tracking-wider flex justify-between items-center">
        <span>
          QUEUE {items.length}/{MAX_QUEUE_FILES}
        </span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[9.5px] text-[var(--muted)] hover:text-rose-500 bg-transparent border-0 cursor-pointer"
          >
            clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[350px]">
        {items.length === 0 ? (
          <div className="py-8 text-center text-[12px] font-sans text-[var(--faint)]">
            No files in queue yet.
          </div>
        ) : (
          items.map((item) => {
            const hasResult = resultIds.has(item.id);
            return (
              <MemoQueueRow
                key={item.id}
                item={item}
                hasResult={hasResult}
                isSelected={hasResult && activeResultId === item.id}
                onSelect={onSelect}
                onRetry={onRetry}
                onRemove={onRemove}
              />
            );
          })
        )}

        <button
          type="button"
          onClick={onBrowse}
          className="w-full py-1.5 border-[1.5px] border-dashed border-[var(--border-3)] hover:border-[var(--text)] rounded-lg text-center text-[12px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer bg-transparent transition-colors font-sans"
        >
          + Add more
        </button>
      </div>

      <div className="pt-2 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={onConvertAll}
          disabled={isBusy || !hasConvertible}
          className="w-full py-2 rounded-full aurora-btn font-sans text-[13px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isBusy ? 'Converting…' : `Convert all (${items.length})`}
        </button>
      </div>
    </div>
  );
}

export default memo(QueueRail);
