'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import MarkDifyHeader from '../../components/MarkDifyHeader';
import MarkDifyFooter from '../../components/MarkDifyFooter';
import MobileDock from '../../components/MobileDock';
import { useThemeViewModel } from '../../viewmodels/useThemeViewModel';
import {
  CONTENT_UPDATED,
  CONTENT_UPDATED_LABEL,
  FAQS,
  FORMAT_GROUPS,
  SOURCES,
  TOKEN_EXAMPLE,
  savedPercent,
} from '../../lib/siteContent';

const BlogModal = dynamic(() => import('../../components/BlogModal'), { ssr: false });
const ApiModal = dynamic(() => import('../../components/ApiModal'), { ssr: false });
const LegalModal = dynamic(() => import('../../components/LegalModal'), { ssr: false });

const n = (value) => value.toLocaleString('en-US');

const TOKEN_ROWS = [
  { label: 'MDify Markdown', image: 0, total: TOKEN_EXAMPLE.markdown, saved: null, best: true },
  { label: 'PDF, standard-resolution model', image: 1568, total: TOKEN_EXAMPLE.pdfStandard, saved: savedPercent(TOKEN_EXAMPLE.pdfStandard) },
  { label: 'PDF, high-resolution model', image: 2714, total: TOKEN_EXAMPLE.pdfHighRes, saved: savedPercent(TOKEN_EXAMPLE.pdfHighRes) },
];

const sourceLink = (source) => (
  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[#2a78d6] dark:text-[#60a5fa] underline underline-offset-2 hover:no-underline">
    {source.label}
  </a>
);

function Benefit({ icon, title, children }) {
  return (
    <div className="border border-[var(--border-3)] rounded-lg p-3.5 bg-[var(--surface-2)] space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center text-[10px] text-[#2d2740] font-bold">
          {icon}
        </div>
        <h3 className="text-[14px] font-bold text-[var(--text)] m-0">{title}</h3>
      </div>
      <p className="text-[12.5px] text-[var(--muted)] m-0 leading-relaxed pl-7">{children}</p>
    </div>
  );
}

export default function UseCaseClient() {
  const { theme, toggleTheme } = useThemeViewModel();
  const [blogOpen, setBlogOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [legalModal, setLegalModal] = useState(null);

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
        <article className="border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-xl bg-[var(--surface)] shadow-sm overflow-hidden font-wireframe">

          {/* Hero: the answer first */}
          <div className="relative p-6 sm:p-8 border-b-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] overflow-hidden bg-[var(--surface)]">
            <div
              className="absolute right-[-40px] top-[-30px] w-[200px] h-[170px] rounded-[55%_45%_50%_50%] pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, #d3ccf0, #eec9d6)',
                opacity: theme === 'dark' ? 0.35 : 0.7,
                filter: 'blur(20px)',
              }}
            />

            <div className="font-tech text-[10px] tracking-[0.14em] text-[var(--faint)] uppercase">
              WHY MDIFY · AI TOKENS · RAG
            </div>

            <h1 className="text-[32px] sm:text-[40px] leading-[1.05] font-bold tracking-tight text-[var(--text)] mt-2 max-w-xl m-0">
              Cut PDF token costs by 70% with Markdown.
            </h1>

            <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-lg mt-3 mb-0 font-sans">
              Markdown is the cheapest way to hand a document to AI. Many chat apps read a PDF as text plus a picture of every
              page, so a {TOKEN_EXAMPLE.words}-word page costs about {n(TOKEN_EXAMPLE.pdfStandard)} tokens. The same page as
              Markdown costs about {n(TOKEN_EXAMPLE.markdown)}. MDify converts PDF, Word, PowerPoint, Excel, images and ZIP files to
              Markdown for free, with no sign-up.
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
          <section className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              The problem, side by side
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-[var(--border-3)] rounded-lg p-3.5 bg-[var(--surface-2)] space-y-2">
                <div className="font-tech text-[10px] text-[var(--faint)] uppercase tracking-wider">
                  RAW TEXT EXTRACTION
                </div>
                <div className="space-y-1.5 py-1" aria-hidden>
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

              <div className="border-[1.5px] border-[#b6ade0] dark:border-indigo-800 rounded-lg p-3.5 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                <div className="font-tech text-[10px] text-indigo-700 dark:text-indigo-300 uppercase tracking-wider font-semibold">
                  MDIFY MARKDOWN
                </div>
                <div className="space-y-1.5 py-1" aria-hidden>
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
          </section>

          {/* ── Token savings, with the arithmetic and sources ── */}
          <section className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              How much does converting a PDF to Markdown save?
            </h2>
            <p className="text-[13px] text-[var(--muted)] leading-relaxed m-0">
              About {savedPercent(TOKEN_EXAMPLE.pdfStandard)}% of the tokens for a typical {TOKEN_EXAMPLE.words}-word page. Claude&apos;s
              documentation says each PDF page is converted into an image and charged as image tokens on top of the text
              ({sourceLink(SOURCES.pdfSupport)}). Markdown carries only the text and its structure.
            </p>
            <div className="overflow-x-auto border border-[var(--border-3)] rounded-lg">
              <table className="w-full min-w-[520px] text-[12.5px] border-collapse">
                <thead className="bg-[var(--surface-2)] font-tech text-[10.5px] text-[var(--faint)] uppercase">
                  <tr>
                    <th className="text-left font-normal p-2.5">How the page reaches the AI</th>
                    <th className="text-right font-normal p-2.5">Text</th>
                    <th className="text-right font-normal p-2.5">Page image</th>
                    <th className="text-right font-normal p-2.5">Total tokens</th>
                    <th className="text-right font-normal p-2.5">Markdown saves</th>
                  </tr>
                </thead>
                <tbody>
                  {TOKEN_ROWS.map((row) => (
                    <tr key={row.label} className="border-t border-[var(--border)]">
                      <td className={`p-2.5 ${row.best ? 'font-bold text-[var(--text)]' : ''}`}>{row.label}</td>
                      <td className="p-2.5 text-right tabular-nums">{n(TOKEN_EXAMPLE.markdown)}</td>
                      <td className="p-2.5 text-right tabular-nums">{n(row.image)}</td>
                      <td className={`p-2.5 text-right tabular-nums ${row.best ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}`}>{n(row.total)}</td>
                      <td className="p-2.5 text-right tabular-nums font-bold">{row.saved === null ? '' : `${row.saved}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-0 pl-5 space-y-1 text-[12.5px] text-[var(--muted)] leading-relaxed">
              <li>
                Text: 100 tokens is about 75 English words ({sourceLink(SOURCES.tokens)}), so {TOKEN_EXAMPLE.words} words is about{' '}
                {n(TOKEN_EXAMPLE.markdown)} tokens.
              </li>
              <li>
                Page image: one token per 28 × 28 pixel patch, capped at 1,568 on standard-resolution models and 4,784 on
                high-resolution models ({sourceLink(SOURCES.vision)}). A US Letter page at 150 dpi (1275 × 1650 px) reaches the
                1,568 cap, or 2,714 patches on a high-resolution model.
              </li>
              <li>
                Your result will vary. Dense pages save less, pages full of charts save more. Apps that read only the extracted
                text skip the image cost, but Markdown still keeps the headings and tables plain text loses.
              </li>
            </ul>

            <h3 className="font-wireframe text-[17px] font-bold text-[var(--text)] m-0 pt-2">
              Why this matters on a free AI plan
            </h3>
            <p className="text-[13px] text-[var(--muted)] leading-relaxed m-0">
              Most people use AI chat for free. OpenAI reported 900 million weekly ChatGPT users and 50 million paying subscribers in
              February 2026 ({sourceLink(SOURCES.users)}), so roughly 9 in 10 weekly users don&apos;t pay. Free plans cap how much you
              can send, and big attachments use that allowance fastest. Convert first, paste only the sections you need, and the
              same free session answers more questions.
            </p>
          </section>

          {/* ── Benefits ── */}
          <section className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              What you get from MDify
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
              <Benefit icon="✓" title="Structure survives">
                Headings stay headings, nested lists stay indented, and tables keep their columns as Markdown pipe tables.
              </Benefit>
              <Benefit icon="⚡" title="Cuts PDF token costs by 70%">
                A {TOKEN_EXAMPLE.words}-word page drops from about {n(TOKEN_EXAMPLE.pdfStandard)} tokens to {n(TOKEN_EXAMPLE.markdown)}{' '}
                when the AI no longer reads a picture of every page.
              </Benefit>
              <Benefit icon="◈" title="Built for RAG chunking">
                Heading-aligned chunks keep their parent context, so search returns complete ideas instead of orphaned sentences.
              </Benefit>
              <Benefit icon="📁" title="PDFs, scans, images and ZIP files">
                Documents, scanned pages, photos of text and whole project folders. One tool for the full pipeline.
              </Benefit>
            </div>
          </section>

          {/* ── Formats ── */}
          <section className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              What can MDify convert to Markdown?
            </h2>
            <p className="text-[13px] text-[var(--muted)] leading-relaxed m-0">
              MDify converts documents, scanned PDFs, images and ZIP files to Markdown, up to 20 files per batch.
            </p>
            <div className="overflow-x-auto border border-[var(--border-3)] rounded-lg">
              <table className="w-full min-w-[560px] text-[12.5px] border-collapse">
                <thead className="bg-[var(--surface-2)] font-tech text-[10.5px] text-[var(--faint)] uppercase">
                  <tr>
                    <th className="text-left font-normal p-2.5">Input</th>
                    <th className="text-left font-normal p-2.5">Formats</th>
                    <th className="text-left font-normal p-2.5">Limit</th>
                    <th className="text-left font-normal p-2.5">You get</th>
                  </tr>
                </thead>
                <tbody>
                  {FORMAT_GROUPS.map((g) => (
                    <tr key={g.name} className="border-t border-[var(--border)] align-top">
                      <td className="p-2.5 font-bold text-[var(--text)] whitespace-nowrap">{g.name}</td>
                      <td className="p-2.5">{g.formats}</td>
                      <td className="p-2.5 whitespace-nowrap">{g.limit}</td>
                      <td className="p-2.5">{g.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── How It Works (1t) ── */}
          <section className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              How to convert a PDF to Markdown
            </h2>
            <ol className="list-none m-0 p-0 space-y-2.5 text-[13px] text-[var(--text)] font-sans">
              {[
                'Drop your files on the converter, up to 20 in one batch.',
                'Pick a profile: Standard, Clean, Compact or RAG-ready.',
                'Copy the Markdown, download a .md file, or export the batch as a .zip.',
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] text-[#2d2740] flex items-center justify-center font-tech text-[11px] font-bold flex-none">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Honest Comparison Grid (1u) ── */}
          <section className="p-5 sm:p-6 border-b border-[var(--border)] space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              Honest comparison
            </h2>
            <div className="overflow-x-auto border border-[var(--border-3)] rounded-lg">
              <table className="w-full min-w-[480px] text-[12.5px] border-collapse">
                <thead className="bg-[var(--surface-2)] font-tech text-[11px] text-[var(--faint)]">
                  <tr>
                    <th className="text-left font-normal p-2.5">FEATURE</th>
                    <th className="text-left p-2.5 text-[var(--text)] font-bold">MDify</th>
                    <th className="text-left font-normal p-2.5">Copy-Paste</th>
                    <th className="text-left font-normal p-2.5">Raw Text Dump</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Keeps structure', ['✓ Yes', 'good'], ['✕ No', 'bad'], ['✕ No', 'bad']],
                    ['Table preservation', ['✓ Pipe-grid', 'good'], ['✕ Broken', 'bad'], ['~ Flattened', 'mid']],
                    ['Scanned pages and images', ['✓ Text recognition', 'good'], ['✕ No', 'bad'], ['✕ No', 'bad']],
                    ['Batch and folders', ['✓ Free · up to 20 · ZIP', 'good'], ['✕ Manual only', 'bad'], ['~ Partial', 'mid']],
                  ].map(([feature, ...cells]) => (
                    <tr key={feature} className="border-t border-[var(--border)]">
                      <td className="p-2.5 font-medium">{feature}</td>
                      {cells.map(([text, tone]) => (
                        <td
                          key={text}
                          className={`p-2.5 ${
                            tone === 'good'
                              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                              : tone === 'bad'
                                ? 'text-rose-500'
                                : 'text-amber-500'
                          }`}
                        >
                          {text}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── FAQ: every answer is in the page HTML (crawlable), shown on demand ── */}
          <section className="p-5 sm:p-6 space-y-3 font-sans">
            <h2 className="font-wireframe text-[20px] font-bold text-[var(--text)] m-0">
              Frequently asked questions
            </h2>
            <div className="space-y-2">
              {FAQS.map((faq, i) => (
                <details
                  key={faq.q}
                  open={i === 0}
                  className="group border border-[var(--border-3)] rounded-lg p-3 bg-[var(--surface-2)] transition-colors"
                >
                  <summary className="flex justify-between items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <h3 className="m-0 font-medium text-[13.5px] text-[var(--text)] font-sans">{faq.q}</h3>
                    <span className="text-[14px] text-[var(--muted)] font-tech ml-2 group-open:hidden" aria-hidden>+</span>
                    <span className="text-[14px] text-[var(--muted)] font-tech ml-2 hidden group-open:inline" aria-hidden>−</span>
                  </summary>
                  <p className="mt-2 mb-0 text-[12.5px] text-[var(--muted)] leading-relaxed">{faq.a}</p>
                </details>
              ))}
            </div>
            <p className="m-0 pt-1 font-tech text-[10.5px] text-[var(--faint)]">
              Last updated <time dateTime={CONTENT_UPDATED}>{CONTENT_UPDATED_LABEL}</time>. Token figures are estimates from the
              cited documentation and depend on the AI app, the model and the page.
            </p>
          </section>

          {/* Ready to convert CTA */}
          <div className="p-6 border-t border-[var(--border)] text-center space-y-3 bg-[var(--surface-2)]">
            <div className="aurora-hairline w-32 mx-auto rounded-full" />
            <h2 className="font-wireframe text-[22px] font-bold m-0">
              Ready to convert your documents?
            </h2>
            <Link
              href="/"
              className="inline-block px-6 py-2 rounded-full aurora-btn font-sans text-[14px] font-semibold no-underline shadow-sm"
            >
              Open Converter →
            </Link>
          </div>
        </article>
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
      {blogOpen && <BlogModal isOpen onClose={() => setBlogOpen(false)} />}
      {apiOpen && <ApiModal isOpen onClose={() => setApiOpen(false)} />}
      {legalModal && (
        <LegalModal isOpen onClose={() => setLegalModal(null)} initialTab={legalModal} />
      )}
    </div>
  );
}
