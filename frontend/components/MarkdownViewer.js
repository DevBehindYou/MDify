'use client';

import React, {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import OutputStatusBar from './OutputStatusBar';
import MarkdownSkeleton from './MarkdownSkeleton';
import PreviewBoundary, { PlainTextPreview } from './PreviewBoundary';

// Do not load the Markdown parser until a populated rendered/split preview is
// requested. Empty, busy and raw viewers retain the lightweight editing shell.
const RenderedMarkdown = lazy(() => import('./RenderedMarkdown'));
function MarkdownPreview({ content, docId }) {
  return (
    <PreviewBoundary key={docId} content={content}>
      <Suspense fallback={<PlainTextPreview content={content} loading />}>
        <RenderedMarkdown content={content} />
      </Suspense>
    </PreviewBoundary>
  );
}

const COMMIT_DELAY_MS = 250;

/**
 * MarkdownViewer Component
 * Provides a real-time Markdown preview component for the reader panel,
 * allowing users to see a rendered version of their converted text alongside
 * the raw Markdown code (in Split mode), or toggle between Rendered and Raw.
 * Includes a live status bar beneath the output area for character and word count.
 *
 * Typing only updates this component's local buffer. The rendered preview and
 * stats follow a deferred copy of it, and the edit reaches the owner through
 * `onChangeContent(docId, content)` after a short pause, so a keystroke never
 * re-renders the whole screen or re-parses the Markdown synchronously.
 */
export default function MarkdownViewer({
  docId = null,
  content = '',
  tokensEst = null,
  onChangeContent,
  viewMode = 'split', // 'split' | 'rendered' | 'raw'
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
  const deferredContent = useDeferredValue(localContent);

  const syncedRef = useRef({ docId, content });
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const onChangeRef = useRef(onChangeContent);
  onChangeRef.current = onChangeContent;

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onChangeRef.current?.(pending.docId, pending.content);
  }, []);

  // Commit any pending edit to the document it belongs to before switching
  // documents or unmounting.
  useEffect(() => flush, [docId, flush]);

  // Take external changes (another document, a re-conversion) into the local
  // buffer, but ignore the echo of our own committed edits.
  useEffect(() => {
    const synced = syncedRef.current;
    if (synced.docId === docId && synced.content === content) return;
    syncedRef.current = { docId, content };
    setLocalContent(content);
  }, [docId, content]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setLocalContent(val);
    if (!onChangeContent) return;
    syncedRef.current = { docId, content: val };
    pendingRef.current = { docId, content: val };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, COMMIT_DELAY_MS);
  };

  const copyTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const handleCopyAll = useCallback(async () => {
    if (!localContent) return;
    try {
      await navigator.clipboard.writeText(localContent);
      setCopiedAll(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // ignore
    }
  }, [localContent]);

  const lineCount = useMemo(() => deferredContent.split('\n').length, [deferredContent]);

  // ── SKELETON LOADING STATE (Waiting for conversion API response)
  if (isLoading) {
    return (
      <div className={`md-viewer w-full min-w-0 ${maxHeightClass} flex flex-col justify-between select-none`}>
        <div className="flex-1 flex flex-col min-h-0">
          <MarkdownSkeleton
            viewMode={viewMode}
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

  return (
    <div className={`md-viewer w-full min-w-0 flex-1 flex flex-col min-h-0 ${maxHeightClass}`}>
      {/* ── SPLIT VIEW (Side-by-side) ── */}
      {viewMode === 'split' && (
        <div className="md-split grid grid-cols-1 gap-2 h-full min-h-0">
          {/* Left: Raw Code Column */}
          <div className="flex flex-col h-full min-h-0 border border-[var(--border-3)] rounded-lg overflow-hidden bg-[var(--surface)]">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10.5px] font-tech text-[var(--faint)]">
              <span className="font-semibold uppercase tracking-wider text-[9.5px] text-[var(--muted)]">
                RAW MARKDOWN
              </span>
              <span className="text-[9.5px]">
                {lineCount} lines · editable
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
              <MarkdownPreview content={deferredContent} docId={docId} />
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
            <MarkdownPreview content={deferredContent} docId={docId} />
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
            content={deferredContent}
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
