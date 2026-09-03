'use client';

import React, { useState } from 'react';

export default function LegalModal({ isOpen, onClose, initialTab = 'privacy' }) {
  const [tab, setTab] = useState(initialTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl max-h-[88vh] flex flex-col bg-[var(--surface)] border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-xl shadow-2xl overflow-hidden font-wireframe text-[var(--text)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-3">
            <b className="text-[15px]">
              {tab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
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
            className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border-3)] hover:bg-[var(--surface)] text-[14px] cursor-pointer bg-transparent"
          >
            ✕
          </button>
        </div>

        {/* 2.5px Aurora Hairline */}
        <div className="aurora-hairline w-full" />

        {/* Body (1ac wireframe layout) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 font-sans text-[12.5px] text-[var(--muted)] leading-relaxed">
          <div className="font-tech text-[10px] text-[var(--faint)]">
            Last updated 12 March 2026
          </div>

          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface-2)] font-tech text-[11px] space-y-1">
            <div className="text-[var(--faint)] uppercase tracking-wider text-[9.5px]">
              SECTIONS
            </div>
            <div>1. What we process · 2. Retention · 3. Your rights</div>
            <div>4. Cookies · 5. Security & Contact</div>
          </div>

          <div className="space-y-3 text-[var(--text)]">
            <div>
              <h4 className="font-wireframe text-[16px] font-bold text-[var(--text)] m-0 mb-1">
                1. What We Process
              </h4>
              <p className="m-0 text-[var(--muted)] text-[12.5px]">
                Uploaded files (PDF, DOCX, XLSX, images, etc.) are streamed strictly to memory for the sole purpose of document conversion into Markdown. Files are processed in ephemeral server memory and are never written to persistent disk storage or used to train public machine learning models.
              </p>
            </div>

            <div>
              <h4 className="font-wireframe text-[16px] font-bold text-[var(--text)] m-0 mb-1">
                2. Data Retention
              </h4>
              <p className="m-0 text-[var(--muted)] text-[12.5px]">
                Zero retention. Immediately upon completing the conversion request, the server releases memory handles. Converted Markdown files reside purely in your browser session until you clear the queue or close the tab.
              </p>
            </div>

            <div>
              <h4 className="font-wireframe text-[16px] font-bold text-[var(--text)] m-0 mb-1">
                3. Your Rights & Privacy
              </h4>
              <p className="m-0 text-[var(--muted)] text-[12.5px]">
                MDify requires no registration, no user account, no passwords, and no email address. You retain full, unencumbered ownership and copyright of all source materials and generated Markdown.
              </p>
            </div>

            <div>
              <h4 className="font-wireframe text-[16px] font-bold text-[var(--text)] m-0 mb-1">
                4. Cookies & Telemetry
              </h4>
              <p className="m-0 text-[var(--muted)] text-[12.5px]">
                We use localStorage purely to remember your light/dark theme preference and conversion profile choice. No tracking cookies or advertising pixels are deployed.
              </p>
            </div>

            <div className="border-t border-[var(--border)] pt-3 font-tech text-[11px]">
              <b>Contact:</b> privacy@mdify.com · security@mdify.com
            </div>
          </div>
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
