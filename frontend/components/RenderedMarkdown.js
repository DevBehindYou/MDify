'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * CodeBlock Component with Prism Syntax Highlighting, language badge,
 * line count, line numbers, and 1-click clipboard copy
 */
function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const codeString = String(code || '').replace(/\n$/, '');
  const lines = codeString.split('\n');

  const [highlighter, setHighlighter] = useState(null);
  useEffect(() => {
    let mounted = true;
    import('../lib/highlightCode').then(({ highlightCode }) => {
      if (mounted) setHighlighter(() => highlightCode);
    }).catch(() => {
      // Source and copy remain available if the optional highlighter fails.
    });
    return () => { mounted = false; };
  }, []);
  const highlighted = useMemo(() => highlighter?.(codeString, language) ?? null, [highlighter, codeString, language]);

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
          {highlighted === null ? (
            <code className={`language-${language || 'none'}`}>{codeString}</code>
          ) : (
            <code className={`language-${language || 'none'}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
          )}
        </pre>
      </div>
    </div>
  );
}

// Custom components for ReactMarkdown to match MDify styling. Module-level so
// ReactMarkdown receives the same object every render.
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
      <table className="w-full text-left text-[12px] font-sans border-collapse [overflow-wrap:normal]">
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

const remarkPlugins = [remarkGfm];

/** Parses and renders Markdown; skipped entirely while `content` is unchanged. */
// Long URLs, inline code and unbroken strings wrap instead of widening the
// pane; code blocks and tables keep their own horizontal scroll.
const RenderedMarkdown = memo(function RenderedMarkdown({ content }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={customComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});


export default RenderedMarkdown;
