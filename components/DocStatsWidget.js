'use client';

import React from 'react';

/**
 * Calculates live document metrics:
 * - characters
 * - words
 * - lines
 * - estimated tokens (~4 chars per token standard rule of thumb)
 * - reading time (~200 words per min)
 */
export function calculateDocStats(content = '') {
  if (!content) {
    return {
      characters: 0,
      words: 0,
      lines: 0,
      tokens: 0,
      readingTime: '0 min',
    };
  }

  const characters = content.length;
  const lines = content.split('\n').length;
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  // Estimate tokens (~4 chars per token)
  const tokens = Math.max(1, Math.round(characters / 4));
  // Reading time at 200 wpm
  const minutes = Math.max(1, Math.ceil(words / 200));
  const readingTime = words < 120 ? '< 1 min' : `${minutes} min read`;

  return {
    characters,
    words,
    lines,
    tokens,
    readingTime,
  };
}

/**
 * DocStatsWidget
 * A small status widget for the reader or header displaying live statistics
 * for the processed document.
 */
export default function DocStatsWidget({ content = '', tokensEst = null, compact = false }) {
  const stats = calculateDocStats(content);
  const displayTokens = tokensEst != null ? tokensEst : stats.tokens;

  if (!content) {
    return (
      <div className="font-tech text-[10.5px] text-[var(--faint)] flex items-center gap-2">
        <span className="opacity-60">0 tokens</span>
        <span>·</span>
        <span className="opacity-60">0 chars</span>
        <span>·</span>
        <span className="opacity-60">0 min read</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border-3)] bg-[var(--surface-2)] font-tech text-[10.5px] text-[var(--muted)] shadow-xs select-none"
        title={`${stats.words.toLocaleString()} words · ${stats.lines.toLocaleString()} lines`}
      >
        <span className="text-amber-500 font-bold">⚡</span>
        <span className="text-[var(--text)] font-semibold">
          {displayTokens.toLocaleString()}
        </span>
        <span className="text-[var(--faint)]">tok</span>
        <span className="text-[var(--border-3)]">|</span>
        <span>{stats.characters.toLocaleString()} ch</span>
        <span className="text-[var(--border-3)]">|</span>
        <span className="text-emerald-500 dark:text-emerald-400">⏱ {stats.readingTime}</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-3)] bg-[var(--surface)] font-tech text-[11px] text-[var(--muted)] select-none shadow-2xs"
      title={`${stats.words.toLocaleString()} words · ${stats.lines.toLocaleString()} lines`}
    >
      <div className="flex items-center gap-1 text-[var(--text)] font-medium">
        <span className="text-amber-500">⚡</span>
        <span>{displayTokens.toLocaleString()}</span>
        <span className="text-[var(--faint)] text-[9.5px]">tokens (est.)</span>
      </div>

      <span className="text-[var(--border-3)]">·</span>

      <div className="flex items-center gap-1">
        <span>{stats.characters.toLocaleString()}</span>
        <span className="text-[var(--faint)] text-[9.5px]">chars</span>
      </div>

      <span className="text-[var(--border-3)]">·</span>

      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <span>⏱</span>
        <span>{stats.readingTime}</span>
      </div>

      <div className="hidden sm:flex items-center gap-1 ml-auto text-[var(--faint)] text-[9.5px]">
        <span>{stats.words.toLocaleString()} words</span>
      </div>
    </div>
  );
}
