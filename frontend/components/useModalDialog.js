'use client';

import { useEffect, useRef } from 'react';

/**
 * Shared dialog behavior for overlays: moves focus into the dialog when it
 * opens, closes on Escape, and returns focus to the element that opened it.
 * Attach the returned ref to the dialog element (with tabIndex={-1}).
 */
export function useModalDialog(isOpen, onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return dialogRef;
}
