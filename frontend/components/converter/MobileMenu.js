'use client';

import React from 'react';
import Link from 'next/link';
import { useModalDialog } from '../useModalDialog';

const itemClass =
  'w-full text-left p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit bg-transparent border-0 cursor-pointer';

/** Mobile quick-navigation sheet opened from the dock's "Menu" tab. */
export default function MobileMenu({
  theme,
  recentCount,
  onClose,
  onToggleTheme,
  onOpenSidebar,
  onOpenBlog,
  onOpenApi,
  onOpenLegal,
}) {
  const dialogRef = useModalDialog(true, onClose);

  const closeThen = (action) => () => {
    onClose();
    action();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
        tabIndex={-1}
        className="w-full max-w-sm max-h-[calc(100dvh-104px)] sm:max-h-[calc(100dvh-24px)] overflow-y-auto outline-none rounded-2xl bg-[var(--surface)] border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-4 space-y-3 font-wireframe text-[var(--text)] shadow-2xl mb-20 sm:mb-0">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <b id="mobile-menu-title" className="text-[16px]">MDify Navigation</b>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border-3)] text-[12px] bg-transparent cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1 font-sans text-[13.5px]">
          <Link
            href="/"
            onClick={onClose}
            className="block p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit no-underline"
          >
            ▣ Converter
          </Link>
          <Link
            href="/usecase"
            onClick={onClose}
            className="block p-2 rounded-lg hover:bg-[var(--surface-2)] text-inherit no-underline"
          >
            ? Why Use It (Case Studies & Benchmarks)
          </Link>
          <button type="button" onClick={closeThen(onOpenSidebar)} className={`${itemClass} flex items-center justify-between`}>
            <span className="flex items-center gap-2">
              <span className="text-amber-500">⏱</span>
              <span>Recent Conversions</span>
            </span>
            {recentCount > 0 && (
              <span className="font-tech text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                {recentCount}/5
              </span>
            )}
          </button>
          <button type="button" onClick={closeThen(onOpenBlog)} className={itemClass}>
            ▤ Blog & Articles
          </button>
          <button type="button" onClick={closeThen(onOpenApi)} className={itemClass}>
            ⚡ API Documentation
          </button>
          <button type="button" onClick={closeThen(() => onOpenLegal('privacy'))} className={itemClass}>
            🔒 Privacy Policy
          </button>
          <button type="button" onClick={closeThen(() => onOpenLegal('terms'))} className={itemClass}>
            📄 Terms of Service
          </button>
        </div>

        <div className="pt-2 border-t border-[var(--border)] flex justify-between items-center font-tech text-[11px] text-[var(--muted)]">
          <span>Theme: {theme}</span>
          <button
            type="button"
            onClick={onToggleTheme}
            className="border border-[var(--border-3)] rounded-full px-2.5 py-0.5 bg-[var(--surface-2)] cursor-pointer"
          >
            Toggle ◐
          </button>
        </div>
      </div>
    </div>
  );
}
