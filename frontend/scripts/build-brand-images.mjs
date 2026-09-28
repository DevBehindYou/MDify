// Renders the raster brand images from SVG with sharp (bundled with Next.js):
//   public/og-card.png    1200×630 social preview (Open Graph, X, chat apps)
//   public/mdify-icon.png 512×512 app icon (Apple touch icon, schema.org logo)
// Run after changing the icon or the tagline:  npm run brand:images

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const C = {
  bg: '#08080a',
  panel: '#111114',
  border: '#2a2a32',
  hairline: '#1f1f24',
  text: '#f2f2f6',
  muted: '#c2c2cc',
  faint: '#9494a0',
  amber: '#f59e0b',
};
const SANS = "'Segoe UI', Inter, Arial, sans-serif";
const MONO = "Consolas, 'JetBrains Mono', monospace";

// The icon's marks (from mdify-icon-dark.svg), drawn in its own 150×150 box.
const ICON_MARKS = `
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="4" dy="6" stdDeviation="3" flood-color="#000" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect x="50" y="70" width="40" height="10" rx="5" fill="#a0a0ff" filter="url(#shadow)"/>
  <rect x="60" y="90" width="40" height="10" rx="5" fill="#6b6bff" filter="url(#shadow)"/>
  <rect x="70" y="110" width="40" height="10" rx="5" fill="#a0a0ff" filter="url(#shadow)"/>
  <text x="140" y="104" text-anchor="middle" dominant-baseline="central" font-family="${MONO}"
        font-weight="800" font-size="64" fill="${C.text}" filter="url(#shadow)">]#</text>`;

function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="40 29 150 150">
  <rect x="40" y="29" width="150" height="150" fill="${C.bg}"/>${ICON_MARKS}
</svg>`;
}

function ogCardSvg() {
  const W = 1200;
  const H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="aurora" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#8f83d8"/><stop offset="0.5" stop-color="#b58fd0"/><stop offset="1" stop-color="#d98fb0"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#b58fd0" stop-opacity="0.22"/><stop offset="1" stop-color="#b58fd0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="6" fill="url(#aurora)"/>
  <circle cx="930" cy="300" r="330" fill="url(#glow)"/>

  <!-- Brand: icon tile + wordmark -->
  <rect x="72" y="66" width="116" height="116" rx="26" fill="${C.panel}" stroke="${C.border}" stroke-width="2"/>
  <svg x="80" y="74" width="100" height="100" viewBox="40 29 150 150">${ICON_MARKS}</svg>
  <text x="212" y="146" font-family="${SANS}" font-weight="700" font-size="58" fill="${C.text}">MDify</text>

  <!-- Left column -->
  <text x="72" y="258" font-family="${MONO}" font-size="19" letter-spacing="3" fill="${C.faint}">FREE · NO SIGN-UP · OPEN SOURCE</text>
  <text x="72" y="330" font-family="${SANS}" font-weight="700" font-size="58" fill="${C.text}">PDF to Markdown</text>
  <text x="72" y="398" font-family="${SANS}" font-weight="700" font-size="58" fill="${C.text}">converter</text>
  <text x="72" y="452" font-family="${SANS}" font-size="23" fill="${C.muted}">Word · Excel · slides · images · ZIP files</text>

  <!-- Right column: the claim -->
  <rect x="700" y="150" width="428" height="318" rx="22" fill="${C.panel}" stroke="${C.border}" stroke-width="2"/>
  <text x="914" y="318" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="150" fill="${C.amber}">70%</text>
  <text x="914" y="378" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="32" fill="${C.text}">fewer AI tokens</text>
  <text x="914" y="418" text-anchor="middle" font-family="${SANS}" font-size="21" fill="${C.faint}">per PDF page, as Markdown</text>

  <!-- Footer -->
  <rect x="72" y="532" width="1056" height="1.5" fill="${C.hairline}"/>
  <text x="72" y="578" font-family="${MONO}" font-size="21" fill="${C.muted}">mdify-app.vercel.app</text>
  <text x="1128" y="578" text-anchor="end" font-family="${SANS}" font-size="21" fill="${C.faint}">Files deleted within 48 hours · by DevBehindYou</text>
</svg>`;
}

async function render(svg, file, size) {
  const out = path.join(PUBLIC, file);
  let img = sharp(Buffer.from(svg), { density: 144 });
  if (size) img = img.resize(size.width, size.height);
  await img.png({ compressionLevel: 9 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`wrote public/${file} ${meta.width}×${meta.height} (${fs.statSync(out).size} bytes)`);
}

await render(ogCardSvg(), 'og-card.png', { width: 1200, height: 630 });
await render(iconSvg(512), 'mdify-icon.png', { width: 512, height: 512 });
