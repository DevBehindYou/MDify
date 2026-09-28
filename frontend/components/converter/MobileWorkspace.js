'use client';

import React from 'react';
import Link from 'next/link';
import MarkdownViewer from '../MarkdownViewer';
import Dropzone from './Dropzone';
import PreviewModeToggle from './PreviewModeToggle';
import ExportActions from './ExportActions';
import { MAX_QUEUE_FILES } from '../../lib/formats';

const MOBILE_FORMAT_TAGS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'PNG', 'ZIP'];

function queueLabel(item, result) {
  if (result) return result.tokens_est ? `✓ ${result.tokens_est.toLocaleString()} est.` : '✓ done';
  return item.status;
}

/** Mobile stack 1e (tool-first) with the 1f reader bottom sheet. */
export default function MobileWorkspace({ converter, exporter, ui, onBrowse }) {
  const { items, results, activeResult, isBusy } = converter;

  return (
    <div className="md:hidden flex flex-col space-y-4 font-sans pb-32">
      {/* MOBILE STACK 1e: dropzone above the fold, hero to one line */}
      <div className="pt-2 px-1">
        <h1 className="font-wireframe text-[22px] leading-tight font-bold tracking-tight text-[var(--text)] m-0">
          Convert PDF to Markdown, free.
        </h1>
        <div className="font-tech text-[9.5px] tracking-[0.12em] text-[var(--faint)] mt-1">
          FREE · NO SIGN-UP · 70% FEWER AI TOKENS
        </div>
      </div>

      <Dropzone
        onFiles={converter.addFiles}
        onBrowse={onBrowse}
        className="border-[1.5px] border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-wireframe-hatch"
        idleClassName="border-[#9a9a9a] dark:border-[var(--border-3)]"
      >
        <div className="w-[46px] h-[46px] rounded-full border-[1.5px] border-[#bdb4de] bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center shadow-sm mb-2">
          <span className="text-[#2d2740] text-[18px]">↓</span>
        </div>
        <div className="font-wireframe text-[18px] font-bold text-[var(--text)]">Drop or choose files</div>
        <div className="text-[12px] text-[var(--muted)]">up to 20 at once</div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBrowse();
          }}
          className="mt-3 px-6 py-2 rounded-full aurora-btn text-[14px] font-medium cursor-pointer shadow-sm"
        >
          Choose files
        </button>
        <div className="flex flex-wrap gap-1 justify-center mt-3 font-tech text-[9px] text-[var(--faint)]">
          {MOBILE_FORMAT_TAGS.map((t) => (
            <span key={t} className="border border-[var(--border-3)] rounded px-1.5 py-0.5 bg-[var(--surface-2)]">
              {t}
            </span>
          ))}
        </div>
      </Dropzone>

      <div className="text-center font-tech text-[9px] text-[var(--faint)] -mt-1">
        ↑ fold line — tool fully visible on first paint
      </div>

      <p className="text-[12.5px] text-[var(--muted)] leading-relaxed px-1 m-0">
        Word, slides, Excel, images and ZIP files too. Cut PDF token costs by 70% so your free AI plan lasts longer.
      </p>

      {/* Queue preview (if files uploaded) */}
      {items.length > 0 && (
        <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-2)] space-y-2">
          <div className="flex items-center justify-between font-tech text-[11px]">
            <b className="font-wireframe text-[15px] text-[var(--text)]">{results.length} files converted</b>
            <button
              type="button"
              onClick={converter.convertAll}
              disabled={isBusy || !converter.hasConvertible}
              className="px-3 py-1 rounded-full aurora-btn text-[11.5px] font-medium disabled:opacity-50"
            >
              {isBusy ? 'Converting…' : 'Convert all'}
            </button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {items.map((item) => {
              const result = results.find((r) => r.id === item.id);
              return (
                <div
                  key={item.id}
                  className="border border-[var(--border-3)] rounded-lg p-2 bg-[var(--surface)] text-[12px] flex items-center justify-between"
                >
                  <span className="truncate pr-2 font-medium">{item.name}</span>
                  <span
                    className={`font-tech text-[10px] flex-none ${
                      item.status === 'error' ? 'text-rose-500' : 'text-[#2a78d6]'
                    }`}
                    title={item.errorMsg || undefined}
                  >
                    {queueLabel(item, result)}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onBrowse}
            className="w-full py-1.5 border border-dashed border-[var(--border-3)] rounded-lg text-center font-tech text-[11px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer bg-transparent"
          >
            + Add more ({items.length}/{MAX_QUEUE_FILES})
          </button>
        </div>
      )}

      <div className="border border-[var(--border-3)] rounded-lg p-3 text-[12.5px] text-[var(--muted)] bg-[var(--surface-2)] flex items-center justify-between gap-3">
        <span className="min-w-0">Why Markdown beats raw text for LLMs</span>
        <Link href="/usecase" className="flex-none whitespace-nowrap text-[#2a78d6] font-medium no-underline">
          Why Use It →
        </Link>
      </div>

      {/* MOBILE SHEET 1f: reader rises as a bottom sheet over the queue */}
      {results.length > 0 && (
        <div className="mt-4 border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-t-2xl p-3 bg-[var(--surface)] shadow-2xl space-y-3">
          <button
            type="button"
            onClick={ui.toggleSheet}
            aria-label={ui.sheetExpanded ? 'Collapse reader' : 'Expand reader'}
            className="tap-target block w-10 h-1 rounded-full bg-[#c9c9c9] mx-auto cursor-pointer border-0 p-0"
          />

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <PreviewModeToggle mode={ui.previewMode} onChange={ui.setPreviewMode} variant="mobile" />
            <ExportActions
              variant="mobile"
              hasActive={Boolean(activeResult)}
              hasResults={results.length > 0}
              copied={exporter.copied}
              onCopy={exporter.copyActive}
              onDownloadMd={exporter.downloadActive}
              onDownloadZip={exporter.downloadAll}
            >
              <button
                type="button"
                onClick={ui.toggleSheet}
                className="tap-target text-[#2a78d6] bg-transparent border-0 cursor-pointer p-0"
              >
                {ui.sheetExpanded ? 'Collapse' : 'Expand'}
              </button>
            </ExportActions>
          </div>

          {/* Converted file tab pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 font-tech text-[10px]">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => converter.selectResult(r.id)}
                title={r.filename}
                className={`px-2 py-0.5 rounded-full border whitespace-nowrap max-w-[14rem] truncate flex-none cursor-pointer ${
                  activeResult?.id === r.id
                    ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)] font-medium'
                    : 'border-[var(--border-3)] text-[var(--muted)] bg-[var(--surface-2)]'
                }`}
              >
                {r.filename}
              </button>
            ))}
          </div>

          <div className="w-full">
            <MarkdownViewer
              docId={activeResult?.id ?? null}
              content={activeResult?.content || ''}
              tokensEst={activeResult?.tokens_est}
              onChangeContent={converter.updateContent}
              viewMode={ui.previewMode}
              maxHeightClass={ui.sheetExpanded ? 'max-h-[65vh] h-[460px]' : 'h-[220px]'}
              showStatusBar={true}
              compactStatusBar={true}
              statusBarId="output-status-bar-mobile"
              isLoading={isBusy}
              loadingFileName={converter.convertingName}
            />
          </div>

          <div className="text-center font-tech text-[8.5px] text-[var(--faint)]">
            drag sheet up for full-screen reading · dock hides behind sheet
          </div>
        </div>
      )}
    </div>
  );
}
