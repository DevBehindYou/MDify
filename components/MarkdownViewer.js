'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import OutputStatusBar from './OutputStatusBar';
import MarkdownSkeleton from './MarkdownSkeleton';

/**
 * Highlight code string using Prism.js with language fallback
 */
function highlightCode(code, rawLang) {
  if (!code) return '';
  const lang = (rawLang || '').toLowerCase().trim();
  const langAliases = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
  };
  const target = langAliases[lang] || lang;
  const grammar = Prism.languages[target] || Prism.languages.javascript || Prism.languages.markup;
  try {
    return Prism.highlight(code, grammar, target);
  } catch {
    return code;
  }
}

/**
 * CodeBlock Component with Prism Syntax Highlighting, language badge,
 * line count, line numbers, and 1-click clipboard copy
 */
function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const codeString = String(code || '').replace(/\n$/, '');
  const lines = codeString.split('\n');

  const highlighted = useMemo(() => {
    return highlightCode(codeString, language);
  }, [codeString, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  };

  const displayLang = language ? language.toUpperCase() : 'CODE';
  const showLineNumbers = lines.length > 1;

  return (
    <div className="prism-code-block relative my-3 rounded-lg border border-[var(--border-3)] bg-[var(--surface-2)] overflow-hidden font-tech text-[11.5px] group shadow-2xs">
      {/* Header bar with Language tag, line count, and Copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--panel)] border-b border-[var(--border)] text-[10px] text-[var(--faint)] select-none">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold tracking-wider text-[9.5px] text-[var(--muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            {displayLang}
          </span>
          <span className="text-[9px] text-[var(--faint)]">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border-3)] hover:border-[var(--text)] text-[9.5px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--surface)] cursor-pointer transition-all active:scale-95"
          title="Copy code snippet"
        >
          {copied ? (
            <>
              <span className="text-emerald-500 font-bold">✓</span>
              <span className="text-emerald-500 font-medium">Copied</span>
            </>
          ) : (
            <>
              <span>⧉</span>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code body with line numbers gutter and syntax highlighted content */}
      <div className="p-3 overflow-x-auto text-[var(--text)] font-tech text-[11.5px] leading-relaxed bg-[var(--surface)] flex">
        {showLineNumbers && (
          <div
            className="select-none pr-3 pl-0.5 text-right text-[var(--faint)] opacity-60 border-r border-[var(--border)] shrink-0 font-tech text-[11px] leading-relaxed"
            aria-hidden="true"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <pre
          className={`m-0 p-0 ${
            showLineNumbers ? 'pl-3' : 'pl-0.5'
          } flex-1 overflow-visible bg-transparent font-tech text-[11.5px] leading-relaxed`}
        >
          <code
            className={`language-${language || 'none'}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </div>
  );
}

/**
 * MarkdownViewer Component
 * Provides a real-time Markdown preview component for the reader panel,
 * allowing users to see a rendered version of their converted text alongside
 * the raw Markdown code (in Split mode), or toggle between Rendered and Raw.
 * Includes a live status bar beneath the output area for character and word count.
 */
export default function MarkdownViewer({
  content = '',
  tokensEst = null,
  onChangeContent,
  viewMode = 'split', // 'split' | 'rendered' | 'raw'
  onViewModeChange,
  isReadOnly = false,
  maxHeightClass = 'h-[360px]',
  showStatusBar = true,
  compactStatusBar = false,
  statusBarId = 'markdown-output-status-bar',
  isLoading = false,
  loadingFileName = '',
}) {
  const [localContent, setLocalContent] = useState(content);
  const [copiedAll, setCopiedAll] = useState(false);

  // Sync external content changes
  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setLocalContent(val);
    if (onChangeContent) {
      onChangeContent(val);
    }
  };

  const handleCopyAll = useCallback(async () => {
    if (!localContent) return;
    try {
      await navigator.clipboard.writeText(localContent);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // ignore
    }
  }, [localContent]);

  // ── SKELETON LOADING STATE (Waiting for conversion API response)
  if (isLoading) {
    return (
      <div className={`w-full ${maxHeightClass} flex flex-col justify-between select-none`}>
        <div className="flex-1 flex flex-col min-h-0">
          <MarkdownSkeleton
            viewMode={viewMode === 'preview' ? 'rendered' : viewMode}
            filename={loadingFileName}
            maxHeightClass="h-full min-h-[300px]"
          />
        </div>
        {showStatusBar && (
          <div className="pt-2 flex-none">
            <OutputStatusBar
              id={statusBarId}
              content=""
              tokensEst={0}
              filename={loadingFileName}
              compact={compactStatusBar}
              isLoading={true}
            />
          </div>
        )}
      </div>
    );
  }

  // ── EMPTY STATE (No content and not loading)
  if (!localContent) {
    return (
      <div className={`w-full ${maxHeightClass} flex flex-col justify-between select-none`}>
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--faint)] gap-2 py-8">
          <div className="w-10 h-10 border-[1.5px] border-dashed border-[var(--border-3)] rounded-lg flex items-center justify-center text-[16px] text-[var(--muted)]">
            ▤
          </div>
          <div className="font-wireframe text-[15px] font-bold text-[var(--text)]">
            Your Markdown appears here
          </div>
          <div className="text-[11.5px] text-[var(--muted)] font-sans max-w-xs text-center">
            Upload and convert any document to see live rendered Markdown alongside raw code.
          </div>
        </div>

        {showStatusBar && (
          <div className="pt-2 flex-none">
            <OutputStatusBar
              id={statusBarId}
              content=""
              tokensEst={0}
              compact={compactStatusBar}
              isLoading={false}
            />
          </div>
        )}
      </div>
    );
  }

  // Custom components for ReactMarkdown to match MDify styling
  const customComponents = {
    h1: ({ children }) => (
      <h1 className="font-wireframe text-[22px] font-bold text-[var(--text)] mt-4 mb-2 pb-1.5 border-b border-[var(--border)] leading-snug">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-wireframe text-[18px] font-bold text-[var(--text)] mt-3.5 mb-1.5 pb-1 border-b border-[var(--border-2)] leading-snug">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-wireframe text-[16px] font-semibold text-[var(--text)] mt-3 mb-1 leading-snug">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="font-sans text-[14px] font-semibold text-[var(--text)] mt-2.5 mb-1">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="text-[13px] leading-relaxed text-[var(--text)] my-2 font-sans">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-outside ml-5 my-2 space-y-1 text-[13px] text-[var(--text)] font-sans">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-outside ml-5 my-2 space-y-1 text-[13px] text-[var(--text)] font-sans">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed pl-0.5">
        {children}
      </li>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-[3px] border-[#8f83d8] dark:border-[#b58fd0] pl-3 py-1 my-2.5 bg-[var(--surface-2)] text-[12.5px] text-[var(--muted)] italic rounded-r font-sans">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-3 border border-[var(--border-3)] rounded-lg shadow-2xs">
        <table className="w-full text-left text-[12px] font-sans border-collapse">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-[var(--surface-2)] text-[var(--text)] font-semibold border-b border-[var(--border-3)] font-tech text-[11px] uppercase tracking-wider">
        {children}
      </thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
        {children}
      </tbody>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-[var(--surface-2)]/60 transition-colors">
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 text-[var(--muted)]">
        {children}
      </td>
    ),
    pre: ({ children }) => {
      const codeChild =
        React.Children.toArray(children).find(
          (c) => React.isValidElement(c) && (c.type === 'code' || c.props?.className)
        ) || children;

      const codeProps = codeChild?.props || {};
      const rawCode = String(codeProps.children || children || '').replace(/\n$/, '');
      const className = codeProps.className || '';
      const match = /language-(\w+)/.exec(className);
      const lang = match ? match[1] : '';

      return <CodeBlock code={rawCode} language={lang} />;
    },
    code: ({ node, inline, className, children, ...props }) => {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-3)] text-[#6d28d9] dark:text-[#a78bfa] font-tech text-[11px] font-medium"
          {...props}
        >
          {children}
        </code>
      );
    },
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#2a78d6] dark:text-[#60a5fa] hover:underline font-medium"
      >
        {children}
      </a>
    ),
    hr: () => (
      <hr className="my-4 border-t border-[var(--border-3)]" />
    ),
  };

  return (
    <div className={`w-full flex-1 flex flex-col min-h-0 ${maxHeightClass}`}>
      {/* ── SPLIT VIEW (Side-by-side) ── */}
      {viewMode === 'split' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 h-full min-h-0">
          {/* Left: Raw Code Column */}
          <div className="flex flex-col h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)]">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10.5px] font-tech text-[var(--faint)]">
              <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)]">
                RAW MARKDOWN
              </span>
              <span className="text-[9.5px]">
                {localContent.split('\n').length} lines · editable
              </span>
            </div>
            <div className="flex-1 p-2.5 overflow-y-auto font-tech text-[11.5px] leading-relaxed bg-[var(--surface)]">
              <textarea
                value={localContent}
                onChange={handleTextChange}
                readOnly={isReadOnly}
                className="w-full h-full min-h-[260px] font-tech text-[11.5px] bg-transparent border-0 outline-none text-[var(--text)] resize-none leading-relaxed selection:bg-amber-500/20"
                placeholder="Type or paste Markdown here to see it render live..."
                spellCheck={false}
              />
            </div>
          </div>

          {/* Right: Rendered HTML Column */}
          <div className="flex flex-col h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)]">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10.5px] font-tech text-[var(--faint)]">
              <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                LIVE PREVIEW
              </span>
              <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400">
                Rendered with GFM
              </span>
            </div>
            <div className="flex-1 p-3.5 overflow-y-auto bg-[var(--surface)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={customComponents}>
                {localContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* ── FULL RENDERED VIEW ── */}
      {viewMode === 'rendered' && (
        <div className="flex-1 h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)] flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10.5px] font-tech text-[var(--faint)]">
            <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              RENDERED MARKDOWN
            </span>
            <span className="text-[9.5px] text-[var(--faint)]">
              Full formatted document
            </span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto bg-[var(--surface)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={customComponents}>
              {localContent}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* ── FULL RAW VIEW ── */}
      {viewMode === 'raw' && (
        <div className="flex-1 h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)] flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10.5px] font-tech text-[var(--faint)]">
            <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)]">
              RAW SOURCE CODE
            </span>
            <span className="text-[9.5px] text-[var(--faint)]">
              Monospace source code
            </span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto bg-[var(--surface)]">
            <textarea
              value={localContent}
              onChange={handleTextChange}
              readOnly={isReadOnly}
              className="w-full h-full min-h-[300px] font-tech text-[12px] bg-transparent border-0 outline-none text-[var(--text)] resize-none leading-relaxed selection:bg-amber-500/20"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* ── Status Bar beneath the output area ── */}
      {showStatusBar && (
        <div className="pt-2 flex-none">
          <OutputStatusBar
            id={statusBarId}
            content={localContent}
            tokensEst={tokensEst}
            compact={compactStatusBar}
            onCopy={handleCopyAll}
            copied={copiedAll}
            isLoading={false}
          />
        </div>
      )}
    </div>
  );
}
