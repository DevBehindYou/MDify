import React from 'react';
import Link from 'next/link';
import AppIcon from './AppIcon';
import LegalDocument from './LegalDocument';

/** Standalone, server-rendered page for one legal document. */
export default function LegalPage({ doc, otherHref, otherLabel }) {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-inherit no-underline font-wireframe">
            <AppIcon size={32} className="rounded-[7px]" />
            <b className="text-[16px] tracking-tight">MDify</b>
          </Link>
          <nav className="flex items-center gap-3 font-tech text-[11.5px]">
            <Link href={otherHref} className="text-[var(--muted)] hover:text-[var(--text)] no-underline">
              {otherLabel}
            </Link>
            <Link href="/" className="text-[var(--muted)] hover:text-[var(--text)] no-underline">
              Converter
            </Link>
          </nav>
        </div>
        <div className="aurora-hairline w-full" />
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <h1 className="font-wireframe text-[28px] sm:text-[32px] font-bold tracking-tight m-0 mb-4">{doc.title}</h1>
        <LegalDocument doc={doc} headingLevel="h2" />
      </main>
    </div>
  );
}
