'use client';

import React, { useState } from 'react';
import AppIcon from '../AppIcon';
import { Button, ErrorLine } from './ui';

/** Two separate key fields; both keys are needed to open the admin. */
export default function AdminLogin({ onLogin, busy, error }) {
  const [key1, setKey1] = useState('');
  const [key2, setKey2] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const ok = await onLogin(key1, key2);
    if (ok) {
      setKey1('');
      setKey2('');
    }
  };

  const field =
    'w-full h-10 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-[14px] text-[var(--text)] font-tech focus:outline-none focus:border-[var(--muted)]';

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10 bg-[var(--bg)] text-[var(--text)]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <AppIcon size={34} className="rounded-[8px]" />
          <div>
            <h1 className="m-0 text-[17px] font-semibold tracking-tight">MDify controller</h1>
            <p className="m-0 text-[12px] text-[var(--faint)]">Enter both admin keys.</p>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
          Access key
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key1}
            onChange={(e) => setKey1(e.target.value)}
            className={field}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
          Control key
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key2}
            onChange={(e) => setKey2(e.target.value)}
            className={field}
            required
          />
        </label>
        <ErrorLine error={error} />
        <Button type="submit" tone="primary" busy={busy} disabled={!key1 || !key2} className="h-10">
          Open controller
        </Button>
      </form>
    </div>
  );
}
