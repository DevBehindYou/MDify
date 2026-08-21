'use client';

import { useState } from 'react';

import { EmptyOutput } from '@/components/preview/EmptyOutput';
import { HighlightedMarkdown } from '@/components/preview/HighlightedMarkdown';
import type { ConversionVM } from '@/features/conversion/useConversion';
import type { ResultItem } from '@/types';

export function OutputPanel({ vm }: { vm: ConversionVM }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const current = vm.currentResult;

  const copy = async (result: ResultItem) => {
    await vm.copyResult(result);
    setCopiedId(result.id);
    setTimeout(() => setCopiedId((id) => (id === result.id ? null : id)), 1800);
  };

  return (
    <section
      aria-label="Converted output"
      className="glass flex-1 flex flex-col p-4 gap-3 min-h-0 min-w-0 h-[54vh] md:h-auto"
    >
      <div className="flex items-center justify-between flex-none">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] t-faint">Output</span>
        <span className="text-[10px] t-faint">
          {vm.results.length > 0
            ? `${vm.results.length} file${vm.results.length !== 1 ? 's' : ''} converted`
            : ''}
        </span>
      </div>

      {vm.results.length > 1 && (
        <div
          className="glass-pill flex-none flex items-center justify-between px-3 py-2"
          style={{ borderRadius: 14 }}
        >
          <span className="text-[10px] t-muted">{vm.results.length} files ready to download</span>
          <button
            type="button"
            onClick={vm.downloadZip}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-lg transition-all"
            style={{
              color: 'var(--accent-ink)',
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              boxShadow: '0 0 12px rgba(245,158,11,.2)',
            }}
          >
            ↓ Download {vm.results.length} as .zip
          </button>
        </div>
      )}

      {vm.results.length === 0 && <EmptyOutput />}

      {vm.results.length > 0 && (
        <>
          <div className="flex-none flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="Converted files">
            {vm.results.map((result, i) => (
              <button
                key={result.id}
                type="button"
                role="tab"
                aria-selected={vm.activeIndex === i}
                onClick={() => vm.setActiveIndex(i)}
                title={result.filename}
                className="glass-pill flex-none text-[11px] font-medium px-2.5 py-1 transition-all duration-150 max-w-[160px] md:max-w-[200px]"
                style={
                  vm.activeIndex === i
                    ? {
                        color: 'var(--accent)',
                        borderColor: 'color-mix(in srgb, var(--accent) 34%, transparent)',
                      }
                    : { color: 'var(--muted)' }
                }
              >
                <span className="block truncate">{result.filename}</span>
              </button>
            ))}
          </div>

          {current && (
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <div className="flex-none flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  <span
                    className="text-[10px] surface-soft px-2 py-0.5 rounded-md truncate max-w-[140px] md:max-w-[220px] t-muted"
                    style={{ fontFamily: 'var(--mono)', border: '1px solid var(--glass-border)' }}
                    title={current.filename}
                  >
                    {current.filename}
                  </span>
                  <span className="text-[10px] t-faint hidden sm:inline whitespace-nowrap">
                    {current.stats.word_count.toLocaleString()} words
                  </span>
                  <span className="text-[10px] t-faint hidden md:inline whitespace-nowrap">
                    {current.stats.char_count.toLocaleString()} chars
                  </span>
                  <span
                    className="text-[10px] t-accent hidden md:inline whitespace-nowrap opacity-80"
                    title={`Estimate — ${current.stats.tokenizer}. Model-dependent.`}
                  >
                    ~{current.stats.estimated_tokens.toLocaleString()} tokens
                  </span>
                  {current.stats.token_reduction_pct > 0 && (
                    <span
                      className="text-[10px] text-emerald-500 hidden md:inline whitespace-nowrap font-semibold"
                      title={`Estimated token reduction vs raw extraction (${current.stats.tokenizer}).`}
                    >
                      −{current.stats.token_reduction_pct}% tokens
                    </span>
                  )}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap font-semibold"
                    style={{
                      color:
                        current.quality.quality_score >= 90
                          ? '#34d399'
                          : current.quality.quality_score >= 70
                            ? 'var(--accent)'
                            : '#f87171',
                      background: 'var(--surface-soft)',
                      border: '1px solid var(--glass-border)',
                    }}
                    title="Heuristic Markdown quality score (0-100). See docs for method."
                  >
                    Q {current.quality.quality_score}
                  </span>
                  {current.quality.issues.length > 0 && (
                    <span
                      className="text-[10px] t-muted hidden sm:inline whitespace-nowrap"
                      title={current.quality.issues
                        .slice(0, 6)
                        .map((i) => `${i.line ? `L${i.line}: ` : ''}${i.message}`)
                        .join('\n')}
                    >
                      {current.quality.issues.length} issue
                      {current.quality.issues.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {current.quality.structure_warning && (
                    <span
                      className="text-[10px] t-accent px-1.5 py-0.5 rounded whitespace-nowrap hidden sm:inline"
                      style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
                      }}
                      title="This document produced little heading/table structure — it may be scanned or image-based and have lost structure."
                    >
                      ⚠ low structure
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-none">
                  <button
                    type="button"
                    onClick={() => copy(current)}
                    className="glass-pill text-[11px] px-2.5 py-1 t-muted hover:[color:var(--text)] transition-colors"
                  >
                    {copiedId === current.id ? '✓ Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => vm.downloadResult(current)}
                    className="glass-pill text-[11px] px-2.5 py-1 font-medium t-accent transition-all"
                    style={{ borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
                  >
                    ↓ Download .md
                  </button>
                </div>
              </div>

              {/* Reader — calmer glass plane keeps body text crisp/readable. */}
              <div className="glass-strong flex-1 overflow-y-auto min-h-0" style={{ borderRadius: 16 }}>
                <div
                  className="sticky top-0 z-10 flex items-center justify-between px-4 py-2"
                  style={{
                    background: 'color-mix(in srgb, var(--bg) 55%, transparent)',
                    backdropFilter: 'blur(6px)',
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1" aria-hidden>
                      <span className="w-2 h-2 rounded-full bg-red-500/50" />
                      <span className="w-2 h-2 rounded-full bg-amber-500/50" />
                      <span className="w-2 h-2 rounded-full bg-emerald-500/50" />
                    </div>
                    <span
                      className="text-[10px] t-faint uppercase tracking-widest"
                      style={{ fontFamily: 'var(--mono)' }}
                    >
                      markdown
                    </span>
                  </div>
                  <span className="text-[10px] t-faint truncate max-w-[50%]">
                    {current.original_name} → {current.filename}
                  </span>
                </div>

                <HighlightedMarkdown content={current.content} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
