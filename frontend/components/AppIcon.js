import React from 'react';

/**
 * MDify app icon that follows the app's theme (<html data-theme>), not the
 * OS: Tailwind `dark:` variants are bound to [data-theme="dark"]. Pure CSS,
 * so the right icon is already correct in the server-rendered HTML.
 * Decorative by default (alt=""), since it sits next to the "MDify" wordmark.
 * The thin ring keeps the tile visible where its background matches the page.
 */
export default function AppIcon({ size = 28, className = '', alt = '' }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mdify-icon-light.svg"
        alt={alt}
        width={size}
        height={size}
        className={`block dark:hidden flex-none ring-1 ring-[var(--border-3)] ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mdify-icon-dark.svg"
        alt={alt}
        width={size}
        height={size}
        className={`hidden dark:block flex-none ring-1 ring-[var(--border-3)] ${className}`}
      />
    </>
  );
}
