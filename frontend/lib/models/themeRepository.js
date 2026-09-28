// The active theme lives on <html data-theme>, set before first paint by the
// inline script in app/layout.js. This module reads and updates it.

const STORAGE_KEY = 'mdify-theme';

export function readTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Enables the favicon for `theme` and disables the other one. Both links stay
 * in <head> with their href unchanged: React tracks them by href.
 */
export function syncFavicon(theme) {
  document.querySelectorAll('link[rel="icon"][href$=".svg"]').forEach((link) => {
    link.media = link.getAttribute('href').endsWith(`-${theme}.svg`) ? 'all' : 'not all';
  });
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  syncFavicon(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked — the theme still applies for this page view.
  }
}
