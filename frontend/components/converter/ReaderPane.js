'use client';

import React from 'react';
import MarkdownViewer from '../MarkdownViewer';
import PreviewModeToggle from './PreviewModeToggle';
import ExportActions from './ExportActions';

const VARIANTS = {
  landing: {
    toolbar: 'flex items-center justify-between gap-2 flex-wrap',
    toggle: 'landing',
    actions: 'pill',
    statusBarId: 'output-status-bar-1a',
  },
  column: {
    toolbar: 'flex items-center justify-between font-tech text-[10.5px] gap-2 flex-wrap',
    toggle: 'column',
    actions: 'text',
    statusBarId: 'output-status-bar-1c',
  },
};

/** Desktop reader: mode toggle + export actions above the Markdown viewer. */
export default function ReaderPane({ variant, converter, exporter, previewMode, onPreviewModeChange }) {
  const style = VARIANTS[variant];
  const { activeResult } = converter;

  return (
    <div className="min-w-0 p-4 flex flex-col gap-3 bg-[var(--surface-2)]">
      <div className={style.toolbar}>
        <PreviewModeToggle mode={previewMode} onChange={onPreviewModeChange} variant={style.toggle} />
        <ExportActions
          variant={style.actions}
          hasActive={Boolean(activeResult)}
          hasResults={converter.results.length > 0}
          copied={exporter.copied}
          onCopy={exporter.copyActive}
          onDownloadMd={exporter.downloadActive}
          onDownloadZip={exporter.downloadAll}
        />
      </div>

      <div className="flex-1 min-h-[350px] flex flex-col">
        <MarkdownViewer
          docId={activeResult?.id ?? null}
          content={activeResult?.content || ''}
          tokensEst={activeResult?.tokens_est}
          onChangeContent={converter.updateContent}
          viewMode={previewMode}
          maxHeightClass="min-h-[350px] max-h-[420px]"
          showStatusBar={true}
          statusBarId={style.statusBarId}
          isLoading={converter.isBusy}
          loadingFileName={converter.convertingName}
        />
      </div>
    </div>
  );
}
