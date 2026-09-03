'use client';

import React, { useState } from 'react';

/**
 * Format relative or short time from timestamp
 */
function formatTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Format file size
 */
function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extension pill color helper
 */
function getExtBadge(name = '') {
  const ext = name.split('.').pop()?.toUpperCase() || 'FILE';
  switch (ext) {
    case 'PDF':
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
    case 'DOCX':
    case 'DOC':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'XLSX':
    case 'XLS':
    case 'CSV':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'PPTX':
    case 'PPT':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'HTML':
    case 'HTM':
      return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
    default:
      return 'bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border-3)]';
  }
}

export default function RecentSessionsSidebar({
  isOpen = false,
  onClose,
  sessions = [],
  activeSessionId = null,
  onSelectSession,
  onDeleteSession,
  onClearAllSessions,
  onLoadSample,
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleCopy = async (e, session) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(session.content || '');
      setCopiedId(session.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownload = (e, session) => {
    e.stopPropagation();
    const blob = new Blob([session.content || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = session.filename || `${session.original_name || 'document'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    if (onDeleteSession) {
      onDeleteSession(sessionId);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for mobile & small screens */}
      <div
        className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Panel */}
      <aside
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[380px] z-50 bg-[var(--surface)] border-l border-[var(--border-3)] shadow-2xl flex flex-col transition-transform duration-200 ease-out"
        aria-label="Recent Conversions Sidebar"
      >
        {/* Top Header */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-2)]/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md border border-[var(--border-3)] bg-[var(--surface)] flex items-center justify-center font-tech text-[12px] text-amber-500 shadow-2xs">
              ⏱
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-wireframe text-[15px] font-bold text-[var(--text)] leading-none">
                  Recent Conversions
                </h2>
                <span className="font-tech text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--border-3)] bg-[var(--surface)] text-[var(--muted)]">
                  {sessions.length}/5
                </span>
              </div>
              <p className="font-tech text-[10px] text-[var(--faint)] mt-0.5">
                Saved in local storage (last 5)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {sessions.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (onClearAllSessions) onClearAllSessions();
                      setConfirmClear(false);
                    }}
                    className="px-2 py-1 rounded text-[10px] font-tech font-semibold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer shadow-2xs transition-colors"
                    title="Confirm clearing all sessions"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-1.5 py-1 rounded text-[10px] font-tech text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border-3)] bg-[var(--surface)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-tech text-rose-600 dark:text-rose-400 hover:text-white hover:bg-rose-600 bg-rose-500/10 border border-rose-500/30 transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="Clear all stored conversion sessions"
                >
                  <span className="text-[11px]">🗑</span>
                  <span>Clear All</span>
                </button>
              )
            )}

            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md border border-[var(--border-3)] hover:border-[var(--text)] bg-[var(--surface)] flex items-center justify-center text-[12px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
              title="Close sidebar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Storage limit info pill */}
        <div className="px-4 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between text-[11px] font-tech text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>Browser Local Cache</span>
          </span>
          <span className="text-[var(--faint)] text-[10px]">
            Fast 1-click restore
          </span>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {sessions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-6 text-[var(--faint)] select-none">
              {/* Friendly Vector Illustration */}
              <div className="relative mb-3 flex items-center justify-center">
                <svg
                  width="180"
                  height="130"
                  viewBox="0 0 200 150"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="max-w-full drop-shadow-xs"
                >
                  <defs>
                    <radialGradient id="aurora-glow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#8f83d8" stopOpacity="0.18" />
                      <stop offset="60%" stopColor="#d98fb0" stopOpacity="0.08" />
                      <stop offset="100%" stopColor="#8f83d8" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Soft atmospheric aura */}
                  <ellipse cx="100" cy="78" rx="85" ry="50" fill="url(#aurora-glow)" />

                  {/* Grounded dashed shelf line */}
                  <path
                    d="M 24 126 L 176 126"
                    stroke="var(--border-3)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />

                  {/* Floating PDF tag (left) */}
                  <g transform="translate(26, 44) rotate(-10)">
                    <rect
                      width="34"
                      height="21"
                      rx="5"
                      fill="var(--surface)"
                      stroke="#fca5a5"
                      strokeWidth="1.5"
                    />
                    <text
                      x="17"
                      y="14.5"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#ef4444"
                      fontFamily="monospace"
                    >
                      PDF
                    </text>
                  </g>

                  {/* Floating DOC tag (right) */}
                  <g transform="translate(142, 38) rotate(12)">
                    <rect
                      width="34"
                      height="21"
                      rx="5"
                      fill="var(--surface)"
                      stroke="#93c5fd"
                      strokeWidth="1.5"
                    />
                    <text
                      x="17"
                      y="14.5"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#3b82f6"
                      fontFamily="monospace"
                    >
                      DOC
                    </text>
                  </g>

                  {/* Floating XLS tag (bottom left) */}
                  <g transform="translate(34, 92) rotate(6)">
                    <rect
                      width="32"
                      height="19"
                      rx="4"
                      fill="var(--surface)"
                      stroke="#86efac"
                      strokeWidth="1.5"
                    />
                    <text
                      x="16"
                      y="13.5"
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="bold"
                      fill="#10b981"
                      fontFamily="monospace"
                    >
                      XLS
                    </text>
                  </g>

                  {/* Central Friendly Document Character */}
                  <g>
                    {/* Shadow underneath document */}
                    <ellipse cx="100" cy="122" rx="30" ry="4" fill="var(--border)" opacity="0.6" />

                    {/* Back page hint */}
                    <rect
                      x="74"
                      y="39"
                      width="58"
                      height="74"
                      rx="8"
                      fill="var(--surface-2)"
                      stroke="var(--border-3)"
                      strokeWidth="1.5"
                    />

                    {/* Main Document Body */}
                    <rect
                      x="70"
                      y="42"
                      width="60"
                      height="74"
                      rx="8"
                      fill="var(--surface)"
                      stroke="var(--border-3)"
                      strokeWidth="2"
                    />

                    {/* Folded Top-Right Corner */}
                    <path
                      d="M 116 42 L 130 56 L 116 56 Z"
                      fill="var(--surface-2)"
                      stroke="var(--border-3)"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />

                    {/* Little bookmark ribbon */}
                    <path
                      d="M 80 42 L 80 54 L 84 51 L 88 54 L 88 42 Z"
                      fill="#f59e0b"
                    />

                    {/* Cheerful Eyes */}
                    <circle cx="91" cy="71" r="2.5" fill="var(--text)" />
                    <circle cx="109" cy="71" r="2.5" fill="var(--text)" />

                    {/* Cute Rosy Cheeks */}
                    <circle cx="85" cy="77" r="4" fill="#fb7185" fillOpacity="0.35" />
                    <circle cx="115" cy="77" r="4" fill="#fb7185" fillOpacity="0.35" />

                    {/* Happy Smile */}
                    <path
                      d="M 96 76 Q 100 82 104 76"
                      fill="none"
                      stroke="var(--text)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />

                    {/* Document text hint lines */}
                    <line
                      x1="82"
                      y1="90"
                      x2="118"
                      y2="90"
                      stroke="var(--border-3)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <line
                      x1="86"
                      y1="97"
                      x2="114"
                      y2="97"
                      stroke="var(--border-3)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </g>

                  {/* Sparkles / Twinkles */}
                  <path
                    d="M 148 94 L 150 89 L 152 94 L 157 96 L 152 98 L 150 103 L 148 98 L 143 96 Z"
                    fill="#f59e0b"
                    opacity="0.85"
                  />
                  <path
                    d="M 52 32 L 53.5 28 L 55 32 L 59 33.5 L 55 35 L 53.5 39 L 52 35 L 48 33.5 Z"
                    fill="#a855f7"
                    opacity="0.8"
                  />
                  <circle cx="160" cy="78" r="1.5" fill="#f59e0b" opacity="0.7" />
                  <circle cx="48" cy="72" r="1.5" fill="#a855f7" opacity="0.7" />
                  <circle cx="132" cy="116" r="1.5" fill="#3b82f6" opacity="0.7" />
                </svg>
              </div>

              {/* Status pill badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-tech text-amber-600 dark:text-amber-400 mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
                <span>Conversion shelf is clear</span>
              </div>

              {/* Friendly message */}
              <h3 className="font-wireframe text-[16px] font-bold text-[var(--text)] mb-1 leading-snug">
                Ready for your first document!
              </h3>
              <p className="font-sans text-[12px] text-[var(--muted)] max-w-[270px] leading-relaxed mb-4">
                Whenever you convert a document, your last 5 conversions are automatically stored here for instant recall, side-by-side editing, and quick downloads.
              </p>

              {/* Action Button */}
              {onLoadSample && (
                <button
                  onClick={onLoadSample}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-amber-500/40 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20 text-[var(--text)] font-tech text-[11px] font-medium cursor-pointer shadow-2xs transition-all active:scale-95 mb-4"
                >
                  <span className="text-amber-500 font-bold">✨</span>
                  <span>Load Sample Report</span>
                </button>
              )}

              {/* Supported formats chip bar */}
              <div className="w-full pt-3.5 border-t border-[var(--border)] flex flex-col items-center gap-1.5">
                <span className="font-tech text-[9.5px] uppercase tracking-wider text-[var(--faint)]">
                  Formats you can convert
                </span>
                <div className="flex flex-wrap items-center justify-center gap-1 max-w-[260px]">
                  {['PDF', 'DOCX', 'XLSX', 'PPTX', 'HTML', 'CSV'].map((ext) => (
                    <span
                      key={ext}
                      className="font-tech text-[9px] px-1.5 py-0.5 rounded border border-[var(--border-3)] bg-[var(--surface)] text-[var(--muted)]"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </div>

              {/* LocalStorage privacy hint */}
              <div className="mt-3.5 flex items-center gap-1 text-[10px] font-tech text-[var(--faint)]">
                <span>🔒</span>
                <span>Saved locally in your browser cache</span>
              </div>
            </div>
          ) : (
            sessions.map((session, index) => {
              const isActive = activeSessionId === session.id;
              const ext = (session.original_name || session.filename || '').split('.').pop()?.toUpperCase() || 'MD';

              return (
                <div
                  key={session.id || index}
                  onClick={() => onSelectSession(session)}
                  className={`group relative rounded-lg border transition-all cursor-pointer p-3 text-left ${
                    isActive
                      ? 'border-amber-500 bg-amber-500/5 shadow-xs'
                      : 'border-[var(--border-3)] hover:border-[var(--text)]/40 bg-[var(--surface)] hover:bg-[var(--surface-2)]/50'
                  }`}
                >
                  {/* Top line: Extension pill + Title + Relative time */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`font-tech text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${getExtBadge(
                          session.original_name
                        )}`}
                      >
                        {ext}
                      </span>
                      <span className="font-medium text-[13px] text-[var(--text)] truncate font-sans" title={session.original_name}>
                        {session.original_name || session.filename || 'Converted Document'}
                      </span>
                    </div>

                    <span className="font-tech text-[10px] text-[var(--faint)] shrink-0">
                      {formatTime(session.timestamp)}
                    </span>
                  </div>

                  {/* Snippet preview */}
                  <div className="font-tech text-[11px] text-[var(--muted)] line-clamp-2 leading-relaxed bg-[var(--surface-2)]/60 rounded p-1.5 my-1.5 border border-[var(--border)] font-mono text-[10px] opacity-85">
                    {session.content?.slice(0, 140) || 'Empty document content'}
                  </div>

                  {/* Metadata Stats */}
                  <div className="flex items-center justify-between pt-1 font-tech text-[10px] text-[var(--faint)]">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-500 font-medium">
                        ⚡ {session.tokens_est?.toLocaleString() || Math.round((session.content?.length || 0) / 4)} tok
                      </span>
                      <span>·</span>
                      <span>{session.content?.length?.toLocaleString() || 0} ch</span>
                      {session.quality_score && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-500">Q:{session.quality_score}</span>
                        </>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleCopy(e, session)}
                        className="px-2 py-0.5 rounded border border-[var(--border-3)] hover:border-[var(--text)] bg-[var(--surface)] text-[9.5px] text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                        title="Copy Markdown"
                      >
                        {copiedId === session.id ? '✓' : 'Copy'}
                      </button>

                      <button
                        onClick={(e) => handleDownload(e, session)}
                        className="px-2 py-0.5 rounded border border-[var(--border-3)] hover:border-[var(--text)] bg-[var(--surface)] text-[9.5px] text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                        title="Download .md file"
                      >
                        ↓ .md
                      </button>

                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-500/15 text-[var(--faint)] hover:text-rose-500 transition-colors cursor-pointer text-[11px]"
                        title="Remove from history"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Active Indicator Badge */}
                  {isActive && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 font-tech text-[9px] text-amber-500 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      <span>● Active</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & Clear All action in sidebar */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-tech flex flex-col gap-2 select-none">
          {sessions.length > 0 && (
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
              <span className="text-[11px] text-[var(--muted)]">
                {sessions.length} of 5 slots used
              </span>
              {confirmClear ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] text-rose-500 font-medium">Delete all?</span>
                  <button
                    onClick={() => {
                      if (onClearAllSessions) onClearAllSessions();
                      setConfirmClear(false);
                    }}
                    className="px-2.5 py-1 rounded text-[10.5px] font-semibold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer shadow-2xs transition-colors"
                  >
                    Yes, Clear All
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-2 py-1 rounded text-[10.5px] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border-3)] bg-[var(--surface)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white font-tech text-[11px] font-medium cursor-pointer transition-all active:scale-95 shadow-2xs"
                  title="Empty all stored conversion sessions from local storage"
                >
                  <span className="text-[11px]">🗑</span>
                  <span>Clear All History</span>
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-[10.5px] text-[var(--faint)]">
            <span>Max 5 sessions stored</span>
            <span className="text-[var(--muted)]">Click item to open in reader</span>
          </div>
        </div>
      </aside>
    </>
  );
}
