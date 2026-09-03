'use client';

import React, { useState } from 'react';

export default function ApiModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const curlExample = `curl -X POST https://api.mdify.com/api/convert \\
  -F "file=@document.pdf" \\
  -F "profile=RAG-ready"`;

  const copyCurl = () => {
    navigator.clipboard.writeText(curlExample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[var(--surface)] border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-xl shadow-2xl overflow-hidden font-wireframe text-[var(--text)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-[1.5px] border-[var(--text)] rounded-[4px] p-0.5">
              <div className="w-full h-full rounded-[1px] bg-gradient-to-br from-[#8f83d8] to-[#d98fb0]" />
            </div>
            <b className="text-[15px]">MDify Public API</b>
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

        <div className="p-4 sm:p-5 space-y-4 font-sans text-[13px]">
          <div>
            <div className="font-tech text-[10px] text-[var(--faint)] uppercase tracking-wider mb-1">
              ENDPOINT
            </div>
            <div className="font-tech text-[12px] p-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
              POST /api/convert
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-tech text-[10px] text-[var(--faint)] uppercase tracking-wider">
                CURL EXAMPLE
              </span>
              <button
                onClick={copyCurl}
                className="font-tech text-[10.5px] text-[#2a78d6] hover:underline bg-transparent border-0 cursor-pointer p-0"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre className="font-tech text-[11.5px] p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] overflow-x-auto text-[var(--text)] m-0 leading-relaxed">
              {curlExample}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="font-tech text-[10px] text-[var(--faint)] uppercase tracking-wider">
              SUPPORTED PROFILES
            </div>
            <div className="grid grid-cols-2 gap-2 font-tech text-[11px]">
              <div className="p-2 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                <b>Standard:</b> Default clean markdown
              </div>
              <div className="p-2 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                <b>Clean:</b> Strips metadata & extra lines
              </div>
              <div className="p-2 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                <b>Compact:</b> Minimizes token density
              </div>
              <div className="p-2 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                <b>RAG-ready:</b> Chunk delimiters for retrieval
              </div>
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
