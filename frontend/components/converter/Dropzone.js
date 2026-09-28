'use client';

import React, { memo, useState } from 'react';

const DRAG_ACTIVE_CLASS = 'border-[#2a78d6] scale-[0.99] ring-2 ring-[#2a78d6]/30';

/**
 * Drag-and-drop target that also opens the file picker on click/Enter.
 * Visual variants pass their own base and idle-border classes.
 */
function Dropzone({ className, idleClassName, onFiles, onBrowse, children }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  };

  const handleKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onBrowse();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop files here or choose files to convert"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onBrowse}
      onKeyDown={handleKeyDown}
      className={`${className} ${dragActive ? DRAG_ACTIVE_CLASS : idleClassName}`}
    >
      {children}
    </div>
  );
}

export default memo(Dropzone);
