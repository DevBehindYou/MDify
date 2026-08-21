# MDify Pro — Liquid Glass UI (prototype)

A self-contained design prototype that skins the MDify Pro converter in an
Apple-style **Liquid Glass** material. Built to evaluate the look before
deciding whether to bring it into the real MDify Pro frontend.

Open `index.html` in any Chromium-based browser (Chrome/Edge/Arc) — no build step.

## What it demonstrates

- **Real refraction, not blur.** The dotted background physically **bends** at
  each glass edge via an SVG `feDisplacementMap` filter applied through
  `backdrop-filter: url(#…)`. Blur is kept at 0.12–0.3px so the surface stays
  clear glass, not frosted. (Common failure = "too much blur → grid disappears
  instead of bending"; we avoid it.)
- **Two dotted themes**, flipped by a glass **toggle switch in the navbar**:
  - Dark → **white dots on `#17181a`**
  - Light → **black dots on `#fff9e9`**
- **Readable contrast.** Body text is never behind the displacement filter
  (`backdrop-filter` only bends what's *behind* the panel, so text stays crisp).
  The Markdown reader sits on a calmer, higher-opacity `glass-strong` plane, and
  text colors are high-contrast per theme (`#f5f5f7` on dark, `#191a1c` on light).
  `prefers-contrast: more` and `prefers-reduced-motion` are honored.

## How the material is built (per layer)

| Layer | Implementation |
|---|---|
| Refraction / edge lens | `feTurbulence → feGaussianBlur → feDisplacementMap` in the `<svg class="filter-bank">`, applied via `backdrop-filter: url(#lgCard)` |
| Glass body | subtle white→transparent gradient fill + pointer-tracked radial highlight |
| Inner bezel (thickness) | `::before` with layered `inset` box-shadows |
| Reflective rim | `::after` masked gradient border (`mask-composite: exclude`) — the bright spectral edge |
| Shared scene light | `--pointer-x/--pointer-y` CSS vars updated on `pointermove` (rAF-throttled) |
| Fallback | `@supports not (backdrop-filter: url(...))` → legible frost + opaque fill |

## Browser support

`feDisplacementMap` in `backdrop-filter` is a **Chromium** capability (Chrome,
Edge, Arc, and the in-app browser). Safari/Firefox fall back to the frosted
`@supports` path automatically — still legible, just without the lensing.

## Porting to the real MDify Pro frontend (if approved)

The technique is framework-agnostic CSS/SVG, so it drops into the existing
Next.js + TypeScript + Tailwind app with no architecture change:

1. Move the `:root` theme tokens + glass classes into `frontend/app/globals.css`.
2. Add a `<GlassFilters />` component that renders the `<svg class="filter-bank">`
   once in `app/layout.tsx`.
3. Drive the theme with a `data-theme` attribute on `<html>` + a small provider
   (replace the mock `localStorage` toggle here with a proper theme hook).
4. Apply `.glass` / `.glass-strong` / `.glass-pill` to the existing MVVM
   components (`UploadPanel`, `OutputPanel`, `Header`, `FileRow`) — markup stays,
   only classes change.

This prototype is intentionally **standalone and mock-data-driven**; it is not
wired to the backend.
