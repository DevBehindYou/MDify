'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import JSZip from 'jszip';
import MarkDifyHeader from '../components/MarkDifyHeader';
import MarkDifyFooter from '../components/MarkDifyFooter';
import MobileDock from '../components/MobileDock';
import BlogModal from '../components/BlogModal';
import ApiModal from '../components/ApiModal';
import LegalModal from '../components/LegalModal';
import MarkdownViewer from '../components/MarkdownViewer';
import RecentSessionsSidebar from '../components/RecentSessionsSidebar';
import {
  getRecentSessions,
  saveRecentSession,
  deleteRecentSession,
  clearAllRecentSessions,
  generateSampleSession,
} from '../lib/recentSessions';

// ── Constants ──────────────────────────────────────────────────────────────
const MAX_FILES = 20;

const FORMAT_TAGS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML', 'CSV', 'JSON', 'PNG'];
const PROFILES = ['Standard', 'Clean', 'Compact', 'RAG-ready'];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function Home() {
  // ── States
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [converting, setConverting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewMode, setPreviewMode] = useState('split'); // 'split' | 'rendered' | 'raw'
  const [profile, setProfile] = useState('Standard');
  const [viewLayout, setViewLayout] = useState('auto'); // 'auto' | '1a' | '1c'
  const [toast, setToast] = useState(null);

  // Recent Sessions in Local Storage
  const [recentSessions, setRecentSessions] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  
  // Mobile sheet state (1f)
  const [sheetExpanded, setSheetExpanded] = useState(false);
  
  // Modals & Menu
  const [blogOpen, setBlogOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // 'privacy' | 'terms' | null
  const [menuOpen, setMenuOpen] = useState(false);

  // Server health state
  const [serverStatus, setServerStatus] = useState('online'); // 'online' | 'waking' | 'offline' | 'checking'
  const [wakeCountdown, setWakeCountdown] = useState(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState('dark');

  // Refs
  const fileInputRef = useRef(null);
  const convertingIds = useRef(new Set());
  const countdownRef = useRef(null);
  const pollRef = useRef(null);
  const toastTimerRef = useRef(null);

  // ── Toast helper
  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  // ── Theme init & toggle, and load recent sessions
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setTheme(document.documentElement.dataset.theme || 'dark');
      // Load last 5 sessions from local storage
      setRecentSessions(getRecentSessions());
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('mdify-theme', next);
    } catch {
      // ignore
    }
    setTheme(next);
  }, [theme]);

  // ── Server health check
  const startCountdown = useCallback(() => {
    if (countdownRef.current) return;
    setWakeCountdown(24);
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
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setWakeCountdown(null);
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        setServerStatus('online');
        stopCountdown();
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
  }, [stopCountdown]);

  useEffect(() => {
    checkHealth();
    pollRef.current = setInterval(checkHealth, 8000);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(countdownRef.current);
    };
  }, [checkHealth]);

  // ── File Management
  const addFiles = useCallback((incoming) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.file.name));
      const slots = MAX_FILES - prev.length;
      const toAdd = arr
        .filter((f) => !existing.has(f.name))
        .slice(0, slots)
        .map((f) => ({
          file: f,
          status: 'pending',
          progress: 0,
          id: uid(),
          errorMsg: null,
        }));
      return [...prev, ...toAdd];
    });
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  // ── Convert a single file
  const convertOne = useCallback(
    async (fileObj) => {
      if (convertingIds.current.has(fileObj.id)) return;
      convertingIds.current.add(fileObj.id);

      setFiles((prev) =>
        prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'converting', progress: 45 } : f))
      );

      const form = new FormData();
      form.append('file', fileObj.file);
      form.append('profile', profile);

      try {
        const res = await fetch('/api/convert', { method: 'POST', body: form });
        let data = {};
        try {
          data = await res.json();
        } catch {
          // ignore
        }

        if (!res.ok) {
          const msg = data.detail || data.error || `Conversion failed (${res.status})`;
          throw new Error(msg);
        }

        setFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'done', progress: 100 } : f))
        );

        setResults((prev) => {
          const idx = prev.findIndex((r) => r.id === fileObj.id);
          const entry = { ...data, id: fileObj.id };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = entry;
            return next;
          }
          const next = [...prev, entry];
          setActiveResultIdx(next.length - 1);
          return next;
        });

        // Store session in local storage (last 5 successful conversion sessions)
        try {
          const updated = saveRecentSession({
            id: fileObj.id,
            filename: data.filename || `${fileObj.file.name}.md`,
            original_name: data.original_name || fileObj.file.name,
            content: data.content,
            tokens_est: data.tokens_est,
            quality_score: data.quality_score,
            profile: profile,
            fileSize: fileObj.file?.size,
          });
          setRecentSessions(updated);
          setActiveSessionId(fileObj.id);
        } catch (storageErr) {
          console.warn('Could not cache session to local storage:', storageErr);
        }
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? { ...f, status: 'error', progress: 0, errorMsg: err.message }
              : f
          )
        );
      } finally {
        convertingIds.current.delete(fileObj.id);
      }
    },
    [profile]
  );

  // ── Convert all pending files
  const convertAll = useCallback(async () => {
    const pending = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (!pending.length) return;
    setConverting(true);
    for (const item of pending) {
      await convertOne(item);
      await new Promise((r) => setTimeout(r, 200));
    }
    setConverting(false);
  }, [files, convertOne]);

  // ── Remove file
  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setResults((prev) => {
      const next = prev.filter((r) => r.id !== id);
      setActiveResultIdx((cur) => Math.min(cur, Math.max(0, next.length - 1)));
      return next;
    });
  };

  // ── Clear all
  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setActiveResultIdx(0);
    convertingIds.current.clear();
  };

  // ── Download helpers
  const downloadSingle = (result) => {
    if (!result) return;
    const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename || 'converted.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllZip = async () => {
    if (!results.length) return;
    const zip = new JSZip();
    results.forEach((r) => {
      zip.file(r.filename || `${r.original_name}.md`, r.content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mdify-converted.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyContent = async () => {
    const current = results[activeResultIdx];
    if (!current?.content) return;
    await navigator.clipboard.writeText(current.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // ── Real-time markdown content update from editor
  const handleUpdateContent = useCallback((newContent) => {
    setResults((prev) => {
      const next = [...prev];
      if (next[activeResultIdx]) {
        next[activeResultIdx] = {
          ...next[activeResultIdx],
          content: newContent,
        };
      }
      return next;
    });
  }, [activeResultIdx]);

  // ── Active item and stats
  const activeResult = results[activeResultIdx] || null;
  const hasFiles = files.length > 0;
  const isThreeColumn = viewLayout === '1c' || (viewLayout === 'auto' && hasFiles);

  // Conversion API waiting state for skeleton feedback
  const isConvertingAny = converting || files.some((f) => f.status === 'converting');
  const convertingFile = files.find((f) => f.status === 'converting');
  const convertingFileName = convertingFile?.file?.name || '';
  const isWaitingForApi = Boolean(isConvertingAny);

  // ── Recent Sessions Handlers
  const handleSelectRecentSession = useCallback((session) => {
    setActiveSessionId(session.id);

    // Check if it's already present in results
    const existingIdx = results.findIndex((r) => r.id === session.id);
    if (existingIdx >= 0) {
      setActiveResultIdx(existingIdx);
    } else {
      // Add to results so reader can display it
      const entry = {
        id: session.id,
        filename: session.filename,
        original_name: session.original_name,
        content: session.content,
        tokens_est: session.tokens_est,
        quality_score: session.quality_score,
      };
      setResults((prev) => {
        const next = [...prev, entry];
        setActiveResultIdx(next.length - 1);
        return next;
      });

      // Also add a corresponding entry to files list so the queue/list reflects it
      setFiles((prev) => {
        if (prev.some((f) => f.id === session.id)) return prev;
        return [
          ...prev,
          {
            id: session.id,
            file: { name: session.original_name, size: session.fileSize || session.content.length },
            status: 'done',
            progress: 100,
            previewUrl: null,
          },
        ];
      });
    }

    showToast(`Loaded "${session.original_name}" from recent sessions`);
  }, [results, showToast]);

  const handleDeleteRecentSession = useCallback((sessionId) => {
    const updated = deleteRecentSession(sessionId);
    setRecentSessions(updated);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
    showToast('Removed from recent sessions');
  }, [activeSessionId, showToast]);

  const handleClearAllRecentSessions = useCallback(() => {
    clearAllRecentSessions();
    setRecentSessions([]);
    setActiveSessionId(null);
    showToast('Recent session history cleared');
  }, [showToast]);

  const handleLoadSampleSession = useCallback(() => {
    const sample = generateSampleSession();
    const updated = saveRecentSession(sample);
    setRecentSessions(updated);
    handleSelectRecentSession(sample);
  }, [handleSelectRecentSession]);

  // ── Keyboard Shortcuts (Cmd+O, Cmd+Enter, Cmd+Shift+C, Cmd+B)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;

      const key = e.key.toLowerCase();

      // Cmd+O / Ctrl+O: Open file picker
      if (key === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
        showToast('File picker opened (⌘O)');
        return;
      }

      // Cmd+Enter / Ctrl+Enter: Trigger conversion
      if (e.key === 'Enter') {
        e.preventDefault();
        const hasConvertible = files.some(
          (f) => f.status === 'pending' || f.status === 'error'
        );
        if (hasConvertible) {
          showToast('Starting conversion (⌘↵)');
          convertAll();
        } else if (files.length === 0) {
          fileInputRef.current?.click();
          showToast('Queue is empty. Select files first (⌘O)');
        } else {
          showToast('All files already converted (100%)');
        }
        return;
      }

      // Cmd+Shift+C: Copy current markdown
      if (key === 'c' && e.shiftKey) {
        e.preventDefault();
        if (activeResult?.content) {
          navigator.clipboard.writeText(activeResult.content);
          setCopied(true);
          showToast('Markdown copied to clipboard! (⌘⇧C)');
          setTimeout(() => setCopied(false), 1800);
        } else {
          showToast('No converted Markdown to copy yet');
        }
        return;
      }

      // Cmd+B: Toggle recent sessions sidebar
      if (key === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => {
          const next = !prev;
          showToast(next ? 'Recent sidebar opened (⌘B)' : 'Recent sidebar closed');
          return next;
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, activeResult, convertAll, showToast]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)] transition-colors relative">
      {/* ── Hidden File Input ── */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* ── Global Header (1k Desktop / 1l Mobile) ── */}
      <MarkDifyHeader
        activeTab="converter"
        serverStatus={serverStatus}
        wakeCountdown={wakeCountdown}
        onRetry={checkHealth}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenBlog={() => setBlogOpen(true)}
        activeResult={activeResult}
        onToggleRecentSidebar={() => setSidebarOpen((prev) => !prev)}
        recentSessionsCount={recentSessions.length}
        isRecentSidebarOpen={sidebarOpen}
      />

      {/* ── Offline Banner (1o) ── */}
      {serverStatus === 'offline' && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-300 dark:border-rose-900/60 px-4 py-2 flex items-center justify-between text-[12.5px] font-sans">
          <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200">
            <span>✕</span>
            <span>
              Can’t reach the converter. Your {files.length} file{files.length !== 1 ? 's are' : ' is'} safe in the queue.
            </span>
          </div>
          <button
            onClick={checkHealth}
            className="border-[1.5px] border-rose-400 dark:border-rose-700 rounded-full px-3 py-0.5 text-rose-800 dark:text-rose-200 font-tech text-[11px] hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer bg-transparent"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-5 flex flex-col">
        {/* =========================================================================
            DESKTOP VIEW (hidden on mobile)
           ========================================================================= */}
        <div className="hidden md:flex flex-col flex-1">
          {/* Layout Toggle Pill (Allows switching between 1a and 1c if desired) */}
          <div className="flex items-center justify-between mb-3 text-[11.5px] font-tech text-[var(--faint)]">
            <div className="flex items-center gap-2">
              <span>LAYOUT:</span>
              <button
                onClick={() => setViewLayout('1a')}
                className={`px-2.5 py-0.5 rounded-full border cursor-pointer ${
                  !isThreeColumn
                    ? 'border-[var(--text)] bg-[var(--surface)] text-[var(--text)] font-semibold'
                    : 'border-[var(--border-3)] bg-[var(--surface-2)] text-[var(--muted)]'
                }`}
              >
                1a Landing 50/50
              </button>
              <button
                onClick={() => setViewLayout('1c')}
                className={`px-2.5 py-0.5 rounded-full border cursor-pointer ${
                  isThreeColumn
                    ? 'border-[var(--text)] bg-[var(--surface)] text-[var(--text)] font-semibold'
                    : 'border-[var(--border-3)] bg-[var(--surface-2)] text-[var(--muted)]'
                }`}
              >
                1c Three Columns (Densest)
              </button>

              <span className="text-[var(--border-3)]">·</span>

              {/* Recent Sessions Sidebar Trigger */}
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                className={`px-2.5 py-0.5 rounded-full border cursor-pointer flex items-center gap-1.5 transition-all ${
                  sidebarOpen
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold shadow-xs'
                    : 'border-[var(--border-3)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--text)]'
                }`}
                title="Toggle Recent Conversion Sessions Sidebar (⌘B)"
              >
                <span className="text-amber-500">⏱</span>
                <span>Recent Items</span>
                <span className="bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.2 rounded-full font-tech">
                  {recentSessions.length}/5
                </span>
              </button>
            </div>

            {hasFiles && (
              <div className="flex items-center gap-2">
                <span>{files.length}/{MAX_FILES} in queue</span>
                <span>·</span>
                <span>{results.length} converted</span>
              </div>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────
              DESKTOP MODE 1a: Hero band above 50/50 workspace (landing-first)
             ───────────────────────────────────────────────────────────── */}
          {!isThreeColumn && (
            <div className="flex flex-col border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-lg bg-[var(--surface)] shadow-sm overflow-hidden flex-1">
              {/* Hero Band with Aurora blob */}
              <div className="relative p-6 sm:p-7 border-b-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] overflow-hidden bg-[var(--surface)]">
                {/* Aurora Blob right */}
                <div
                  className="absolute right-[-30px] bottom-[-40px] w-[210px] h-[160px] rounded-[60%_40%_55%_45%] pointer-events-none"
                  style={{
                    background: 'linear-gradient(135deg, #d3ccf0, #eec9d6)',
                    opacity: theme === 'dark' ? 0.35 : 0.75,
                    filter: 'blur(24px)',
                  }}
                />

                <div className="font-tech text-[10px] tracking-[0.14em] text-[var(--faint)] uppercase">
                  FREE · NO SIGN-UP · OPEN SOURCE
                </div>

                <h1 className="font-wireframe text-[34px] sm:text-[38px] leading-tight font-bold tracking-tight text-[var(--text)] mt-2 max-w-xl m-0">
                  Turn any document into clean Markdown.
                </h1>

                <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-lg mt-2 mb-0 font-sans">
                  PDF, Word, PowerPoint, Excel, HTML, and images → structured Markdown built for AI, RAG, and docs. Powered by Microsoft MarkItDown.
                </p>
              </div>

              {/* 50/50 Workspace Grid */}
              <div className="grid grid-cols-2 min-h-[380px] flex-1">
                {/* Left Pane: UPLOAD */}
                <div className="border-r-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-4 flex flex-col gap-3">
                  <div className="font-tech text-[10.5px] text-[var(--faint)] flex items-center justify-between">
                    <span>UPLOAD · pane scrolls internally</span>
                    <span className="text-[var(--muted)]">Profile: {profile}</span>
                  </div>

                  {/* Dropzone Box */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 min-h-[220px] border-[1.5px] border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all bg-wireframe-hatch ${
                      dragActive
                        ? 'border-[#2a78d6] scale-[0.99] ring-2 ring-[#2a78d6]/30'
                        : 'border-[#9a9a9a] dark:border-[var(--border-3)] hover:border-[var(--text)]'
                    }`}
                  >
                    {/* Aurora circle icon */}
                    <div className="w-[44px] h-[44px] rounded-full border-[1.5px] border-[#bdb4de] bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center shadow-sm mb-2">
                      <span className="text-[#2d2740] text-[18px]">↓</span>
                    </div>

                    <div className="font-wireframe text-[18px] font-bold text-[var(--text)]">
                      Drop files here
                    </div>
                    <div className="text-[12.5px] text-[var(--muted)] font-sans mt-0.5">
                      or click to choose — up to 20 files
                    </div>

                    {/* Format Chips */}
                    <div className="flex flex-wrap gap-1.5 justify-center max-w-xs mt-3 font-tech text-[9.5px] text-[var(--faint)]">
                      {FORMAT_TAGS.map((tag) => (
                        <span
                          key={tag}
                          className="border border-[var(--border-3)] rounded px-1.5 py-0.5 bg-[var(--surface-2)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex gap-2">
                    <button
                      onClick={convertAll}
                      disabled={converting || !files.some((f) => f.status === 'pending' || f.status === 'error')}
                      className="flex-1 py-2 rounded-full aurora-btn font-sans text-[13.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {converting ? 'Converting…' : `Convert all (${files.length})`}
                    </button>
                    <button
                      onClick={clearAll}
                      disabled={!files.length}
                      className="px-4 py-2 rounded-full border border-[var(--border-3)] text-[var(--muted)] hover:text-[var(--text)] font-sans text-[13.5px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-transparent"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Right Pane: READER / PREVIEW */}
                <div className="p-4 flex flex-col gap-3 bg-[var(--surface-2)]">
                  {/* Top Bar: Split / Rendered / Raw Toggle + Copy / Download Actions */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-full overflow-hidden text-[11px] font-sans">
                      <button
                        onClick={() => setPreviewMode('split')}
                        className={`px-3 py-1 cursor-pointer transition-colors ${
                          previewMode === 'split'
                            ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                            : 'text-[var(--muted)] bg-transparent'
                        }`}
                        title="Side-by-side Raw and Rendered view"
                      >
                        Split
                      </button>
                      <button
                        onClick={() => setPreviewMode('preview')}
                        className={`px-3 py-1 cursor-pointer transition-colors ${
                          previewMode === 'preview'
                            ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                            : 'text-[var(--muted)] bg-transparent'
                        }`}
                        title="Rendered Markdown view"
                      >
                        Rendered
                      </button>
                      <button
                        onClick={() => setPreviewMode('raw')}
                        className={`px-3 py-1 cursor-pointer transition-colors ${
                          previewMode === 'raw'
                            ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                            : 'text-[var(--muted)] bg-transparent'
                        }`}
                        title="Raw Markdown code view"
                      >
                        Raw
                      </button>
                    </div>

                    <div className="flex gap-1.5 font-tech text-[10.5px] text-[var(--muted)]">
                      <button
                        onClick={copyContent}
                        disabled={!activeResult}
                        className="border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-0.5 hover:border-[var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--surface)] text-inherit"
                        title="Copy to clipboard"
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => downloadSingle(activeResult)}
                        disabled={!activeResult}
                        className="border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-0.5 hover:border-[var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--surface)] text-inherit"
                        title="Download .md file"
                      >
                        .md
                      </button>
                      <button
                        onClick={downloadAllZip}
                        disabled={!results.length}
                        className="border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-0.5 hover:border-[var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--surface)] text-inherit"
                        title="Download all as zip"
                      >
                        .zip
                      </button>
                    </div>
                  </div>

                  {/* Real-time Markdown Viewer Component with Output Status Bar */}
                  <div className="flex-1 min-h-[350px] flex flex-col">
                    <MarkdownViewer
                      content={activeResult?.content || ''}
                      tokensEst={activeResult?.tokens_est}
                      onChangeContent={handleUpdateContent}
                      viewMode={previewMode === 'preview' ? 'rendered' : previewMode}
                      onViewModeChange={(m) => setPreviewMode(m === 'rendered' ? 'preview' : m)}
                      maxHeightClass="min-h-[350px] max-h-[420px]"
                      showStatusBar={true}
                      statusBarId="output-status-bar-1a"
                      isLoading={isWaitingForApi}
                      loadingFileName={convertingFileName}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Link Bar (1a) */}
              <div className="px-4 py-2.5 border-t-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] flex items-center gap-3 text-[13px] text-[var(--muted)] font-sans bg-[var(--surface-2)]">
                <span>Want the details on why Markdown beats raw text for LLMs?</span>
                <Link
                  href="/usecase"
                  className="border border-[var(--border-3)] rounded-full px-3 py-0.5 text-[var(--text)] hover:bg-[var(--surface)] transition-colors no-underline text-[12px]"
                >
                  Why Use It
                </Link>
                <button
                  onClick={() => setBlogOpen(true)}
                  className="text-[#2a78d6] hover:underline bg-transparent border-0 p-0 cursor-pointer text-[12.5px]"
                >
                  Blog
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              DESKTOP MODE 1c: Three columns — queue rail / dropzone / reader (densest)
             ───────────────────────────────────────────────────────────── */}
          {isThreeColumn && (
            <div className="flex flex-col border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-lg bg-[var(--surface)] shadow-sm overflow-hidden flex-1">
              {/* Three Columns Grid */}
              <div className="grid grid-cols-[230px_1fr_1fr] min-h-[460px] flex-1">
                {/* Col 1: QUEUE RAIL */}
                <div className="border-r-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-3 flex flex-col gap-2.5 bg-[var(--surface-2)]">
                  <div className="font-tech text-[10.5px] text-[var(--faint)] uppercase tracking-wider flex justify-between items-center">
                    <span>QUEUE {files.length}/{MAX_FILES}</span>
                    {files.length > 0 && (
                      <button
                        onClick={clearAll}
                        className="text-[9.5px] text-[var(--muted)] hover:text-rose-500 bg-transparent border-0 cursor-pointer"
                      >
                        clear
                      </button>
                    )}
                  </div>

                  {/* File List */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[350px]">
                    {files.length === 0 ? (
                      <div className="py-8 text-center text-[12px] font-sans text-[var(--faint)]">
                        No files in queue yet.
                      </div>
                    ) : (
                      files.map((fileObj, idx) => {
                        const isDone = fileObj.status === 'done';
                        const isConverting = fileObj.status === 'converting';
                        const isError = fileObj.status === 'error';
                        const isSelected = activeResultIdx === results.findIndex((r) => r.id === fileObj.id);

                        return (
                          <div
                            key={fileObj.id}
                            onClick={() => {
                              const rIdx = results.findIndex((r) => r.id === fileObj.id);
                              if (rIdx >= 0) setActiveResultIdx(rIdx);
                            }}
                            className={`p-2 rounded-lg border text-[12px] font-sans flex items-center justify-between cursor-pointer transition-all ${
                              isSelected
                                ? 'border-[#2a78d6] bg-[#2a78d6]/10 shadow-sm'
                                : 'border-[var(--border-3)] bg-[var(--surface)] hover:border-[var(--text)]'
                            }`}
                          >
                            <div className="truncate pr-2 font-medium">
                              {fileObj.file.name}
                            </div>
                            <div className="flex items-center gap-1.5 flex-none font-tech text-[10px]">
                              {isDone && <span className="text-[#2a78d6] dark:text-[#60a5fa]">✓ done</span>}
                              {isConverting && (
                                <span className="text-amber-500 animate-pulse">
                                  {fileObj.progress || 50}%
                                </span>
                              )}
                              {isError && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    convertOne(fileObj);
                                  }}
                                  className="text-rose-500 hover:underline bg-transparent border-0 p-0 cursor-pointer"
                                >
                                  retry
                                </button>
                              )}
                              {fileObj.status === 'pending' && (
                                <span className="text-[var(--faint)]">queued</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(fileObj.id);
                                }}
                                className="text-[var(--faint)] hover:text-rose-500 ml-1 bg-transparent border-0 cursor-pointer text-[12px]"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* + Add more button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-1.5 border-[1.5px] border-dashed border-[var(--border-3)] hover:border-[var(--text)] rounded-lg text-center text-[12px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer bg-transparent transition-colors font-sans"
                    >
                      + Add more
                    </button>
                  </div>

                  {/* Convert All Button at bottom of rail */}
                  <div className="pt-2 border-t border-[var(--border)]">
                    <button
                      onClick={convertAll}
                      disabled={converting || !files.some((f) => f.status === 'pending' || f.status === 'error')}
                      className="w-full py-2 rounded-full aurora-btn font-sans text-[13px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {converting ? 'Converting…' : `Convert all (${files.length})`}
                    </button>
                  </div>
                </div>

                {/* Col 2: DROPZONE & PROFILE */}
                <div className="border-r-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-4 flex flex-col gap-3">
                  <h2 className="font-wireframe text-[22px] leading-tight font-bold tracking-tight text-[var(--text)] m-0">
                    Turn any document into clean Markdown.
                  </h2>

                  {/* Dropzone Box */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 min-h-[220px] border-[1.5px] border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all bg-wireframe-hatch ${
                      dragActive
                        ? 'border-[#2a78d6] scale-[0.99] ring-2 ring-[#2a78d6]/30'
                        : 'border-[#9a9a9a] dark:border-[var(--border-3)] hover:border-[var(--text)]'
                    }`}
                  >
                    <div className="w-[38px] h-[38px] rounded-full border-[1.5px] border-[#bdb4de] bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center shadow-sm mb-2">
                      <span className="text-[#2d2740] text-[16px]">↓</span>
                    </div>
                    <div className="font-wireframe text-[16px] font-bold text-[var(--text)]">
                      Drop files here
                    </div>
                    <div className="text-[11.5px] text-[var(--muted)] font-sans mt-0.5">
                      PDF, DOCX, PPTX, XLSX, HTML, CSV, images
                    </div>
                  </div>

                  {/* Profile Selector (Standard, Clean, Compact, RAG-ready) */}
                  <div className="border border-[var(--border-3)] rounded-lg p-2.5 text-[12px] text-[var(--muted)] bg-[var(--surface-2)] flex flex-col gap-1.5 font-sans">
                    <div className="flex items-center justify-between">
                      <span className="font-tech text-[10px] uppercase text-[var(--faint)]">
                        Profile:
                      </span>
                      <div className="flex gap-1">
                        {PROFILES.map((p) => (
                          <button
                            key={p}
                            onClick={() => setProfile(p)}
                            className={`border-[1.5px] rounded-full px-2 py-0.5 text-[10.5px] font-tech cursor-pointer transition-colors ${
                              profile === p
                                ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)] font-semibold'
                                : 'border-[var(--border-3)] text-[var(--muted)] hover:border-[var(--text)] bg-[var(--surface)]'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-[11px] text-[var(--faint)]">
                      {profile === 'Standard' && 'Clean · Compact · RAG-ready'}
                      {profile === 'Clean' && 'Stripped of metadata & extra line breaks'}
                      {profile === 'Compact' && 'Token-compressed, single line breaks'}
                      {profile === 'RAG-ready' && 'Heading-aligned chunks for vector embeddings'}
                    </div>
                  </div>
                </div>

                {/* Col 3: READER */}
                <div className="p-4 flex flex-col gap-3 bg-[var(--surface-2)]">
                  {/* Reader Header: Split / Rendered / Raw + Actions */}
                  <div className="flex items-center justify-between font-tech text-[10.5px] gap-2 flex-wrap">
                    <div className="flex border border-[var(--border-3)] rounded-full overflow-hidden">
                      <button
                        onClick={() => setPreviewMode('split')}
                        className={`px-2.5 py-0.5 cursor-pointer transition-colors ${
                          previewMode === 'split'
                            ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                            : 'text-[var(--muted)] bg-transparent'
                        }`}
                        title="Side-by-side Raw and Rendered view"
                      >
                        Split
                      </button>
                      <button
                        onClick={() => setPreviewMode('preview')}
                        className={`px-2.5 py-0.5 cursor-pointer transition-colors ${
                          previewMode === 'preview'
                            ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                            : 'text-[var(--muted)] bg-transparent'
                        }`}
                        title="Rendered Markdown view"
                      >
                        Rendered
                      </button>
                      <button
                        onClick={() => setPreviewMode('raw')}
                        className={`px-2.5 py-0.5 cursor-pointer transition-colors ${
                          previewMode === 'raw'
                            ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                            : 'text-[var(--muted)] bg-transparent'
                        }`}
                        title="Raw Markdown code view"
                      >
                        Raw
                      </button>
                    </div>

                    <div className="flex gap-1.5 text-[var(--muted)] items-center">
                      <button
                        onClick={copyContent}
                        disabled={!activeResult}
                        className="hover:text-[var(--text)] cursor-pointer disabled:opacity-30 bg-transparent border-0 p-0"
                        title="Copy to clipboard"
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => downloadSingle(activeResult)}
                        disabled={!activeResult}
                        className="hover:text-[var(--text)] cursor-pointer disabled:opacity-30 bg-transparent border-0 p-0"
                        title="Download .md file"
                      >
                        .md
                      </button>
                      <span>·</span>
                      <button
                        onClick={downloadAllZip}
                        disabled={!results.length}
                        className="hover:text-[var(--text)] cursor-pointer disabled:opacity-30 bg-transparent border-0 p-0"
                        title="Download all as zip"
                      >
                        .zip
                      </button>
                    </div>
                  </div>

                  {/* Real-time Markdown Viewer Component with Output Status Bar */}
                  <div className="flex-1 min-h-[350px] flex flex-col">
                    <MarkdownViewer
                      content={activeResult?.content || ''}
                      tokensEst={activeResult?.tokens_est}
                      onChangeContent={handleUpdateContent}
                      viewMode={previewMode === 'preview' ? 'rendered' : previewMode}
                      onViewModeChange={(m) => setPreviewMode(m === 'rendered' ? 'preview' : m)}
                      maxHeightClass="min-h-[350px] max-h-[420px]"
                      showStatusBar={true}
                      statusBarId="output-status-bar-1c"
                      isLoading={isWaitingForApi}
                      loadingFileName={convertingFileName}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            MOBILE VIEW (hidden on desktop, stacked tool-first: 1e + sheet: 1f)
           ========================================================================= */}
        <div className="md:hidden flex flex-col space-y-4 font-sans pb-32">
          {/* ─────────────────────────────────────────────────────────────
              MOBILE STACK 1e: Tool-first — dropzone above the fold, hero to one line
             ───────────────────────────────────────────────────────────── */}
          <div className="pt-2 px-1">
            <h1 className="font-wireframe text-[22px] leading-tight font-bold tracking-tight text-[var(--text)] m-0">
              Any document → clean Markdown.
            </h1>
            <div className="font-tech text-[9.5px] tracking-[0.12em] text-[var(--faint)] mt-1">
              FREE · NO SIGN-UP · MARKITDOWN
            </div>
          </div>

          {/* Dropzone Box (Above the Fold) */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-[1.5px] border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-wireframe-hatch ${
              dragActive
                ? 'border-[#2a78d6] scale-[0.99] ring-2 ring-[#2a78d6]/30'
                : 'border-[#9a9a9a] dark:border-[var(--border-3)]'
            }`}
          >
            {/* Aurora circle icon */}
            <div className="w-[46px] h-[46px] rounded-full border-[1.5px] border-[#bdb4de] bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center shadow-sm mb-2">
              <span className="text-[#2d2740] text-[18px]">↓</span>
            </div>

            <div className="font-wireframe text-[18px] font-bold text-[var(--text)]">
              Drop or choose files
            </div>
            <div className="text-[12px] text-[var(--muted)]">up to 20 at once</div>

            {/* Choose files button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-3 px-6 py-2 rounded-full aurora-btn text-[14px] font-medium cursor-pointer shadow-sm"
            >
              Choose files
            </button>

            {/* Format tags */}
            <div className="flex flex-wrap gap-1 justify-center mt-3 font-tech text-[9px] text-[var(--faint)]">
              {['PDF', 'DOCX', 'PPTX', 'XLSX', 'PNG'].map((t) => (
                <span key={t} className="border border-[var(--border-3)] rounded px-1.5 py-0.5 bg-[var(--surface-2)]">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="text-center font-tech text-[9px] text-[var(--faint)] -mt-1">
            ↑ fold line — tool fully visible on first paint
          </div>

          {/* Subtext description */}
          <p className="text-[12.5px] text-[var(--muted)] leading-relaxed px-1 m-0">
            Structured Markdown built for AI, RAG and docs. Powered by Microsoft MarkItDown.
          </p>

          {/* Queue preview (if files uploaded) */}
          {hasFiles && (
            <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-2)] space-y-2">
              <div className="flex items-center justify-between font-tech text-[11px]">
                <b className="font-wireframe text-[15px] text-[var(--text)]">
                  {results.length} files converted
                </b>
                <button
                  onClick={convertAll}
                  disabled={converting}
                  className="px-3 py-1 rounded-full aurora-btn text-[11.5px] font-medium"
                >
                  {converting ? 'Converting…' : 'Convert all'}
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {files.map((f) => {
                  const r = results.find((res) => res.id === f.id);
                  return (
                    <div
                      key={f.id}
                      className="border border-[var(--border-3)] rounded-lg p-2 bg-[var(--surface)] text-[12px] flex items-center justify-between"
                    >
                      <span className="truncate pr-2 font-medium">{f.file.name}</span>
                      <span className="font-tech text-[10px] text-[#2a78d6] flex-none">
                        {r ? `✓ ${r.tokens_est || '1,240'} est.` : f.status}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-1.5 border border-dashed border-[var(--border-3)] rounded-lg text-center font-tech text-[11px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer bg-transparent"
              >
                + Add more ({files.length}/{MAX_FILES})
              </button>
            </div>
          )}

          {/* Teaser link */}
          <div className="border border-[var(--border-3)] rounded-lg p-3 text-[12.5px] text-[var(--muted)] bg-[var(--surface-2)] flex items-center justify-between">
            <span>Why Markdown beats raw text for LLMs</span>
            <Link href="/usecase" className="text-[#2a78d6] font-medium no-underline">
              Why Use It →
            </Link>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              MOBILE SHEET 1f: Reader rises as a bottom sheet over the queue
             ───────────────────────────────────────────────────────────── */}
          {results.length > 0 && (
            <div className="mt-4 border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-t-2xl p-3 bg-[var(--surface)] shadow-2xl space-y-3">
              {/* Drag handle */}
              <div
                onClick={() => setSheetExpanded(!sheetExpanded)}
                className="w-10 h-1 rounded-full bg-[#c9c9c9] mx-auto cursor-pointer"
              />

              {/* Sheet header */}
              <div className="flex items-center justify-between">
                <div className="flex border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-full overflow-hidden text-[11px]">
                  <button
                    onClick={() => setPreviewMode('split')}
                    className={`px-2 py-0.5 cursor-pointer ${
                      previewMode === 'split'
                        ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                        : 'text-[var(--muted)] bg-transparent'
                    }`}
                  >
                    Split
                  </button>
                  <button
                    onClick={() => setPreviewMode('preview')}
                    className={`px-2 py-0.5 cursor-pointer ${
                      previewMode === 'preview'
                        ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                        : 'text-[var(--muted)] bg-transparent'
                    }`}
                  >
                    Rendered
                  </button>
                  <button
                    onClick={() => setPreviewMode('raw')}
                    className={`px-2 py-0.5 cursor-pointer ${
                      previewMode === 'raw'
                        ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
                        : 'text-[var(--muted)] bg-transparent'
                    }`}
                  >
                    Raw
                  </button>
                </div>

                <div className="flex items-center gap-2 font-tech text-[10.5px] text-[var(--muted)]">
                  <button
                    onClick={copyContent}
                    className="hover:text-[var(--text)] bg-transparent border-0 cursor-pointer p-0"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <span>·</span>
                  <button
                    onClick={() => downloadSingle(activeResult)}
                    className="hover:text-[var(--text)] bg-transparent border-0 cursor-pointer p-0"
                  >
                    .md
                  </button>
                  <span>·</span>
                  <button
                    onClick={downloadAllZip}
                    className="hover:text-[var(--text)] bg-transparent border-0 cursor-pointer p-0"
                  >
                    .zip
                  </button>
                  <span>·</span>
                  <button
                    onClick={() => setSheetExpanded(!sheetExpanded)}
                    className="text-[#2a78d6] bg-transparent border-0 cursor-pointer p-0"
                  >
                    {sheetExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>

              {/* Converted file tab pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 font-tech text-[10px]">
                {results.map((r, i) => (
                  <button
                    key={r.id || i}
                    onClick={() => setActiveResultIdx(i)}
                    className={`px-2 py-0.5 rounded-full border whitespace-nowrap cursor-pointer ${
                      activeResultIdx === i
                        ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)] font-medium'
                        : 'border-[var(--border-3)] text-[var(--muted)] bg-[var(--surface-2)]'
                    }`}
                  >
                    {r.filename}
                  </button>
                ))}
              </div>

              {/* Real-time Markdown Viewer in Mobile Sheet with Output Status Bar */}
              <div className="w-full">
                <MarkdownViewer
                  content={activeResult?.content || ''}
                  tokensEst={activeResult?.tokens_est}
                  onChangeContent={handleUpdateContent}
                  viewMode={previewMode === 'preview' ? 'rendered' : previewMode}
                  onViewModeChange={(m) => setPreviewMode(m === 'rendered' ? 'preview' : m)}
                  maxHeightClass={sheetExpanded ? 'max-h-[65vh] h-[460px]' : 'h-[220px]'}
                  showStatusBar={true}
                  compactStatusBar={true}
                  statusBarId="output-status-bar-mobile"
                  isLoading={isWaitingForApi}
                  loadingFileName={convertingFileName}
                />
              </div>

              <div className="text-center font-tech text-[8.5px] text-[var(--faint)]">
                drag sheet up for full-screen reading · dock hides behind sheet
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Global Footer (1m) with Export Area ── */}
      <MarkDifyFooter
        onOpenBlog={() => setBlogOpen(true)}
        onOpenApi={() => setApiOpen(true)}
        onOpenLegal={(type) => setLegalModal(type)}
        activeResult={activeResult}
        totalConverted={results.length}
        onDownloadMd={() => downloadSingle(activeResult)}
        onCopyMd={copyContent}
        copied={copied}
        onDownloadZip={downloadAllZip}
        onToggleRecentSidebar={() => setSidebarOpen((prev) => !prev)}
        recentSessionsCount={recentSessions.length}
      />

      {/* ── Mobile Bottom Dock (1g) ── */}
      <MobileDock
        activeTab="convert"
        onSelectTab={() => {
          // Stay on converter / reset scroll
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onToggleTheme={toggleTheme}
        onOpenBlog={() => setBlogOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
      />

      {/* ── Mobile Quick Menu Modal ── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-4 space-y-3 font-wireframe text-[var(--text)] shadow-2xl mb-20 sm:mb-0">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <b className="text-[16px]">MDify Navigation</b>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border-3)] text-[12px] bg-transparent cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 font-sans text-[13.5px]">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="block p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit no-underline"
              >
                ▣ Converter
              </Link>
              <Link
                href="/usecase"
                onClick={() => setMenuOpen(false)}
                className="block p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit no-underline"
              >
                ? Why Use It (Case Studies & Benchmarks)
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setSidebarOpen(true);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit bg-transparent border-0 cursor-pointer flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <span className="text-amber-500">⏱</span>
                  <span>Recent Conversions</span>
                </span>
                {recentSessions.length > 0 && (
                  <span className="font-tech text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                    {recentSessions.length}/5
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setBlogOpen(true);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit bg-transparent border-0 cursor-pointer"
              >
                ▤ Blog & Articles
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setApiOpen(true);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit bg-transparent border-0 cursor-pointer"
              >
                ⚡ API Documentation
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setLegalModal('privacy');
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit bg-transparent border-0 cursor-pointer"
              >
                🔒 Privacy Policy
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setLegalModal('terms');
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit bg-transparent border-0 cursor-pointer"
              >
                📄 Terms of Service
              </button>
            </div>

            <div className="pt-2 border-t border-[var(--border)] flex justify-between items-center font-tech text-[11px] text-[var(--muted)]">
              <span>Theme: {theme}</span>
              <button
                onClick={() => {
                  toggleTheme();
                }}
                className="border border-[var(--border-3)] rounded-full px-2.5 py-0.5 bg-[var(--surface-2)] cursor-pointer"
              >
                Toggle ◐
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Conversions Sidebar (Last 5 Sessions) ── */}
      <RecentSessionsSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={recentSessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectRecentSession}
        onDeleteSession={handleDeleteRecentSession}
        onClearAllSessions={handleClearAllRecentSessions}
        onLoadSample={handleLoadSampleSession}
      />

      {/* ── Sub-Modals (Blog, API, Legal) ── */}
      <BlogModal isOpen={blogOpen} onClose={() => setBlogOpen(false)} />
      <ApiModal isOpen={apiOpen} onClose={() => setApiOpen(false)} />
      <LegalModal
        isOpen={Boolean(legalModal)}
        onClose={() => setLegalModal(null)}
        initialTab={legalModal || 'privacy'}
      />

      {/* ── Floating Action / Shortcut Toast ── */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[var(--text)] text-[var(--bg)] shadow-2xl font-tech text-[12px] border border-[var(--border-3)] animate-fadeIn select-none">
          <span className="text-amber-400">⚡</span>
          <span className="font-semibold tracking-wide">{toast}</span>
        </div>
      )}
    </div>
  );
}
