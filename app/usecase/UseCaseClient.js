'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import MarkDifyHeader from '../../components/MarkDifyHeader';
import MarkDifyFooter from '../../components/MarkDifyFooter';
import MobileDock from '../../components/MobileDock';
import BlogModal from '../../components/BlogModal';
import ApiModal from '../../components/ApiModal';
import LegalModal from '../../components/LegalModal';

const FAQS = [
  {
    q: 'What formats are supported?',
    a: 'PDF, Word (.docx, .doc), PowerPoint (.pptx, .ppt), Excel (.xlsx, .xls), HTML, CSV, JSON, XML, ePub, plain text, and common images (PNG, JPEG). All converted into standardized Markdown.',
  },
  {
    q: 'Is it completely free?',
    a: 'Yes, 100% free with no sign-up, no subscriptions, and no hidden limits. Powered by Microsoft’s open-source MarkItDown project.',
  },
  {
    q: 'Do you store or train on my files?',
    a: 'Never. Files are streamed directly into server memory during conversion and discarded the instant the response finishes. No retention, no persistent database, no model training.',
  },
  {
    q: 'Does OCR work on scanned PDFs?',
    a: 'Standalone images (PNG, JPEG) are parsed with OCR. Scanned PDFs without a searchable text layer require a dedicated pre-rasterization step for optical text extraction.',
  },
  {
    q: 'What are the processing profiles?',
    a: 'Standard delivers full fidelity with frontmatter. Clean removes extra blank lines and boilerplate. Compact condenses whitespace for tight token budgets. RAG-ready inserts explicit heading delimiters for vector search chunking.',
  },
];

export default function UseCaseClient() {
  const [theme, setTheme] = useState('dark');
  const [blogOpen, setBlogOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setTheme(document.documentElement.dataset.theme || 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('mdify-theme', next);
    } catch {
      // ignore
    }
    setTheme(next);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)] font-sans transition-colors relative">
      {/* ── Global Header (1k Desktop / 1l Mobile) ── */}
      <MarkDifyHeader
        activeTab="usecase"
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenBlog={() => setBlogOpen(true)}
      />

      {/* ── Main Container (Wireframe 1t & 1u) ── */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-32">
        {/* Card Frame */}
        <div className="border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-xl bg-[var(--surface)] shadow-sm overflow-hidden font-wireframe">
          
          {/* Hero Section */}
          <div className="relative p-6 sm:p-8 border-b-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] overflow-hidden bg-[var(--surface)]">
            {/* Aurora blob */}
            <div
              className="absolute right-[-40px] top-[-30px] w-[200px] h-[170px] rounded-[55%_45%_50%_50%] pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, #d3ccf0, #eec9d6)',
                opacity: theme === 'dark' ? 0.35 : 0.7,
                filter: 'blur(20px)',
              }}
            />

            <div className="font-tech text-[10px] tracking-[0.14em] text-[var(--faint)] uppercase">
              WHY MDIFY · RAG & LLM PIPELINES
            </div>

            <h1 className="text-[32px] sm:text-[40px] leading-[1.05] font-bold tracking-tight text-[var(--text)] mt-2 max-w-xl m-0">
              Feed LLMs clean Markdown, not messy PDFs.
            </h1>

            <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-lg mt-3 mb-0 font-sans">
              Raw documents waste tokens and confuse models. Structured Markdown keeps headings, lists, and tables intact so retrieval engines find what they need.
            </p>

            <div className="mt-5">
              <Link
                href="/"
                className="inline-block px-5 py-2.5 rounded-full aurora-btn text-[14px] font-sans font-semibold no-underline shadow-sm"
              >
                Convert a file now →
              </Link>
            </div>
          </div>

          {/* ── Side-by-Side Problem (1t & 1u) ── */}
          <div className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              The problem, side by side
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Raw Extraction */}
              <div className="border border-[var(--border-3)] rounded-lg p-3.5 bg-[var(--surface-2)] space-y-2">
                <div className="font-tech text-[10px] text-[var(--faint)] uppercase tracking-wider">
                  RAW TEXT EXTRACTION
                </div>
                <div className="space-y-1.5 py-1">
                  <div className="h-2 bg-[var(--border-3)] rounded w-full" />
                  <div className="h-2 bg-[var(--border-3)] rounded w-full" />
                  <div className="h-2 bg-[var(--border-3)] rounded w-11/12" />
                  <div className="h-2 bg-[var(--border-3)] rounded w-full" />
                  <div className="h-2 bg-[var(--border-3)] rounded w-3/4" />
                </div>
                <div className="font-tech text-[10px] text-rose-500 pt-1">
                  ✕ no headings · tables collapsed · wasted tokens
                </div>
              </div>

              {/* MDify Markdown */}
              <div className="border-[1.5px] border-[#b6ade0] dark:border-indigo-800 rounded-lg p-3.5 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                <div className="font-tech text-[10px] text-indigo-700 dark:text-indigo-300 uppercase tracking-wider font-semibold">
                  MDIFY MARKDOWN
                </div>
                <div className="space-y-1.5 py-1">
                  <div className="h-3.5 bg-[#ddd8f2] dark:bg-indigo-800 rounded w-7/12" />
                  <div className="h-2 bg-[var(--border-3)] rounded w-full" />
                  <div className="h-2 bg-[var(--border-3)] rounded w-4/5" />
                  <div className="h-3 bg-[#ddd8f2] dark:bg-indigo-800 rounded w-5/12" />
                  <div className="h-6 border border-[#ddd8f2] dark:border-indigo-800 rounded bg-[var(--surface)] text-[9px] flex items-center px-2 font-tech text-[var(--muted)]">
                    | Column A | Column B | Column C |
                  </div>
                </div>
                <div className="font-tech text-[10px] text-emerald-600 dark:text-emerald-400 pt-1">
                  ✓ explicit H2/H3 outline · tables preserved · chunks cleanly
                </div>
              </div>
            </div>
          </div>

          {/* ── Benefits 4-grid (1t) ── */}
          <div className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              Core Architectural Benefits
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
              <div className="border border-[var(--border-3)] rounded-lg p-3.5 bg-[var(--surface-2)] space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center text-[10px] text-[#2d2740] font-bold">
                    ✓
                  </div>
                  <b className="text-[14px] text-[var(--text)]">Structure survives</b>
                </div>
                <p className="text-[12.5px] text-[var(--muted)] m-0 leading-relaxed pl-7">
                  Headings remain headings, nested lists stay indented, and complex tables keep their columns.
                </p>
              </div>

              <div className="border border-[var(--border-3)] rounded-lg p-3.5 bg-[var(--surface-2)] space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center text-[10px] text-[#2d2740] font-bold">
                    ⚡
                  </div>
                  <b className="text-[14px] text-[var(--text)]">
                    Token-efficient <span className="font-tech text-[9.5px] text-[var(--faint)]">est.</span>
                  </b>
                </div>
                <p className="text-[12.5px] text-[var(--muted)] m-0 leading-relaxed pl-7">
                  Stripping binary noise, styling metadata, and arbitrary font wrappers reduces context usage by up to 70%.
                </p>
              </div>

              <div className="border border-[var(--border-3)] rounded-lg p-3.5 bg-[var(--surface-2)] space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center text-[10px] text-[#2d2740] font-bold">
                    ◈
                  </div>
                  <b className="text-[14px] text-[var(--text)]">Built for RAG chunking</b>
                </div>
                <p className="text-[12.5px] text-[var(--muted)] m-0 leading-relaxed pl-7">
                  Heading-aligned chunks preserve parent context so embeddings retrieve complete concepts instead of orphaned sentences.
                </p>
              </div>

              <div className="border border-[var(--border-3)] rounded-lg p-3.5 bg-[var(--surface-2)] space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center text-[10px] text-[#2d2740] font-bold">
                    📁
                  </div>
                  <b className="text-[14px] text-[var(--text)]">Every common document format</b>
                </div>
                <p className="text-[12.5px] text-[var(--muted)] m-0 leading-relaxed pl-7">
                  PDF, DOCX, PPTX, XLSX, HTML, CSV, JSON, and OCR images. One tool handles the entire pipeline.
                </p>
              </div>
            </div>
          </div>

          {/* ── How It Works (1t) ── */}
          <div className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              How it works
            </h2>
            <div className="space-y-2.5 text-[13px] text-[var(--text)] font-sans">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] text-[#2d2740] flex items-center justify-center font-tech text-[11px] font-bold flex-none">
                  01
                </span>
                <span>Drop your files (up to 20 documents in a single batch).</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] text-[#2d2740] flex items-center justify-center font-tech text-[11px] font-bold flex-none">
                  02
                </span>
                <span>Pick a profile: Standard, Clean, Compact, or RAG-ready.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] text-[#2d2740] flex items-center justify-center font-tech text-[11px] font-bold flex-none">
                  03
                </span>
                <span>Copy to clipboard, download individually (.md), export as a batch (.zip), or call the API.</span>
              </div>
            </div>
          </div>

          {/* ── Honest Comparison Grid (1u) ── */}
          <div className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              Honest comparison
            </h2>
            <div className="border border-[var(--border-3)] rounded-lg overflow-hidden text-[12.5px]">
              <div className="grid grid-cols-4 bg-[var(--surface-2)] p-2.5 font-tech text-[11px] text-[var(--faint)] border-b border-[var(--border-3)]">
                <div>FEATURE</div>
                <div className="text-[var(--text)] font-bold">MDify</div>
                <div>Copy-Paste</div>
                <div>Raw Text Dump</div>
              </div>
              <div className="grid grid-cols-4 p-2.5 border-b border-[var(--border)]">
                <div className="font-medium">Keeps Structure</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Yes</div>
                <div className="text-rose-500">✕ No</div>
                <div className="text-rose-500">✕ No</div>
              </div>
              <div className="grid grid-cols-4 p-2.5 border-b border-[var(--border)]">
                <div className="font-medium">Table Preservation</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Pipe-grid</div>
                <div className="text-rose-500">✕ Broken</div>
                <div className="text-amber-500">~ Flattened</div>
              </div>
              <div className="grid grid-cols-4 p-2.5">
                <div className="font-medium">Batch & API Ready</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Free · up to 20</div>
                <div className="text-rose-500">✕ Manual only</div>
                <div className="text-amber-500">~ Partial</div>
              </div>
            </div>
            <div className="font-tech text-[10px] text-[#2a78d6]">
              factual columns only — no competitor bashing
            </div>
          </div>

          {/* ── FAQ Section (1t) ── */}
          <div className="p-5 sm:p-6 space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {FAQS.map((faq, i) => (
                <div
                  key={faq.q}
                  className="border border-[var(--border-3)] rounded-lg p-3 bg-[var(--surface-2)] transition-colors"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex justify-between items-center text-left font-medium text-[13.5px] text-[var(--text)] bg-transparent border-0 cursor-pointer p-0"
                  >
                    <span>{faq.q}</span>
                    <span className="text-[14px] text-[var(--muted)] font-tech ml-2">
                      {openFaq === i ? '−' : '+'}
                    </span>
                  </button>
                  {openFaq === i && (
                    <p className="mt-2 mb-0 text-[12.5px] text-[var(--muted)] leading-relaxed">
                      {faq.a}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Ready to convert CTA */}
          <div className="p-6 border-t border-[var(--border)] text-center space-y-3 bg-[var(--surface-2)]">
            <div className="aurora-hairline w-32 mx-auto rounded-full" />
            <h3 className="font-wireframe text-[22px] font-bold m-0">
              Ready to convert your documents?
            </h3>
            <Link
              href="/"
              className="inline-block px-6 py-2 rounded-full aurora-btn font-sans text-[14px] font-semibold no-underline shadow-sm"
            >
              Open Converter →
            </Link>
          </div>
        </div>
      </main>

      {/* ── Global Footer (1m) ── */}
      <MarkDifyFooter
        onOpenBlog={() => setBlogOpen(true)}
        onOpenApi={() => setApiOpen(true)}
        onOpenLegal={(type) => setLegalModal(type)}
      />

      {/* ── Mobile Dock (1g) ── */}
      <MobileDock
        activeTab="why"
        onSelectTab={() => {}}
        onToggleTheme={toggleTheme}
        onOpenBlog={() => setBlogOpen(true)}
        onOpenMenu={() => {}}
      />

      {/* ── Modals ── */}
      <BlogModal isOpen={blogOpen} onClose={() => setBlogOpen(false)} />
      <ApiModal isOpen={apiOpen} onClose={() => setApiOpen(false)} />
      <LegalModal
        isOpen={Boolean(legalModal)}
        onClose={() => setLegalModal(null)}
        initialTab={legalModal || 'privacy'}
      />
    </div>
  );
}
