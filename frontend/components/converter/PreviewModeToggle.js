'use client';

import React, { memo } from 'react';

const MODES = [
  { id: 'split', label: 'Split', title: 'Side-by-side Raw and Rendered view' },
  { id: 'rendered', label: 'Rendered', title: 'Rendered Markdown view' },
  { id: 'raw', label: 'Raw', title: 'Raw Markdown code view' },
];

const VARIANTS = {
  landing: {
    group:
      'flex flex-none border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-full text-[11px] font-sans',
    button: 'px-3 py-1 cursor-pointer transition-colors',
    titles: true,
  },
  column: {
    group: 'flex flex-none border border-[var(--border-3)] rounded-full',
    button: 'px-2.5 py-0.5 cursor-pointer transition-colors',
    titles: true,
  },
  mobile: {
    group:
      'flex flex-none border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-full text-[11px]',
    button: 'px-2 py-0.5 cursor-pointer',
    titles: false,
  },
};

/** Split / Rendered / Raw segmented control. */
function PreviewModeToggle({ mode, onChange, variant = 'landing' }) {
  const style = VARIANTS[variant];
  return (
    <div className={style.group} role="group" aria-label="Preview mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={mode === m.id}
          className={`tap-target first:rounded-l-full last:rounded-r-full ${style.button} ${
            mode === m.id
              ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
              : 'text-[var(--muted)] bg-transparent'
          }`}
          title={style.titles ? m.title : undefined}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export default memo(PreviewModeToggle);
