'use client';

import { useCallback, useEffect, useState } from 'react';
import { applyTheme, readTheme } from '../lib/models/themeRepository';

export function useThemeViewModel() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggleTheme = useCallback(() => {
    const next = readTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  }, []);

  return { theme, toggleTheme };
}
