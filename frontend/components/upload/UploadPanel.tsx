'use client';

import { useCallback, useRef, useState } from 'react';

import { FileRow } from '@/components/conversion/FileRow';
import { ACCEPTED_EXTENSIONS, PROFILES } from '@/lib/config';
import type { ConversionVM } from '@/features/conversion/useConversion';

export function UploadPanel({ vm }: { vm: ConversionVM }) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => {
    if (!vm.isFull) inputRef.current?.click();
  }, [vm.isFull]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      vm.addFiles(e.dataTransfer.files);
    },
    [vm],
  );

  return (
    <section
      aria-label="Input files"
      className="glass md:w-[44%] w-full flex flex-col p-4 gap-3 min-h-0 min-w-0 h-[46vh] md:h-auto"
    >
      <div className="flex items-center justify-between flex-none">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] t-faint">Input</span>
        {vm.files.length > 0 && (
          <button
            type="button"
            onClick={vm.clearAll}
            className="text-[11px] t-faint hover:[color:var(--text)] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Profile selector */}
      <div className="flex-none">
        <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Processing profile">
          {PROFILES.map((p) => {
            const active = vm.profile === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => vm.setProfile(p.id)}
                title={p.hint}
                className="glass-pill text-[11px] font-semibold px-2.5 py-1 transition-all"
                style={
                  active
                    ? {
                        color: 'var(--accent)',
                        borderColor: 'color-mix(in srgb, var(--accent) 34%, transparent)',
                      }
                    : { color: 'var(--muted)' }
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] t-faint mt-1.5">
          {PROFILES.find((p) => p.id === vm.profile)?.hint}
        </p>
      </div>

      {/* Drop zone — keyboard operable */}
      <div
        role="button"
        tabIndex={vm.isFull ? -1 : 0}
        aria-label="Add files: drop here, or press Enter to browse"
        aria-disabled={vm.isFull}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        className={`
          relative flex-none rounded-2xl border-2 border-dashed p-4 md:p-6 text-center select-none surface-soft
          transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50
          ${vm.isFull ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
          ${dragActive ? 'drop-shimmer' : ''}
        `}
        style={{ borderColor: dragActive ? 'var(--accent)' : 'var(--glass-border)' }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => {
            if (e.target.files) vm.addFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          disabled={vm.isFull}
        />

        {dragActive ? (
          <div className="flex flex-col items-center gap-2">
            <span className="text-3xl" aria-hidden>⬇</span>
            <p className="text-sm font-semibold t-accent">Drop to add files</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="glass-circle w-10 h-10 grid place-items-center text-sm font-bold mb-0.5" aria-hidden>
              ↑
            </div>
            <p className="text-sm font-medium t-text">
              {vm.isFull ? 'File limit reached (10)' : 'Drop files or click to browse'}
            </p>
            <p className="text-[11px] t-muted">
              PDF · Word · Excel · PowerPoint · HTML · CSV · JSON · ePub · Image
            </p>
          </div>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-0.5">
        {vm.files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <p className="text-xs t-faint">No files added yet</p>
            <p className="text-[10px] t-faint opacity-70">Supports up to 10 documents at a time</p>
          </div>
        ) : (
          vm.files.map((item) => (
            <FileRow key={item.id} item={item} onConvert={vm.convertOne} onRemove={vm.removeFile} />
          ))
        )}
      </div>

      {/* Action bar */}
      {vm.files.length > 0 && (
        <div className="flex-none flex gap-2">
          <button
            type="button"
            onClick={vm.convertAll}
            disabled={vm.converting || vm.pendingCount === 0}
            className={`
              glass-pill flex-1 py-2.5 px-4 text-xs font-bold transition-all duration-150
              focus-visible:ring-2 focus-visible:ring-amber-400/60
              ${vm.pendingCount > 0 && !vm.converting ? '' : 'cursor-not-allowed opacity-70'}
            `}
            style={
              vm.pendingCount > 0 && !vm.converting
                ? {
                    color: 'var(--accent-ink)',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    boxShadow: '0 8px 22px rgba(245,158,11,.28), inset 0 1px 0 rgba(255,255,255,.4)',
                  }
                : { color: 'var(--faint)' }
            }
          >
            {vm.anyConverting
              ? `Converting… (${vm.doneCount}/${vm.files.length})`
              : vm.pendingCount > 0
                ? `Convert ${vm.pendingCount} file${vm.pendingCount !== 1 ? 's' : ''}`
                : 'All done ✓'}
          </button>

          {vm.results.length > 0 && (
            <button
              type="button"
              onClick={vm.downloadZip}
              className="glass-pill py-2.5 px-3 text-xs font-medium t-muted hover:[color:var(--text)] transition-colors"
              title="Download all results as one .zip"
            >
              ↓ ZIP
            </button>
          )}
        </div>
      )}
    </section>
  );
}
