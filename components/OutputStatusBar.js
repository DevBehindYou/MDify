'use client';

import React from 'react';

/**
 * Calculate live statistics for markdown content
 */
export function getMarkdownCounts(content = '') {
  if (!content) {
    return {
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      lines: 0,
      tokensEst: 0,
      readingTime: '0 min',
    };
  }

  const characters = content.length;
  const charactersNoSpaces = content.replace(/\s/g, '').length;
  const lines = content.split('\n').length;
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const tokensEst = Math.max(1, Math.round(characters / 4));
  const minutes = Math.max(1, Math.ceil(words / 200));
  const readingTime = words < 120 ? '< 1 min' : `${minutes} min read`;

  return {
    characters,
    charactersNoSpaces,
    words,
    lines,
    tokensEst,
    readingTime,
  };
}

/**
 * OutputStatusBar Component
 * Positioned beneath the output area to display current character count, word count,
 * and related live metrics of the generated Markdown.
 */
export default function OutputStatusBar({
  id = 'output-status-bar',
  content = '',
  tokensEst = null,
  filename = '',
  className = '',
  compact = false,
  isLoading = false,
  onCopy = null,
  copied = false,
}) {
  const stats = getMarkdownCounts(content);
  const displayTokens = tokensEst != null ? tokensEst : stats.tokensEst;
  const hasContent = Boolean(content && content.length > 0 && !isLoading);

  if (compact) {
    return (
      <div
        id={id}
        className={`w-full px-3 py-1.5 rounded-lg border border-[var(--border-3)] bg-[var(--surface)] dark:bg-[var(--surface-2)] flex items-center justify-between font-tech text-[11px] text-[var(--muted)] select-none transition-colors shadow-2xs ${className}`}
        aria-label="Output area status bar"
      >
        {/* Left: Words and Characters */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isLoading
                ? 'bg-amber-500 animate-ping'
                : hasContent
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-[var(--faint)]'
            }`}
            title={
              isLoading
                ? 'Converting document...'
                : hasContent
                ? 'Markdown loaded & ready'
                : 'Awaiting document output'
            }
          />
          {isLoading ? (
            <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
              <span className="font-bold animate-pulse">Converting API response…</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                <span className="text-[var(--faint)] uppercase text-[9px]">Words:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {stats.words.toLocaleString()}
                </span>
              </div>
              <span className="text-[var(--border-3)]">|</span>
              <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                <span className="text-[var(--faint)] uppercase text-[9px]">Chars:</span>
                <span className="font-bold text-[var(--text)]">
                  {stats.characters.toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right: Tokens / Time */}
        <div className="flex items-center gap-2 text-[10px] text-[var(--faint)]">
          {isLoading ? (
            <span className="text-amber-500 font-mono animate-pulse">Parsing AST…</span>
          ) : hasContent ? (
            <>
              <span className="text-amber-500 font-medium">
                ⚡ {displayTokens.toLocaleString()} tok
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">⏱ {stats.readingTime}</span>
            </>
          ) : (
            <span>Awaiting output</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id={id}
      className={`w-full rounded-lg border border-[var(--border-3)] bg-[var(--surface)] dark:bg-[var(--surface-2)] px-3.5 py-2 font-tech text-[11px] text-[var(--muted)] select-none shadow-2xs transition-colors flex flex-wrap items-center justify-between gap-2.5 ${className}`}
      aria-label="Markdown Output Status Bar"
    >
      {/* Primary Section: Word and Character Counts */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* State indicator pill */}
        <div
          id={`${id}-state-pill`}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            isLoading
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
              : hasContent
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-[var(--surface)] border-[var(--border-3)] text-[var(--faint)]'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isLoading
                ? 'bg-amber-500 animate-ping'
                : hasContent
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-[var(--faint)]'
            }`}
          />
          <span>{isLoading ? 'Converting…' : hasContent ? 'Output Ready' : 'Ready'}</span>
        </div>

        {/* Word Count Badge */}
        <div
          id={`${id}-word-count`}
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--border-3)] bg-[var(--surface)] shadow-2xs"
          title={`Total words counted: ${stats.words.toLocaleString()}`}
        >
          <span className="text-[var(--faint)] uppercase text-[9px] tracking-wider font-semibold">
            Words
          </span>
          <span className="font-bold text-[12px] text-amber-600 dark:text-amber-400">
            {isLoading ? (
              <span className="text-[10px] text-amber-500/80 font-mono animate-pulse">…</span>
            ) : (
              stats.words.toLocaleString()
            )}
          </span>
        </div>

        {/* Character Count Badge */}
        <div
          id={`${id}-char-count`}
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--border-3)] bg-[var(--surface)] shadow-2xs"
          title={`Total characters: ${stats.characters.toLocaleString()} (without spaces: ${stats.charactersNoSpaces.toLocaleString()})`}
        >
          <span className="text-[var(--faint)] uppercase text-[9px] tracking-wider font-semibold">
            Characters
          </span>
          <span className="font-bold text-[12px] text-[var(--text)]">
            {isLoading ? (
              <span className="text-[10px] text-[var(--faint)] font-mono animate-pulse">…</span>
            ) : (
              stats.characters.toLocaleString()
            )}
          </span>
          {!isLoading && (
            <span className="text-[var(--faint)] text-[9.5px]">
              ({stats.charactersNoSpaces.toLocaleString()} no spaces)
            </span>
          )}
        </div>

        {/* Line count */}
        <div
          id={`${id}-line-count`}
          className="hidden sm:flex items-center gap-1 text-[var(--faint)] text-[10.5px]"
        >
          <span>Lines:</span>
          <span className="text-[var(--text)] font-medium">
            {isLoading ? '…' : stats.lines.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Secondary Section: Metrics & Technical Metadata */}
      <div className="flex items-center gap-2 sm:gap-3 text-[10.5px] text-[var(--faint)] ml-auto">
        {/* Estimated tokens */}
        <div
          id={`${id}-tokens`}
          className="flex items-center gap-1 text-[var(--text)]"
          title="Estimated LLM tokens (~4 characters per token)"
        >
          <span className="text-amber-500 font-bold">⚡</span>
          <span className="font-semibold">{displayTokens.toLocaleString()}</span>
          <span className="text-[var(--faint)] text-[9.5px]">tokens</span>
        </div>

        <span className="text-[var(--border-3)]">·</span>

        {/* Reading time */}
        <div
          id={`${id}-reading-time`}
          className="hidden md:flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
          title="Estimated reading duration at 200 words per minute"
        >
          <span>⏱</span>
          <span>{stats.readingTime}</span>
        </div>

        <span className="hidden md:inline text-[var(--border-3)]">·</span>

        {/* Format tag */}
        <span
          id={`${id}-format-tag`}
          className="hidden lg:inline px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-3)] text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]"
        >
          Markdown · UTF-8
        </span>

        {/* Quick copy button if handler provided */}
        {onCopy && hasContent && (
          <button
            id={`${id}-copy-btn`}
            onClick={onCopy}
            className="px-2 py-0.5 rounded border border-[var(--border-3)] hover:border-[var(--text)] bg-[var(--surface)] text-[10px] text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="Copy current markdown"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
