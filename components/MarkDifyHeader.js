'use client';

import React from 'react';
import Link from 'next/link';
import DocStatsWidget from './DocStatsWidget';

export default function MarkDifyHeader({
  activeTab = 'converter',
  onTabChange,
  serverStatus = 'online',
  wakeCountdown = null,
  onRetry,
  theme = 'dark',
  onToggleTheme,
  onOpenBlog,
  activeResult = null,
  onToggleRecentSidebar,
  recentSessionsCount = 0,
  isRecentSidebarOpen = false,
}) {
  return (
    <header className="w-full bg-[var(--surface)] select-none z-30 transition-colors">
      {/* ── Desktop Header (1k) ── */}
      <div className="hidden md:flex items-center justify-between px-5 py-2.5 font-wireframe">
        {/* Logo + Nav Left of Centre */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group text-inherit no-underline">
            <div className="w-[18px] h-[18px] border-[1.5px] border-[var(--text)] rounded-[5px] flex items-center justify-center p-0.5 bg-[var(--surface-2)]">
              <div className="w-full h-full rounded-[2px] bg-gradient-to-br from-[#8f83d8] to-[#d98fb0]" />
            </div>
            <b className="text-[16px] tracking-tight text-[var(--text)]">MDify</b>
          </Link>

          {/* Nav Links */}
          <nav className="flex items-center gap-4 ml-3 text-[14px] font-sans">
            <button
              onClick={() => onTabChange && onTabChange('converter')}
              className={`relative pb-1 transition-colors cursor-pointer bg-transparent border-0 font-medium ${
                activeTab === 'converter' ? 'text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Converter
              {activeTab === 'converter' && (
                <div className="absolute left-0 right-0 bottom-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#8f83d8] to-[#d98fb0]" />
              )}
            </button>

            <Link
              href="/usecase"
              className={`pb-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors no-underline font-medium ${
                activeTab === 'usecase' ? 'text-[var(--text)]' : ''
              }`}
            >
              Why Use It
            </Link>

            <button
              onClick={onOpenBlog}
              className="pb-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer bg-transparent border-0 font-medium"
            >
              Blog
            </button>
          </nav>
        </div>

        {/* Status + Live Doc Stats + Shortcuts + Theme Toggle Right */}
        <div className="flex items-center gap-2.5 font-tech text-[11px]">
          {/* Live Document Statistics Widget (in Header) */}
          {activeResult?.content && (
            <DocStatsWidget
              content={activeResult.content}
              tokensEst={activeResult.tokens_est}
              compact={true}
            />
          )}

          {/* Keyboard shortcut hint badge */}
          <span
            className="hidden lg:inline-flex items-center gap-1 border border-[var(--border-3)] rounded-full px-2 py-0.5 text-[var(--faint)] text-[9.5px] bg-[var(--surface-2)]"
            title="Shortcuts: Cmd/Ctrl+O to open file picker, Cmd/Ctrl+Enter to convert"
          >
            <span>⌘O open</span>
            <span>·</span>
            <span>⌘↵ run</span>
          </span>

          {serverStatus === 'online' && (
            <span className="border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-1 text-[#3a7a4a] dark:text-[#4ade80] flex items-center gap-1.5 bg-[var(--surface-2)]">
              <span className="w-2 h-2 rounded-full bg-[#3a7a4a] dark:bg-[#4ade80] inline-block animate-pulse" />
              <span>Server Ready</span>
            </span>
          )}

          {serverStatus === 'checking' && (
            <span className="border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-1 text-[#8a6a2a] dark:text-[#facc15] flex items-center gap-1.5 bg-[var(--surface-2)]">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-spin" />
              <span>Connecting…</span>
            </span>
          )}

          {serverStatus === 'waking' && (
            <span className="border-[1.5px] border-[#dcd0b0] dark:border-amber-700/60 rounded-full px-2.5 py-1 text-[#8a6a2a] dark:text-amber-300 flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40">
              <span className="animate-spin text-[12px]">◑</span>
              <span>Waking · {wakeCountdown ?? 24}s</span>
            </span>
          )}

          {serverStatus === 'offline' && (
            <button
              onClick={onRetry}
              className="border-[1.5px] border-[#c98a8a] dark:border-rose-800 rounded-full px-2.5 py-1 text-[#a34a4a] dark:text-rose-300 flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/40 hover:brightness-95 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              <span>Offline · Retry</span>
            </button>
          )}

          {/* Recent Sessions Sidebar Button */}
          <button
            onClick={onToggleRecentSidebar}
            className={`border-[1.5px] rounded-full px-2.5 py-1 flex items-center gap-1.5 transition-all cursor-pointer ${
              isRecentSidebarOpen
                ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold shadow-xs'
                : 'border-[var(--border-3)] hover:border-[var(--text)] text-[var(--text)] bg-[var(--surface-2)]'
            }`}
            title="Toggle Recent Conversion Sessions Sidebar"
          >
            <span className="text-amber-500 text-[11.5px]">⏱</span>
            <span className="font-tech text-[11px]">Recent</span>
            {recentSessionsCount > 0 && (
              <span className="bg-amber-500 text-black font-bold text-[9px] px-1.5 py-0.2 rounded-full font-tech">
                {recentSessionsCount}
              </span>
            )}
          </button>

          {/* Theme toggle ◐ */}
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-1 text-[var(--text)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors flex items-center justify-center font-bold"
          >
            ◐
          </button>
        </div>
      </div>

      {/* ── Mobile Header (1l) ── */}
      <div className="flex md:hidden items-center justify-between px-3.5 py-2.5 font-wireframe">
        <Link href="/" className="flex items-center gap-2 text-inherit no-underline">
          <div className="w-4 h-4 border-[1.5px] border-[var(--text)] rounded-[4px] p-0.5 bg-[var(--surface-2)] flex items-center justify-center">
            <div className="w-full h-full rounded-[2px] bg-gradient-to-br from-[#8f83d8] to-[#d98fb0]" />
          </div>
          <b className="text-[15px] tracking-tight text-[var(--text)]">MDify</b>
        </Link>

        {/* SR ● + Recent + theme */}
        <div className="flex items-center gap-2 font-tech text-[10.5px]">
          <button
            onClick={onToggleRecentSidebar}
            aria-label="Recent conversions"
            className={`px-2 py-1 rounded-full border flex items-center gap-1 cursor-pointer transition-colors ${
              isRecentSidebarOpen
                ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-semibold'
                : 'border-[var(--border-3)] bg-[var(--surface-2)] text-[var(--text)]'
            }`}
          >
            <span className="text-amber-500">⏱</span>
            <span>Recent</span>
            {recentSessionsCount > 0 && (
              <span className="bg-amber-500 text-black font-bold text-[8.5px] px-1 rounded-full">
                {recentSessionsCount}
              </span>
            )}
          </button>

          <span className="text-[var(--muted)] flex items-center gap-1">
            <span>SR</span>
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus === 'online'
                  ? 'bg-[#3a7a4a] dark:bg-[#4ade80]'
                  : serverStatus === 'offline'
                  ? 'bg-rose-500'
                  : 'bg-amber-400'
              }`}
            />
          </span>

          {/* 44px tap target theme toggle */}
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="min-w-[44px] min-h-[44px] -my-2 flex items-center justify-center cursor-pointer bg-transparent border-0"
          >
            <span className="border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-0.5 text-[var(--text)] font-bold text-[11px]">
              ◐
            </span>
          </button>
        </div>
      </div>

      {/* 2.5px Aurora Hairline */}
      <div className="aurora-hairline w-full" />
    </header>
  );
}
