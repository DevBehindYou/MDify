'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || '';

const ACCEPTED = [
  '.pdf','.docx','.doc','.pptx','.ppt','.xlsx','.xls',
  '.html','.htm','.txt','.csv','.json','.xml',
  '.epub','.wav','.mp3','.jpg','.jpeg','.png','.zip',
];

const EXT_COLOR = {
  pdf:'#F43F5E', docx:'#3B82F6', doc:'#3B82F6',
  pptx:'#F97316', ppt:'#F97316', xlsx:'#22C55E', xls:'#22C55E',
  html:'#A78BFA', htm:'#A78BFA', txt:'#94A3B8', csv:'#2DD4BF',
  json:'#FBBF24', xml:'#FB923C', epub:'#C084FC',
  wav:'#4ADE80', mp3:'#4ADE80', jpg:'#60A5FA', jpeg:'#60A5FA',
  png:'#60A5FA', zip:'#A8A29E',
};

const getExt  = (n) => n.split('.').pop().toLowerCase();
const getColor = (n) => EXT_COLOR[getExt(n)] || '#6B7280';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function highlight(content) {
  return content.split('\n').map((line, i) => {
    if (/^#{1,6}\s/.test(line))
      return <span key={i} className="block" style={{ color: '#F59E0B' }}>{line}{'\n'}</span>;
    if (/^```/.test(line))
      return <span key={i} className="block" style={{ color: '#A78BFA' }}>{line}{'\n'}</span>;
    if (/^\s*[-*+]\s|^\s*\d+\.\s/.test(line))
      return <span key={i} className="block" style={{ color: '#7DD3FC' }}>{line}{'\n'}</span>;
    if (/^\|/.test(line))
      return <span key={i} className="block" style={{ color: '#86EFAC' }}>{line}{'\n'}</span>;
    return <span key={i} className="block" style={{ color: '#b4b4c0' }}>{line}{'\n'}</span>;
  });
}

function download(filename, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
  a.download = filename.replace(/\.[^.]+$/, '.md');
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, setState] = useState('idle'); // idle | dragging | converting | done | error
  const [result, setResult]   = useState(null);  // { filename, content }
  const [errMsg, setErrMsg]   = useState('');
  const [copied, setCopied]   = useState(false);
  const [waking, setWaking]   = useState(false); // true while backend is cold-starting
  const [backendOk, setBackendOk] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const fileInput = useRef(null);
  const pollRef   = useRef(null);
  const timerRef  = useRef(null);

  // ── Backend wake-up on mount ──────────────────────────────────────────────
  useEffect(() => {
    // 1) Direct wake ping (bypasses Next.js proxy so Render gets the request)
    if (BACKEND) {
      fetch(`${BACKEND}/health`, { mode: 'cors', signal: AbortSignal.timeout(45000) })
        .catch(() => {});
    }

    // 2) Poll via proxy every 5 s to detect when ready
    const check = async () => {
      try {
        const r = await fetch('/api/health', { signal: AbortSignal.timeout(10000) });
        if (r.ok) {
          setBackendOk(true);
          setWaking(false);
          setCountdown(null);
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
        }
      } catch { /* still waking */ }
    };

    check();
    pollRef.current = setInterval(check, 5000);

    // 90-s countdown indicator
    setCountdown(90);
    timerRef.current = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { clearInterval(timerRef.current); return null; }
        return n - 1;
      });
    }, 1000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, []);

  // ── Conversion ───────────────────────────────────────────────────────────
  const convert = useCallback(async (file) => {
    if (!file) return;
    setState('converting');
    setResult(null);
    setErrMsg('');
    setWaking(false);

    try {
      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/convert', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      setResult({ filename: file.name, content: data.markdown || data.content || '' });
      setState('done');
    } catch (e) {
      setErrMsg(e.message || 'Conversion failed');
      setState('error');
    }
  }, []);

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const onDragOver  = (e) => { e.preventDefault(); setState(s => s === 'converting' ? s : 'dragging'); };
  const onDragLeave = ()  => { setState(s => s === 'dragging' ? 'idle' : s); };
  const onDrop      = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) convert(file);
  };

  const onPick = (e) => {
    const file = e.target.files[0];
    if (file) convert(file);
    e.target.value = '';
  };

  const reset = () => { setState('idle'); setResult(null); setErrMsg(''); setCopied(false); };

  // ── Copy ─────────────────────────────────────────────────────────────────
  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── UI States ─────────────────────────────────────────────────────────────
  const isDragging   = state === 'dragging';
  const isConverting = state === 'converting';
  const isDone       = state === 'done';
  const isError      = state === 'error';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#08080A' }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: '#1A1A1F', background: 'rgba(8,8,10,0.95)', backdropFilter: 'blur(10px)' }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/mdify-icon.png"
            alt="MDify Lite"
            className="w-7 h-7 rounded-lg object-cover"
            style={{ boxShadow: '0 0 8px rgba(0,0,0,0.5)' }}
          />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold text-zinc-100">MDify</span>
            <span
              className="text-[9px] font-bold uppercase tracking-[0.14em]"
              style={{ color: '#F59E0B' }}
            >
              Lite
            </span>
          </div>
        </div>

        {/* Backend status pill */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-none ${
              backendOk ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-zinc-500">
            {backendOk
              ? 'Backend ready'
              : countdown
              ? `Waking… ${countdown}s`
              : 'Connecting…'}
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 gap-6">

        {/* Drop zone */}
        {!isDone && !isError && (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !isConverting && fileInput.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-5 w-full max-w-md rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none ${
              isDragging
                ? 'border-amber-500/60 bg-amber-500/5 drop-shimmer'
                : isConverting
                ? 'border-zinc-700 bg-[#111114] cursor-default'
                : 'border-zinc-800 bg-[#111114] hover:border-zinc-600 hover:bg-[#131316]'
            }`}
            style={{ minHeight: 260 }}
          >
            {/* Hidden input */}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(',')}
              onChange={onPick}
              className="hidden"
            />

            {isConverting ? (
              <>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                  <span className="spin" style={{ color: '#F59E0B' }}>⟳</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300">Converting…</p>
                  <p className="text-xs text-zinc-600 mt-0.5">This takes a few seconds</p>
                </div>
              </>
            ) : (
              <>
                {/* Upload icon */}
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: isDragging ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isDragging ? 'rgba(245,158,11,0.3)' : '#1F1F24'}`,
                  }}
                >
                  <svg
                    width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke={isDragging ? '#F59E0B' : '#4B5563'} strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>

                <div className="text-center px-6">
                  <p
                    className="text-base font-semibold"
                    style={{ color: isDragging ? '#F59E0B' : '#ECECF1' }}
                  >
                    {isDragging ? 'Drop to convert' : 'Drop a file here'}
                  </p>
                  <p className="text-xs text-zinc-600 mt-1">
                    or click to browse — any supported format
                  </p>
                </div>

                {/* Accepted formats */}
                <div className="flex flex-wrap justify-center gap-1 px-6">
                  {['PDF','DOCX','PPTX','XLSX','HTML','TXT','CSV','JSON','MP3','PNG'].map(f => (
                    <span
                      key={f}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: '#6B7280', background: '#1A1A1F' }}
                    >
                      {f}
                    </span>
                  ))}
                  <span className="text-[9px] text-zinc-700 self-center">+more</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Result ── */}
        {isDone && result && (
          <div
            className="w-full max-w-2xl flex flex-col gap-3 slide-up"
            style={{ maxHeight: '70vh' }}
          >
            {/* Result header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-1 h-5 rounded-full flex-none"
                  style={{ background: getColor(result.filename) }}
                />
                <p className="text-sm font-medium text-zinc-200 truncate">{result.filename}</p>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-none"
                  style={{ color: '#22C55E', background: 'rgba(34,197,94,0.1)' }}
                >
                  DONE
                </span>
              </div>

              <div className="flex items-center gap-2 flex-none">
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    color: copied ? '#22C55E' : '#ECECF1',
                    background: copied ? 'rgba(34,197,94,0.1)' : '#111114',
                    border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : '#1F1F24'}`,
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => download(result.filename, result.content)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    color: '#000',
                    boxShadow: '0 0 16px rgba(245,158,11,0.25)',
                  }}
                >
                  ↓ Download .md
                </button>
                <button
                  onClick={reset}
                  className="text-xs text-zinc-600 hover:text-zinc-400 px-2 py-1.5 rounded-lg transition-colors"
                  title="Convert another file"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Markdown preview */}
            <div
              className="flex-1 overflow-y-auto rounded-xl border"
              style={{ background: '#0D0D10', borderColor: '#1F1F24', minHeight: 200, maxHeight: '60vh' }}
            >
              <pre className="md-pre p-4">
                {highlight(result.content)}
              </pre>
            </div>

            {/* Convert another */}
            <button
              onClick={reset}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors text-center py-1"
            >
              ← Convert another file
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {isError && (
          <div
            className="w-full max-w-md flex flex-col items-center gap-4 p-6 rounded-2xl border slide-up"
            style={{ background: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.15)' }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'rgba(239,68,68,0.08)' }}
            >
              ⚠
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-red-400">Conversion failed</p>
              <p className="text-xs text-zinc-600 mt-1.5 leading-relaxed max-w-xs">{errMsg}</p>
            </div>
            <button
              onClick={reset}
              className="text-xs font-medium px-4 py-2 rounded-lg transition-all hover:scale-105"
              style={{ background: '#111114', border: '1px solid #1F1F24', color: '#ECECF1' }}
            >
              Try again
            </button>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        className="flex items-center justify-between px-5 py-3 border-t flex-wrap gap-2"
        style={{ borderColor: '#1A1A1F' }}
      >
        <div className="flex items-center gap-3 text-[10px] text-zinc-700">
          <span>MDify Lite</span>
          <span>·</span>
          <a
            href="https://github.com/DevBehindYou"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-500/60 transition-colors"
          >
            DevBehindYou
          </a>
          <span>·</span>
          <span>Powered by Microsoft MarkItDown</span>
        </div>
        <a
          href="https://mdify-app.onrender.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors"
        >
          Full version →
        </a>
      </footer>
    </div>
  );
}
