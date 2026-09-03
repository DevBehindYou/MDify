'use client';

import React from 'react';

/**
 * MarkdownSkeleton Component
 * Renders a responsive, high-fidelity skeleton loading state for the output area
 * while waiting for the conversion API response.
 *
 * Adapts seamlessly across Split, Rendered, and Raw view modes with animated
 * shimmer effects matching MDify's design system.
 */
export default function MarkdownSkeleton({
  viewMode = 'split',
  filename = '',
  maxHeightClass = 'min-h-[350px] max-h-[420px]',
}) {
  return (
    <div
      className={`w-full ${maxHeightClass} flex flex-col rounded-lg border border-[var(--border-3)] bg-[var(--surface)] overflow-hidden shadow-2xs select-none`}
      role="status"
      aria-label="Converting document, awaiting markdown response"
    >
      {/* ── Top Converting API Status Banner ─────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] text-[11px] font-tech text-[var(--muted)]">
        <div className="flex items-center gap-2 overflow-hidden">
          {/* Pulsing Beacon Dot */}
          <span className="relative flex h-2 w-2 flex-none">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>

          <span className="font-semibold text-[var(--text)] truncate">
            {filename ? (
              <>
                Converting <span className="text-amber-600 dark:text-amber-400 font-mono">&ldquo;{filename}&rdquo;</span>…
              </>
            ) : (
              'Converting document…'
            )}
          </span>

          <span className="hidden md:inline-flex items-center gap-1 text-[9.5px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
            <span>MarkItDown Engine</span>
          </span>
        </div>

        {/* Right Status Indicator */}
        <div className="flex items-center gap-2 flex-none text-[10px] text-amber-600 dark:text-amber-400 font-medium">
          <span className="inline-block animate-spin text-[11px]">⚙</span>
          <span className="hidden sm:inline">Awaiting API response…</span>
          <span className="sm:hidden">Processing…</span>
        </div>
      </div>

      {/* Thin Shimmer Loading Bar */}
      <div className="w-full h-0.5 bg-[var(--surface-2)] overflow-hidden">
        <div className="w-full h-full bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-shimmer" />
      </div>

      {/* ── SKELETON BODY BY VIEW MODE ─────────────────────────────────── */}
      <div className="flex-1 p-2.5 overflow-hidden flex flex-col min-h-0 bg-[var(--surface)]">
        {/* ── SPLIT VIEW SKELETON ── */}
        {viewMode === 'split' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 h-full min-h-0">
            {/* Left Column: Raw Markdown Code Skeleton */}
            <div className="flex flex-col h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)] animate-shimmer">
              {/* Header */}
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-tech text-[var(--faint)]">
                <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70 inline-block" />
                  RAW MARKDOWN
                </span>
                <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-mono animate-pulse">
                  streaming syntax…
                </span>
              </div>

              {/* Code Skeleton Lines with Line Numbers Gutter */}
              <div className="flex-1 p-3 overflow-hidden flex font-tech text-[11.5px] leading-relaxed">
                {/* Gutter */}
                <div className="select-none pr-3 border-r border-[var(--border)] text-right text-[var(--faint)] opacity-40 font-mono text-[10.5px] space-y-1.5 shrink-0">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'].map(
                    (n) => (
                      <div key={n}>{n}</div>
                    )
                  )}
                </div>

                {/* Code lines */}
                <div className="pl-3 flex-1 space-y-2 py-0.5 overflow-hidden">
                  {/* H1 header line */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-500/50 font-bold">#</span>
                    <div className="h-3 w-3/5 rounded bg-[var(--surface-2)] border border-[var(--border-3)]" />
                  </div>
                  {/* Italic note */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-purple-400/50 italic">*</span>
                    <div className="h-2.5 w-2/5 rounded bg-purple-500/10" />
                  </div>
                  {/* Empty line spacing */}
                  <div className="h-1.5" />
                  {/* H2 header */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-500/50 font-bold">##</span>
                    <div className="h-2.5 w-1/2 rounded bg-[var(--surface-2)] border border-[var(--border-3)]" />
                  </div>
                  {/* Paragraph lines */}
                  <div className="h-2.5 w-[92%] rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 w-[80%] rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 w-[65%] rounded bg-[var(--surface-2)]" />
                  {/* Empty line spacing */}
                  <div className="h-1.5" />
                  {/* Table markdown lines */}
                  <div className="h-2.5 w-[75%] rounded bg-emerald-500/10 border border-emerald-500/20" />
                  <div className="h-2 w-[75%] rounded bg-[var(--surface-2)] opacity-60" />
                  <div className="h-2.5 w-[85%] rounded bg-[var(--surface-2)]" />
                  {/* Code fence */}
                  <div className="h-2.5 w-1/4 rounded bg-purple-500/15" />
                  <div className="h-2.5 w-2/3 rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 w-1/4 rounded bg-purple-500/15" />
                </div>
              </div>
            </div>

            {/* Right Column: Rendered GFM Preview Skeleton */}
            <div className="flex flex-col h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)] animate-shimmer">
              {/* Header */}
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-tech text-[var(--faint)]">
                <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  LIVE PREVIEW
                </span>
                <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-mono">
                  rendering GFM…
                </span>
              </div>

              {/* Rendered Skeleton Content */}
              <div className="flex-1 p-4 overflow-hidden space-y-3.5 bg-[var(--surface)]">
                {/* Title */}
                <div className="pb-2 border-b border-[var(--border)]">
                  <div className="h-5 w-3/4 rounded-md bg-[var(--surface-2)] border border-[var(--border-3)]" />
                  <div className="h-2.5 w-2/5 rounded mt-2 bg-amber-500/15" />
                </div>

                {/* Paragraph */}
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-[var(--surface-2)]" />
                  <div className="h-3 w-[90%] rounded bg-[var(--surface-2)]" />
                  <div className="h-3 w-[72%] rounded bg-[var(--surface-2)]" />
                </div>

                {/* Simulated Table Skeleton */}
                <div className="rounded border border-[var(--border-3)] overflow-hidden">
                  <div className="grid grid-cols-3 bg-[var(--surface-2)] border-b border-[var(--border)] p-1.5 gap-2">
                    <div className="h-2.5 rounded bg-[var(--border-3)]" />
                    <div className="h-2.5 rounded bg-[var(--border-3)]" />
                    <div className="h-2.5 rounded bg-[var(--border-3)]" />
                  </div>
                  <div className="grid grid-cols-3 p-1.5 gap-2 bg-[var(--surface)] border-b border-[var(--border)]">
                    <div className="h-2 rounded bg-[var(--surface-2)]" />
                    <div className="h-2 rounded bg-[var(--surface-2)]" />
                    <div className="h-2 rounded bg-emerald-500/20" />
                  </div>
                  <div className="grid grid-cols-3 p-1.5 gap-2 bg-[var(--surface-2)]">
                    <div className="h-2 rounded bg-[var(--surface-2)]" />
                    <div className="h-2 rounded bg-[var(--surface-2)]" />
                    <div className="h-2 rounded bg-emerald-500/20" />
                  </div>
                </div>

                {/* Simulated Code Box */}
                <div className="rounded border border-[var(--border-3)] bg-[var(--surface-2)] p-2 space-y-1.5">
                  <div className="h-2 w-16 rounded bg-purple-500/25" />
                  <div className="h-2.5 w-4/5 rounded bg-[var(--surface)]" />
                  <div className="h-2.5 w-3/5 rounded bg-[var(--surface)]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FULL RENDERED VIEW SKELETON ── */}
        {viewMode === 'rendered' && (
          <div className="flex-1 h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)] flex flex-col animate-shimmer">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10.5px] font-tech text-[var(--faint)]">
              <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                RENDERED MARKDOWN
              </span>
              <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-mono">
                generating formatted document…
              </span>
            </div>

            <div className="flex-1 p-5 overflow-hidden space-y-4 bg-[var(--surface)]">
              {/* Document Header */}
              <div className="pb-3 border-b border-[var(--border)] space-y-2">
                <div className="h-6 w-2/3 rounded-md bg-[var(--surface-2)] border border-[var(--border-3)]" />
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-24 rounded-full bg-amber-500/15" />
                  <div className="h-3.5 w-32 rounded-full bg-[var(--surface-2)]" />
                </div>
              </div>

              {/* Paragraph 1 */}
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-[94%] rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-[86%] rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-[60%] rounded bg-[var(--surface-2)]" />
              </div>

              {/* Blockquote Skeleton */}
              <div className="border-l-2 border-amber-500/50 bg-amber-500/5 px-3 py-2 rounded-r space-y-1.5">
                <div className="h-2.5 w-4/5 rounded bg-[var(--surface-2)]" />
                <div className="h-2.5 w-1/2 rounded bg-[var(--surface-2)]" />
              </div>

              {/* Table Preview Skeleton */}
              <div className="rounded-lg border border-[var(--border-3)] overflow-hidden">
                <div className="grid grid-cols-4 bg-[var(--surface-2)] border-b border-[var(--border)] p-2 gap-3">
                  <div className="h-2.5 rounded bg-[var(--border-3)]" />
                  <div className="h-2.5 rounded bg-[var(--border-3)]" />
                  <div className="h-2.5 rounded bg-[var(--border-3)]" />
                  <div className="h-2.5 rounded bg-[var(--border-3)]" />
                </div>
                <div className="grid grid-cols-4 p-2 gap-3 bg-[var(--surface)] border-b border-[var(--border)]">
                  <div className="h-2.5 rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 rounded bg-emerald-500/20" />
                </div>
                <div className="grid grid-cols-4 p-2 gap-3 bg-[var(--surface-2)]">
                  <div className="h-2.5 rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 rounded bg-[var(--surface-2)]" />
                  <div className="h-2.5 rounded bg-emerald-500/20" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FULL RAW VIEW SKELETON ── */}
        {viewMode === 'raw' && (
          <div className="flex-1 h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)] flex flex-col animate-shimmer">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10.5px] font-tech text-[var(--faint)]">
              <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)]">
                RAW SOURCE CODE
              </span>
              <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-mono animate-pulse">
                formatting monospace source…
              </span>
            </div>

            <div className="flex-1 p-3 overflow-hidden flex font-tech text-[12px] leading-relaxed bg-[var(--surface)]">
              {/* Gutter */}
              <div className="select-none pr-3 border-r border-[var(--border)] text-right text-[var(--faint)] opacity-40 font-mono text-[11px] space-y-1.5 shrink-0">
                {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>

              {/* Code lines */}
              <div className="pl-3.5 flex-1 space-y-2 py-0.5 overflow-hidden">
                <div className="h-3 w-1/2 rounded bg-[var(--surface-2)] border border-[var(--border-3)]" />
                <div className="h-2.5 w-1/3 rounded bg-amber-500/15" />
                <div className="h-1.5" />
                <div className="h-2.5 w-3/4 rounded bg-[var(--surface-2)]" />
                <div className="h-2.5 w-[90%] rounded bg-[var(--surface-2)]" />
                <div className="h-2.5 w-[80%] rounded bg-[var(--surface-2)]" />
                <div className="h-2.5 w-[65%] rounded bg-[var(--surface-2)]" />
                <div className="h-1.5" />
                <div className="h-2.5 w-4/5 rounded bg-emerald-500/15 border border-emerald-500/20" />
                <div className="h-2 w-4/5 rounded bg-[var(--surface-2)]" />
                <div className="h-2.5 w-4/5 rounded bg-[var(--surface-2)]" />
                <div className="h-1.5" />
                <div className="h-2.5 w-1/4 rounded bg-purple-500/15" />
                <div className="h-2.5 w-3/5 rounded bg-[var(--surface-2)]" />
                <div className="h-2.5 w-1/4 rounded bg-purple-500/15" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
