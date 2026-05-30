'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILES = 10;

const ACCEPTED_EXTENSIONS = [
  '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls',
  '.html', '.htm', '.txt', '.csv', '.json', '.xml',
  '.epub', '.wav', '.mp3', '.jpg', '.jpeg', '.png', '.zip',
];

const EXT_META = {
  pdf:  { icon: '⬜', label: 'PDF',        color: '#F43F5E' },
  docx: { icon: '⬜', label: 'Word',       color: '#3B82F6' },
  doc:  { icon: '⬜', label: 'Word',       color: '#3B82F6' },
  pptx: { icon: '⬜', label: 'PowerPoint', color: '#F97316' },
  ppt:  { icon: '⬜', label: 'PowerPoint', color: '#F97316' },
  xlsx: { icon: '⬜', label: 'Excel',      color: '#22C55E' },
  xls:  { icon: '⬜', label: 'Excel',      color: '#22C55E' },
  html: { icon: '⬜', label: 'HTML',       color: '#A78BFA' },
  htm:  { icon: '⬜', label: 'HTML',       color: '#A78BFA' },
  txt:  { icon: '⬜', label: 'Text',       color: '#94A3B8' },
  csv:  { icon: '⬜', label: 'CSV',        color: '#2DD4BF' },
  json: { icon: '⬜', label: 'JSON',       color: '#FBBF24' },
  xml:  { icon: '⬜', label: 'XML',        color: '#FB923C' },
  epub: { icon: '⬜', label: 'ePub',       color: '#C084FC' },
  wav:  { icon: '⬜', label: 'Audio',      color: '#4ADE80' },
  mp3:  { icon: '⬜', label: 'Audio',      color: '#4ADE80' },
  jpg:  { icon: '⬜', label: 'Image',      color: '#60A5FA' },
  jpeg: { icon: '⬜', label: 'Image',      color: '#60A5FA' },
  png:  { icon: '⬜', label: 'Image',      color: '#60A5FA' },
  zip:  { icon: '⬜', label: 'ZIP',        color: '#A8A29E' },
};

const getExt = (filename) => filename.split('.').pop().toLowerCase();
const getMeta = (filename) => EXT_META[getExt(filename)] || { label: 'File', color: '#6B7280' };

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    pending:    { dot: 'bg-zinc-600',                     text: 'Pending'     },
    converting: { dot: 'bg-amber-400 animate-pulse-slow', text: 'Converting…' },
    done:       { dot: 'bg-emerald-500',                  text: 'Done'        },
    error:      { dot: 'bg-red-500',                      text: 'Error'       },
  };
  const cfg = map[status] || map.pending;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-none ${cfg.dot}`} />
      <span className="text-[10px] text-zinc-500 font-medium">{cfg.text}</span>
    </span>
  );
}

function FileTypePill({ filename }) {
  const meta = getMeta(filename);
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
      style={{ color: meta.color, backgroundColor: `${meta.color}18` }}
    >
      {meta.label}
    </span>
  );
}

function FileRow({ fileObj, onConvert, onRemove, isActive }) {
  return (
    <div className={`
      group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-150 animate-slide-up
      ${isActive
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-[#111114] border-[#1F1F24] hover:border-[#2A2A30]'
      }
    `}>
      {/* File type stripe */}
      <div
        className="w-0.5 h-7 rounded-full flex-none"
        style={{ backgroundColor: getMeta(fileObj.file.name).color }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200 truncate leading-tight">
          {fileObj.file.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <FileTypePill filename={fileObj.file.name} />
          <StatusBadge status={fileObj.status} />
          {fileObj.status === 'pending' && (
            <span className="text-[10px] text-zinc-600">{formatSize(fileObj.file.size)}</span>
          )}
          {fileObj.status === 'error' && fileObj.errorMsg && (
            <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={fileObj.errorMsg}>
              {fileObj.errorMsg}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-none opacity-0 group-hover:opacity-100 transition-opacity">
        {fileObj.status === 'pending' && (
          <button
            onClick={() => onConvert(fileObj)}
            className="text-[10px] font-medium px-2 py-1 rounded-md text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition-colors"
          >
            Convert
          </button>
        )}
        <button
          onClick={() => onRemove(fileObj.id)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors text-base leading-none"
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function EmptyOutput() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 rounded-xl border border-dashed border-[#1F1F24]">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-[#111114] border border-[#1F1F24] flex items-center justify-center text-2xl">
          <span style={{ fontFamily: 'monospace' }}>#</span>
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[10px] text-amber-400">
          ↓
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500">No output yet</p>
        <p className="text-xs text-zinc-700 mt-0.5">Converted Markdown will appear here</p>
      </div>
    </div>
  );
}

function HighlightedMarkdown({ content }) {
  // Lightweight syntax highlight: headings, bold, code, links
  const lines = content.split('\n');
  return (
    <pre className="markdown-pre p-4 pb-8">
      {lines.map((line, i) => {
        if (/^#{1,6}\s/.test(line)) {
          return (
            <span key={i} className="block text-amber-400/90 font-medium">
              {line}{'\n'}
            </span>
          );
        }
        if (/^[-*]{3,}$/.test(line.trim())) {
          return (
            <span key={i} className="block border-b border-zinc-800 my-1">
              {'\n'}
            </span>
          );
        }
        if (/^```/.test(line) || /^    /.test(line)) {
          return (
            <span key={i} className="block text-violet-400/80">
              {line}{'\n'}
            </span>
          );
        }
        if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
          return (
            <span key={i} className="block text-sky-300/70">
              {line}{'\n'}
            </span>
          );
        }
        return <span key={i} className="block text-zinc-400">{line}{'\n'}</span>;
      })}
    </pre>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [files, setFiles]               = useState([]);
  const [results, setResults]           = useState([]);
  const [converting, setConverting]     = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [dragActive, setDragActive]     = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');
  const [copied, setCopied]             = useState(false);
  const [logoHover, setLogoHover]       = useState(false);
  const [wakeCountdown, setWakeCountdown] = useState(null); // null = not counting

  const fileInputRef    = useRef(null);
  const convertingIds   = useRef(new Set());
  const outputScrollRef = useRef(null);
  const countdownRef    = useRef(null); // holds the 1-s tick interval
  const pollRef         = useRef(null); // holds the 5-s poll interval

  // ── Start / stop the visible 60-s countdown
  const startCountdown = useCallback(() => {
    if (countdownRef.current) return; // already running
    setWakeCountdown(60);
    countdownRef.current = setInterval(() => {
      setWakeCountdown((n) => {
        if (n <= 1) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }, []);

  const stopCountdown = useCallback(() => {
    clearInterval(countdownRef.current);
    countdownRef.current = null;
    setWakeCountdown(null);
  }, []);

  // ── Server health check — polls every 5 s, wakes backend on mount
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health', {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          setServerStatus('online');
          stopCountdown();          // clear countdown as soon as we're online
        } else {
          setServerStatus('offline');
          startCountdown();         // only start counting if backend is NOT ok
        }
      } catch {
        setServerStatus('offline');
        startCountdown();           // only start counting on actual failure
      }
    };

    // Fire immediately on mount — this wakes the Render backend
    // Do NOT start countdown here; wait for the actual check result.
    check();

    // Poll every 5 s
    pollRef.current = setInterval(check, 5000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(countdownRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Add files (deduplicate by name)
  const addFiles = useCallback((incoming) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.file.name));
      const slots    = MAX_FILES - prev.length;
      const toAdd    = arr
        .filter((f) => !existing.has(f.name))
        .slice(0, slots)
        .map((f) => ({ file: f, status: 'pending', id: uid() }));
      return [...prev, ...toAdd];
    });
  }, []);

  // ── Drag handlers
  const handleDragOver  = useCallback((e) => { e.preventDefault(); setDragActive(true); }, []);
  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // ── Convert a single file
  const convertOne = useCallback(async (fileObj) => {
    if (convertingIds.current.has(fileObj.id)) return;
    convertingIds.current.add(fileObj.id);

    setFiles((prev) =>
      prev.map((f) => f.id === fileObj.id ? { ...f, status: 'converting' } : f)
    );

    const form = new FormData();
    form.append('file', fileObj.file);

    try {
      const res  = await fetch('/api/convert', { method: 'POST', body: form });

      // Guard against non-JSON responses (e.g. Render gateway errors)
      let data = {};
      try { data = await res.json(); } catch { /* keep empty data */ }

      if (!res.ok) {
        // FastAPI errors use `detail`; previous route.js used `error`
        const msg = data.error || data.detail || `Server error (${res.status})`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }

      setFiles((prev) =>
        prev.map((f) => f.id === fileObj.id ? { ...f, status: 'done' } : f)
      );
      setResults((prev) => {
        const idx   = prev.findIndex((r) => r.id === fileObj.id);
        const entry = { ...data, id: fileObj.id };
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = entry;
          return updated;
        }
        const next = [...prev, entry];
        // Auto-select the new result
        setActiveResult(next.length - 1);
        return next;
      });
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileObj.id
            ? { ...f, status: 'error', errorMsg: err.message }
            : f
        )
      );
    } finally {
      convertingIds.current.delete(fileObj.id);
    }
  }, []);

  // ── Convert all pending — SEQUENTIAL to avoid backend OOM on free tier
  const convertAll = useCallback(async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (!pending.length) return;
    setConverting(true);
    for (const fileObj of pending) {
      await convertOne(fileObj);
      // Small delay between files to let the backend free memory
      await new Promise((r) => setTimeout(r, 300));
    }
    setConverting(false);
  }, [files, convertOne]);

  // ── Remove file + its result
  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setResults((prev) => {
      const next = prev.filter((r) => r.id !== id);
      setActiveResult((cur) => Math.min(cur, Math.max(0, next.length - 1)));
      return next;
    });
  };

  // ── Download helpers
  const downloadResult = (result) => {
    const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    results.forEach((r, i) => setTimeout(() => downloadResult(r), i * 120));
  };

  const copyToClipboard = async () => {
    const r = results[activeResult];
    if (!r) return;
    await navigator.clipboard.writeText(r.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setActiveResult(0);
    convertingIds.current.clear();
  };

  // ── Derived state
  const pendingCount    = files.filter((f) => f.status === 'pending').length;
  const doneCount       = files.filter((f) => f.status === 'done').length;
  const currentResult   = results[activeResult];
  const isFull          = files.length >= MAX_FILES;
  const hasAnyConverting = files.some((f) => f.status === 'converting');

  // ── Render
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: '#08080A', color: '#ECECF1', fontFamily: 'Inter, sans-serif' }}
    >
      {/* ── Header ── */}
      <header className="flex-none flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: '#1A1A1F' }}>
        <div className="flex items-center gap-3">
          {/* Logo mark + hover popup */}
          <div
            className="relative flex-none"
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
          >
            {/* Icon */}
            <img
              src="/mdify-icon.png"
              alt="MDify"
              className="w-7 h-7 rounded-lg cursor-pointer select-none object-cover"
              style={{ boxShadow: '0 0 10px rgba(0,0,0,0.5)' }}
            />

            {/* Hover popup */}
            {logoHover && (
              <div
                className="absolute top-full left-0 mt-2 z-50 rounded-xl p-4 flex flex-col gap-3 w-56"
                style={{
                  background: '#111114',
                  border: '1px solid #2A2A30',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.08)',
                  animation: 'slideUp 0.15s ease-out forwards',
                }}
              >
                {/* App branding */}
                <div className="flex items-center gap-2">
                  <img
                    src="/mdify-icon.png"
                    alt="MDify"
                    className="w-8 h-8 rounded-lg flex-none object-cover"
                    style={{ boxShadow: '0 0 8px rgba(0,0,0,0.5)' }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-100 leading-tight">MDify</p>
                    <p className="text-[10px] text-zinc-500 leading-tight">Document → Markdown</p>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid #1F1F24' }} />

                {/* Dev info */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">Developer</p>
                  <a
                    href="https://github.com/DevBehindYou"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 group/link"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-500 group-hover/link:text-amber-400 transition-colors flex-none">
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span className="text-xs text-zinc-400 group-hover/link:text-amber-400 transition-colors font-medium">DevBehindYou</span>
                  </a>
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid #1F1F24' }} />

                {/* Why Use It */}
                <Link
                  href="/usecase"
                  className="flex items-center justify-between group/usecase"
                >
                  <span className="text-xs text-zinc-400 group-hover/usecase:text-amber-400 transition-colors font-medium">Why Use It?</span>
                  <span className="text-[10px] text-zinc-600 group-hover/usecase:text-amber-500 transition-colors">→</span>
                </Link>
              </div>
            )}
          </div>

          {/* App title (also triggers hover) */}
          <div
            className="cursor-default select-none"
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
          >
            <h1 className="text-sm font-semibold leading-tight tracking-tight">MDify</h1>
            <p className="text-[10px] text-zinc-600 leading-tight">by DevBehindYou · powered by MarkItDown</p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Server status */}
          <button
            onClick={async () => {
              setServerStatus('checking');
              stopCountdown();
              startCountdown();
              try {
                const res = await fetch('/api/health', { signal: AbortSignal.timeout(8000) });
                if (res.ok) { setServerStatus('online'); stopCountdown(); }
                else { setServerStatus('offline'); }
              } catch { setServerStatus('offline'); }
            }}
            className="flex items-center gap-1.5 text-[11px] hover:opacity-80 transition-opacity hidden sm:flex"
            title="Click to retry backend connection"
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-none ${
              serverStatus === 'online'
                ? 'bg-emerald-500'
                : wakeCountdown !== null
                ? 'bg-amber-400 animate-pulse-slow'
                : 'bg-red-500'
            }`} />
            <span className="text-zinc-500">
              {serverStatus === 'online'
                ? 'Backend ready'
                : wakeCountdown !== null && wakeCountdown > 0
                ? `Waking up… ${wakeCountdown}s`
                : wakeCountdown === 0
                ? 'Backend offline'
                : 'Connecting…'}
            </span>
          </button>

          {/* Slot counter */}
          <div className="flex items-center gap-1 text-[11px] text-zinc-600">
            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {files.length}/{MAX_FILES}
            </span>
            <span>files</span>
          </div>
        </div>
      </header>

      {/* ── Two-panel body ── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

        {/* ─────── LEFT: INPUT PANEL ─────── */}
        <div className="md:w-[44%] w-full flex flex-col p-3 md:p-4 gap-3 min-h-0 min-w-0 h-[46vh] md:h-auto border-b md:border-b-0 md:border-r" style={{ borderColor: '#1A1A1F' }}>

          {/* Panel label */}
          <div className="flex items-center justify-between flex-none">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Input
            </span>
            {files.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !isFull && fileInputRef.current?.click()}
            className={`
              relative flex-none rounded-xl border-2 border-dashed p-4 md:p-6 text-center select-none
              transition-all duration-200
              ${isFull ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              ${dragActive
                ? 'border-amber-500 drop-shimmer'
                : 'border-[#1F1F24] hover:border-[#2A2A32]'
              }
            `}
            style={dragActive ? { borderColor: '#F59E0B', background: 'rgba(245,158,11,0.04)' } : {}}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              className="hidden"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              disabled={isFull}
            />

            {dragActive ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">⬇</span>
                <p className="text-sm font-semibold" style={{ color: '#F59E0B' }}>
                  Drop to add files
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold mb-0.5"
                  style={{ background: '#16161A', border: '1px solid #2A2A30' }}
                >
                  ↑
                </div>
                <p className="text-sm font-medium text-zinc-300">
                  {isFull ? 'File limit reached (10)' : 'Drop files or click to browse'}
                </p>
                <p className="text-[11px] text-zinc-600">
                  PDF · Word · Excel · PowerPoint · HTML · CSV · JSON · ePub · Audio · Image
                </p>
              </div>
            )}
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-0.5">
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
                <p className="text-xs text-zinc-700">No files added yet</p>
                <p className="text-[10px] text-zinc-800">Supports up to 10 documents at a time</p>
              </div>
            ) : (
              files.map((fileObj) => (
                <FileRow
                  key={fileObj.id}
                  fileObj={fileObj}
                  onConvert={convertOne}
                  onRemove={removeFile}
                  isActive={fileObj.status === 'converting'}
                />
              ))
            )}
          </div>

          {/* Action bar */}
          {files.length > 0 && (
            <div className="flex-none flex gap-2">
              <button
                onClick={convertAll}
                disabled={converting || pendingCount === 0}
                className={`
                  flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all duration-150
                  ${pendingCount > 0 && !converting
                    ? 'text-black'
                    : 'text-zinc-600 cursor-not-allowed'
                  }
                `}
                style={
                  pendingCount > 0 && !converting
                    ? {
                        background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                        boxShadow: '0 0 20px rgba(245,158,11,0.2)',
                      }
                    : { background: '#16161A', border: '1px solid #1F1F24' }
                }
              >
                {hasAnyConverting
                  ? `Converting… (${doneCount}/${files.length})`
                  : pendingCount > 0
                  ? `Convert ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`
                  : 'All done ✓'
                }
              </button>

              {results.length > 0 && (
                <button
                  onClick={downloadAll}
                  className="py-2.5 px-3 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                  style={{ background: '#16161A', border: '1px solid #1F1F24' }}
                  title="Download all .md files"
                >
                  ↓ All
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─────── RIGHT: OUTPUT PANEL ─────── */}
        <div className="flex-1 flex flex-col p-3 md:p-4 gap-3 min-h-0 min-w-0 h-[54vh] md:h-auto">

          {/* Panel label */}
          <div className="flex items-center justify-between flex-none">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Output
            </span>
            <span className="text-[10px] text-zinc-700">
              {results.length > 0 ? `${results.length} file${results.length !== 1 ? 's' : ''} converted` : ''}
            </span>
          </div>

          {/* ── Download All strip — always visible when 2+ results ── */}
          {results.length > 1 && (
            <div
              className="flex-none flex items-center justify-between px-3 py-2 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-600">
                  {results.length} files ready to download
                </span>
              </div>
              <button
                onClick={downloadAll}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-lg text-black transition-all"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', boxShadow: '0 0 12px rgba(245,158,11,0.2)' }}
              >
                ↓ Download all {results.length} .md files
              </button>
            </div>
          )}

          {/* Empty state */}
          {results.length === 0 && <EmptyOutput />}

          {/* Results view */}
          {results.length > 0 && (
            <>
              {/* Tab bar — horizontally scrollable, tabs truncated */}
              <div className="flex-none flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'thin' }}>
                {results.map((result, i) => (
                  <button
                    key={result.id}
                    onClick={() => setActiveResult(i)}
                    title={result.filename}
                    className={`
                      flex-none text-[11px] font-medium px-2.5 py-1 rounded-lg
                      transition-all duration-150 max-w-[160px] md:max-w-[200px]
                      ${activeResult === i
                        ? 'text-amber-400'
                        : 'text-zinc-600 hover:text-zinc-400'
                      }
                    `}
                    style={
                      activeResult === i
                        ? { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }
                        : { background: '#111114', border: '1px solid #1F1F24' }
                    }
                  >
                    <span className="block truncate">{result.filename}</span>
                  </button>
                ))}
              </div>

              {/* Active result */}
              {currentResult && (
                <div className="flex-1 flex flex-col gap-2 min-h-0">

                  {/* Toolbar */}
                  <div className="flex-none flex items-center justify-between gap-2 min-w-0">
                    {/* Meta info */}
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                      <span
                        className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded-md truncate max-w-[140px] md:max-w-[260px]"
                        style={{ background: '#16161A', border: '1px solid #1F1F24' }}
                        title={currentResult.filename}
                      >
                        {currentResult.filename}
                      </span>
                      <span className="text-[10px] text-zinc-700 hidden sm:inline whitespace-nowrap">
                        {currentResult.word_count?.toLocaleString()} words
                      </span>
                      <span className="text-[10px] text-zinc-700 hidden sm:inline whitespace-nowrap">
                        {currentResult.char_count?.toLocaleString()} chars
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-none">
                      <button
                        onClick={copyToClipboard}
                        className="text-[11px] px-2.5 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                        style={{ background: '#16161A', border: '1px solid #1F1F24' }}
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => downloadResult(currentResult)}
                        className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all"
                        style={{
                          background: 'rgba(245,158,11,0.1)',
                          border: '1px solid rgba(245,158,11,0.2)',
                          color: '#F59E0B',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.18)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; }}
                      >
                        ↓ Download .md
                      </button>
                    </div>
                  </div>

                  {/* Markdown viewer */}
                  <div
                    ref={outputScrollRef}
                    className="flex-1 overflow-y-auto rounded-xl min-h-0"
                    style={{
                      background: '#0C0C0F',
                      border: '1px solid #1A1A1F',
                    }}
                  >
                    {/* Viewer header bar */}
                    <div
                      className="sticky top-0 z-10 flex items-center justify-between px-4 py-2"
                      style={{
                        background: '#0C0C0F',
                        borderBottom: '1px solid #1A1A1F',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500/50" />
                          <span className="w-2 h-2 rounded-full bg-amber-500/50" />
                          <span className="w-2 h-2 rounded-full bg-emerald-500/50" />
                        </div>
                        <span
                          className="text-[10px] text-zinc-600 uppercase tracking-widest"
                          style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                          markdown
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-700">
                        {currentResult.original_name} → {currentResult.filename}
                      </span>
                    </div>

                    {/* Content */}
                    <HighlightedMarkdown content={currentResult.content} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Footer status bar ── */}
      <div
        className="flex-none flex items-center justify-between px-5 py-2 border-t"
        style={{ borderColor: '#1A1A1F', background: '#08080A' }}
      >
        <div className="flex items-center gap-3 text-[10px] text-zinc-700">
          <span>MDify</span>
          <span className="text-zinc-800">·</span>
          <a
            href="https://github.com/DevBehindYou"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-500/70 transition-colors"
          >
            DevBehindYou
          </a>
          <span className="text-zinc-800">·</span>
          <span>Powered by MarkItDown</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-700">
          {doneCount > 0 && (
            <span className="text-emerald-500/70">{doneCount} file{doneCount !== 1 ? 's' : ''} converted</span>
          )}
          <span>Up to {MAX_FILES} files per session</span>
        </div>
      </div>
    </div>
  );
}
