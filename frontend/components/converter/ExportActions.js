'use client';

import React, { Fragment, memo } from 'react';

const VARIANTS = {
  pill: {
    group: 'flex gap-1.5 font-tech text-[10.5px] text-[var(--muted)]',
    button:
      'border-[1.5px] border-[var(--border-3)] rounded-full px-2.5 py-0.5 hover:border-[var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--surface)] text-inherit',
    separated: false,
  },
  text: {
    group: 'flex gap-1.5 text-[var(--muted)] items-center',
    button: 'hover:text-[var(--text)] cursor-pointer disabled:opacity-30 bg-transparent border-0 p-0',
    separated: true,
  },
  mobile: {
    group: 'flex items-center gap-2 font-tech text-[10.5px] text-[var(--muted)]',
    button: 'hover:text-[var(--text)] bg-transparent border-0 cursor-pointer p-0 disabled:opacity-30',
    separated: true,
  },
};

/** Copy / .md / .zip actions for the reader; `children` appends extra actions. */
function ExportActions({
  variant = 'pill',
  hasActive,
  hasResults,
  copied,
  onCopy,
  onDownloadMd,
  onDownloadZip,
  children,
}) {
  const style = VARIANTS[variant];
  const actions = [
    { key: 'copy', label: copied ? '✓ Copied' : 'Copy', title: 'Copy to clipboard', onClick: onCopy, disabled: !hasActive },
    { key: 'md', label: '.md', title: 'Download .md file', onClick: onDownloadMd, disabled: !hasActive },
    { key: 'zip', label: '.zip', title: 'Download all as zip', onClick: onDownloadZip, disabled: !hasResults },
  ];

  return (
    <div className={style.group}>
      {actions.map((a, i) => (
        <Fragment key={a.key}>
          {style.separated && i > 0 && <span>·</span>}
          <button
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            className={`tap-target ${style.button}`}
            title={a.title}
          >
            {a.label}
          </button>
        </Fragment>
      ))}
      {children && (
        <>
          {style.separated && <span>·</span>}
          {children}
        </>
      )}
    </div>
  );
}

export default memo(ExportActions);
