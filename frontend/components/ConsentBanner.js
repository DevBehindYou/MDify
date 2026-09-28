'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useConsentViewModel } from '../viewmodels/useConsentViewModel';
import { POLICY_VERSION } from '../lib/models/consentRepository';

const LegalModal = dynamic(() => import('./LegalModal'), { ssr: false });

const linkClass =
  'tap-target inline p-0 bg-transparent border-0 cursor-pointer text-[#2a78d6] dark:text-[#60a5fa] underline underline-offset-2 hover:no-underline font-medium';

/**
 * Terms of Service + Privacy Policy consent. Shown until the visitor accepts
 * the current policy version; conversions stay disabled until then (see
 * useConverterScreenViewModel). Non-modal: the page stays readable.
 *
 * Mobile: full width above the fixed dock. md+: bottom-left card.
 * z-[45] keeps it over the dock (z-40) and under dialogs (z-50).
 */
export default function ConsentBanner() {
  const { accepted, accept } = useConsentViewModel();
  const [legalTab, setLegalTab] = useState(null); // 'terms' | 'privacy' | null
  const pathname = usePathname();

  // The admin controller converts nothing, so visitor consent does not apply.
  if (accepted !== false || pathname?.startsWith('/mdify-controller')) return null;

  return (
    <>
      <section
        aria-labelledby="consent-title"
        aria-describedby="consent-desc"
        className="fixed z-[45] inset-x-3 bottom-[116px] md:inset-x-auto md:left-5 md:bottom-5 md:w-[400px] max-h-[calc(100dvh-140px)] md:max-h-[calc(100dvh-40px)] overflow-y-auto rounded-xl border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] bg-[var(--surface)] text-[var(--text)] shadow-2xl animate-fadeIn font-sans"
      >
        <div className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] font-tech text-[10px] tracking-[0.14em] uppercase text-[var(--faint)]">
          <span>Terms · Privacy</span>
          <span className="tracking-normal normal-case">Updated {POLICY_VERSION}</span>
        </div>

        <div className="p-3.5 space-y-3">
          <h2 id="consent-title" className="font-wireframe text-[17px] font-bold leading-snug m-0">
            Before you convert
          </h2>
          <p id="consent-desc" className="text-[12.5px] text-[var(--muted)] leading-relaxed m-0">
            MDify uploads the files you choose to its conversion servers to produce Markdown. To continue, please
            accept our{' '}
            <button type="button" onClick={() => setLegalTab('terms')} className={linkClass}>
              Terms of Service
            </button>{' '}
            and{' '}
            <button type="button" onClick={() => setLegalTab('privacy')} className={linkClass}>
              Privacy Policy
            </button>
            .
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => accept()}
              className="px-4 py-2 rounded-full aurora-btn font-sans text-[13px] font-semibold cursor-pointer shadow-sm"
            >
              Accept &amp; continue
            </button>
            <button
              type="button"
              onClick={() => setLegalTab('terms')}
              className="px-3.5 py-2 rounded-full border border-[var(--border-3)] hover:border-[var(--text)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)] font-tech text-[11.5px] cursor-pointer transition-colors"
            >
              Read first
            </button>
          </div>
        </div>
      </section>

      {legalTab && <LegalModal isOpen onClose={() => setLegalTab(null)} initialTab={legalTab} />}
    </>
  );
}
