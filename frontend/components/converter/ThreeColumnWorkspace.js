'use client';

import React, { useMemo } from 'react';
import Dropzone from './Dropzone';
import ProfileSelector from './ProfileSelector';
import QueueRail from './QueueRail';
import ReaderPane from './ReaderPane';

/** Desktop mode 1c: queue rail / dropzone + profile / reader (densest). */
export default function ThreeColumnWorkspace({ converter, exporter, ui, onBrowse }) {
  const { results } = converter;
  const resultIds = useMemo(() => new Set(results.map((r) => r.id)), [results]);

  return (
    <div className="flex flex-col border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-lg bg-[var(--surface)] shadow-sm overflow-hidden flex-1">
      <div className="grid grid-cols-[minmax(0,210px)_minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)_minmax(0,1fr)] min-h-[460px] flex-1">
        {/* Col 1: QUEUE RAIL */}
        <QueueRail
          items={converter.items}
          resultIds={resultIds}
          activeResultId={converter.activeResultId}
          isBusy={converter.isBusy}
          hasConvertible={converter.hasConvertible}
          onSelect={converter.selectResult}
          onRetry={converter.retry}
          onRemove={converter.removeFile}
          onClear={converter.clearAll}
          onBrowse={onBrowse}
          onConvertAll={converter.convertAll}
        />

        {/* Col 2: DROPZONE & PROFILE */}
        <div className="min-w-0 border-b-[1.5px] lg:border-b-0 lg:border-r-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] p-4 flex flex-col gap-3">
          <h2 className="font-wireframe text-[22px] leading-tight font-bold tracking-tight text-[var(--text)] m-0">
            Turn any document into clean Markdown.
          </h2>

          <Dropzone
            onFiles={converter.addFiles}
            onBrowse={onBrowse}
            className="flex-1 min-h-[220px] border-[1.5px] border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all bg-wireframe-hatch"
            idleClassName="border-[#9a9a9a] dark:border-[var(--border-3)] hover:border-[var(--text)]"
          >
            <div className="w-[38px] h-[38px] rounded-full border-[1.5px] border-[#bdb4de] bg-gradient-to-br from-[#cfc8ef] to-[#eec9d6] flex items-center justify-center shadow-sm mb-2">
              <span className="text-[#2d2740] text-[16px]">↓</span>
            </div>
            <div className="font-wireframe text-[16px] font-bold text-[var(--text)]">Drop files here</div>
            <div className="text-[11.5px] text-[var(--muted)] font-sans mt-0.5">
              PDF, DOCX, PPTX, XLSX, HTML, CSV, images
            </div>
          </Dropzone>

          <ProfileSelector profile={converter.profile} onChange={converter.setProfile} />
        </div>

        {/* Col 3: READER */}
        <ReaderPane
          variant="column"
          converter={converter}
          exporter={exporter}
          previewMode={ui.previewMode}
          onPreviewModeChange={ui.setPreviewMode}
        />
      </div>
    </div>
  );
}
