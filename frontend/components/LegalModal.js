'use client';

import React, { useState } from 'react';
import { useModalDialog } from './useModalDialog';
import LegalDocument from './LegalDocument';
import { LEGAL_DOCUMENTS } from '../lib/legal/policies';

export default function LegalModal({ isOpen, onClose, initialTab = 'privacy' }) {
  const [tab, setTab] = useState(initialTab);
  const dialogRef = useModalDialog(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="legal-modal-title" tabIndex={-1} className="relative w-full max-w-xl max-h-[88dvh] flex flex-col outline-none bg-[var(--surface)] border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-xl shadow-2xl overflow-hidden font-wireframe text-[var(--text)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-3">
            <b id="legal-modal-title" className="text-[15px]">
              {(LEGAL_DOCUMENTS[tab] || LEGAL_DOCUMENTS.privacy).title}
            </b>
            <div className="flex gap-1 font-tech text-[10px]">
              <button
                onClick={() => setTab('privacy')}
                className={`px-2 py-0.5 rounded-full border cursor-pointer ${
                  tab === 'privacy'
                    ? 'border-[var(--text)] bg-[var(--surface)] font-bold'
                    : 'border-transparent text-[var(--muted)]'
                }`}
              >
                Privacy
              </button>
              <button
                onClick={() => setTab('terms')}
                className={`px-2 py-0.5 rounded-full border cursor-pointer ${
                  tab === 'terms'
                    ? 'border-[var(--text)] bg-[var(--surface)] font-bold'
                    : 'border-transparent text-[var(--muted)]'
                }`}
              >
                Terms
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border-3)] hover:bg-[var(--surface)] text-[14px] cursor-pointer bg-transparent"
          >
            ✕
          </button>
        </div>

        {/* 2.5px Aurora Hairline */}
        <div className="aurora-hairline w-full" />

        {/* Body: Privacy Policy or Terms, from lib/legal/policies.js */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <LegalDocument doc={LEGAL_DOCUMENTS[tab] || LEGAL_DOCUMENTS.privacy} />
        </div>

        <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--surface-2)] flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-full border border-[var(--border-3)] hover:bg-[var(--surface)] text-[var(--text)] font-tech text-[11px] cursor-pointer bg-transparent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
