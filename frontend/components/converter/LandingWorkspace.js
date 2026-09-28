'use client';

import React from 'react';
import Link from 'next/link';
import Dropzone from './Dropzone';
import ReaderPane from './ReaderPane';

const FORMAT_TAGS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML', 'CSV', 'PNG', 'ZIP'];

/** Desktop mode 1a: hero band above a 50/50 upload / reader workspace. */
export default function LandingWorkspace({ theme, converter, exporter, ui, onBrowse }) {
  const { items, isBusy, hasConvertible } = converter;

  return (
    <div className="flex flex-col border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-lg bg-[var(--surface)] shadow-sm overflow-hidden flex-1">
      {/* Hero Band with Aurora blob */}
      <div className="relative p-6 sm:p-7 border-b-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] overflow-hidden bg-[var(--surface)]">
        <div
          className="absolute right-[-30px] bottom-[-40px] w-[210px] h-[160px] rounded-[60%_40%_55%_45%] pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, #d3ccf0, #eec9d6)',
            opacity: theme === 'dark' ? 0.35 : 0.75,
            filter: 'blur(24px)',
          }}
        />

        <div className="font-tech text-[10px] tracking-[0.14em] text-[var(--faint)] uppercase">
          FREE · NO SIGN-UP · OPEN SOURCE
        </div>

        <h1 className="font-wireframe text-[34px] sm:text-[38px] leading-tight font-bold tracking-tight text-[var(--text)] mt-2 max-w-xl m-0">
          Convert PDF and any document to Markdown.
        </h1>

        <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-lg mt-2 mb-0 font-sans">
          Word, PowerPoint, Excel, HTML, images and ZIP files too. Cut PDF token costs by 70% and make your free AI plan go further.
        </p>
      </div>

      {/* 50/50 Workspace Grid */}
      <div className="grid grid-cols-2 min-h-[380px] flex-1">
        {/* Left Pane: UPLOAD */}
        <div className="border-r-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-4 flex flex-col gap-3">
          <div className="font-tech text-[10.5px] text-[var(--faint)] flex items-center justify-between">
            <span>UPLOAD · pane scrolls internally</span>
            <span className="text-[var(--muted)]">Profile: {converter.profile}</span>
          </div>

          <Dropzone
            onFiles={converter.addFiles}
            onBrowse={onBrowse}
            className="flex-1 min-h-[220px] border-[1.5px] border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all bg-wireframe-hatch"
            idleClassName="border-[#9a9a9a] dark:border-[var(--border-3)] hover:border-[var(--text)]"
          >
            <div className="w-[44px] h-[44px] rounded-full border-[1.5px] border-[#bdb4de] bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center shadow-sm mb-2">
              <span className="text-[#2d2740] text-[18px]">↓</span>
            </div>
            <div className="font-wireframe text-[18px] font-bold text-[var(--text)]">Drop files here</div>
            <div className="text-[12.5px] text-[var(--muted)] font-sans mt-0.5">
              or click to choose — up to 20 files
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-xs mt-3 font-tech text-[9.5px] text-[var(--faint)]">
              {FORMAT_TAGS.map((tag) => (
                <span key={tag} className="border border-[var(--border-3)] rounded px-1.5 py-0.5 bg-[var(--surface-2)]">
                  {tag}
                </span>
              ))}
            </div>
          </Dropzone>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={converter.convertAll}
              disabled={isBusy || !hasConvertible}
              className="flex-1 py-2 rounded-full aurora-btn font-sans text-[13.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isBusy ? 'Converting…' : `Convert all (${items.length})`}
            </button>
            <button
              type="button"
              onClick={converter.clearAll}
              disabled={!items.length}
              className="px-4 py-2 rounded-full border border-[var(--border-3)] text-[var(--muted)] hover:text-[var(--text)] font-sans text-[13.5px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-transparent"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Right Pane: READER / PREVIEW */}
        <ReaderPane
          variant="landing"
          converter={converter}
          exporter={exporter}
          previewMode={ui.previewMode}
          onPreviewModeChange={ui.setPreviewMode}
        />
      </div>

      {/* Bottom Link Bar (1a) */}
      <div className="px-4 py-2.5 border-t-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] flex items-center gap-3 text-[13px] text-[var(--muted)] font-sans bg-[var(--surface-2)]">
        <span>Want the details on why Markdown beats raw text for LLMs?</span>
        <Link
          href="/usecase"
          className="border border-[var(--border-3)] rounded-full px-3 py-0.5 text-[var(--text)] hover:bg-[var(--surface)] transition-colors no-underline text-[12px]"
        >
          Why Use It
        </Link>
        <button
          type="button"
          onClick={ui.openBlog}
          className="text-[#2a78d6] hover:underline bg-transparent border-0 p-0 cursor-pointer text-[12.5px]"
        >
          Blog
        </button>
      </div>
    </div>
  );
}
