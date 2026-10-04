'use client';

import React, { useEffect, useState } from 'react';
import { VISUAL_PATH } from '../lib/blog.mjs';

// Blog banners and figures are first-party SVG files in public/blog/{slug}/.
// They're drawn inline (not as <img>) so their colors follow the app's theme
// tokens (--text, --surface, --bf-s1...). scripts/build-blog-index.mjs
// refuses any file with scripts, event handlers or outside links, and this
// component only fetches same-origin paths of that exact shape.

const cache = new Map();

function loadSvg(src) {
  if (!cache.has(src)) {
    const request = fetch(src, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const svg = text.trim();
        if (!svg.startsWith('<svg')) throw new Error('Not an SVG');
        return svg;
      })
      .catch((err) => {
        cache.delete(src);
        throw err;
      });
    cache.set(src, request);
  }
  return cache.get(src);
}

/**
 * One banner or figure. `size` is [width, height] from the generated post
 * index, so the space is reserved before the file arrives.
 */
export default function BlogVisual({ src, alt, size, className = '' }) {
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setSvg(null);
    setFailed(false);
    if (!VISUAL_PATH.test(src || '')) {
      setFailed(true);
      return undefined;
    }
    loadSvg(src)
      .then((text) => live && setSvg(text))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [src]);

  const ratio = size ? `${size[0]} / ${size[1]}` : '3 / 1';

  return (
    <div role="img" aria-label={alt} className={`blog-visual relative w-full ${className}`} style={{ aspectRatio: ratio }}>
      {svg ? (
        <div className="h-full w-full" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="h-full w-full bg-wireframe-hatch flex items-center justify-center p-3" aria-hidden="true">
          {failed && <span className="font-tech text-[10px] text-[var(--faint)] text-center">{alt}</span>}
        </div>
      )}
    </div>
  );
}
