'use client';

import React from 'react';
import { statusTone } from '../../lib/models/adminFormat';

export function Badge({ status, children, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-1.5 py-[1px] rounded border font-tech text-[10px] leading-4 whitespace-nowrap ${statusTone(status)}`}
    >
      {children ?? String(status || '—').replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

const BUTTON_TONES = {
  default:
    'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--muted)]',
  primary: 'aurora-btn',
  danger: 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20',
};

export function Button({ tone = 'default', className = '', busy = false, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 px-2.5 h-8 rounded-md border text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_TONES[tone]} ${className}`}
    >
      {busy ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)]">
          {title ? <h2 className="m-0 text-[13px] font-semibold tracking-tight">{title}</h2> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 min-w-0">
      <div className="font-tech text-[10px] uppercase tracking-wider text-[var(--faint)] truncate">{label}</div>
      <div className={`text-[20px] font-semibold tabular-nums leading-7 ${tone === 'bad' ? 'text-rose-500' : tone === 'warn' ? 'text-amber-500' : ''}`}>
        {value ?? '—'}
      </div>
      {hint ? <div className="text-[11px] text-[var(--faint)] truncate">{hint}</div> : null}
    </div>
  );
}

export function ErrorLine({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-600 dark:text-rose-400">
      <span>{error}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="underline cursor-pointer">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Empty({ children }) {
  return <p className="m-0 py-6 text-center text-[12.5px] text-[var(--faint)]">{children}</p>;
}

export function Select({ label, value, onChange, options }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-2 text-[12.5px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
