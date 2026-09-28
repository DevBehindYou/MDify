'use client';

import { useEffect, useRef } from 'react';

/**
 * Binds Cmd/Ctrl shortcuts. Keys are the lowercase `KeyboardEvent.key`,
 * prefixed with "shift+" when Shift is held: { o, enter, 'shift+c', b }.
 * The listener is attached once; handlers always see the latest bindings.
 */
export function useKeyboardShortcuts(bindings) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const combo = `${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`;
      const handler = bindingsRef.current[combo];
      if (!handler) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
