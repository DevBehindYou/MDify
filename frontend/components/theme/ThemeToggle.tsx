'use client';

// Glass theme toggle for the navbar. The initial theme is set before paint by
// the inline script in app/layout.tsx (no flash); this component reflects and
// flips it, persisting the choice to localStorage.

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return (document.documentElement.dataset.theme as Theme) || 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('mdify-theme', next);
    } catch {
      /* storage may be unavailable */
    }
    setTheme(next);
  };

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={mounted ? isLight : undefined}
      aria-label="Toggle light and dark theme"
      className="glass-pill relative flex-none"
      style={{ width: 62, height: 32, padding: 0, cursor: 'pointer', border: '1px solid var(--glass-border)' }}
    >
      <span aria-hidden style={{ position: 'absolute', top: '50%', left: 9, transform: 'translateY(-50%)', fontSize: 11, opacity: 0.55, zIndex: 5 }}>
        ☀️
      </span>
      <span aria-hidden style={{ position: 'absolute', top: '50%', right: 9, transform: 'translateY(-50%)', fontSize: 11, opacity: 0.55, zIndex: 5 }}>
        🌙
      </span>
      <span
        className="glass-circle"
        aria-hidden
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 26,
          height: 26,
          zIndex: 10,
          display: 'grid',
          placeItems: 'center',
          fontSize: 13,
          lineHeight: 1,
          border: '1px solid var(--glass-border)',
          // Knob sits on the side matching its own icon: sun-left (light),
          // moon-right (dark). The opposite icon stays visible on the track.
          transform: isLight ? 'translateX(0)' : 'translateX(30px)',
          transition: 'transform .42s var(--motion-spring)',
        }}
      >
        {isLight ? '☀️' : '🌙'}
      </span>
    </button>
  );
}
