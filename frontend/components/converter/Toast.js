'use client';

import React from 'react';

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[var(--text)] text-[var(--bg)] shadow-2xl font-tech text-[12px] border border-[var(--border-3)] animate-fadeIn select-none"
    >
      <span className="text-amber-400">⚡</span>
      <span className="font-semibold tracking-wide">{message}</span>
    </div>
  );
}
