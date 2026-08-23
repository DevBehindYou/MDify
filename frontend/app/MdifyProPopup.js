'use client';

// Mini-Frame promo (liquid glass) pointing legacy MDify users at MDify Pro.
// Bottom-left, appears after 10s, dismissed for the rest of the session.

import { useEffect, useState } from 'react';

const KEY = 'mdify-pro-promo-dismissed';
const PRO_URL = 'https://mdify-pro-app.vercel.app';

export default function MdifyProPopup() {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch (e) {
      /* storage unavailable */
    }
    const t = setTimeout(() => setShown(true), 10000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setShown(false);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch (e) {
      /* ignore */
    }
  };

  if (!mounted) return null;

  return (
    <>
      <div className={`mpp${shown ? ' mpp-show' : ''}`} role="dialog" aria-label="MDify Pro announcement">
        <button className="mpp-close" onClick={dismiss} aria-label="Dismiss">×</button>
        <div className="mpp-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mpp-mark" src="/mdify-icon.png" alt="MDify Pro" width="20" height="20" />
          <span className="mpp-name">MDify Pro</span>
        </div>
        <div className="mpp-card">
          <p className="mpp-copy">
            <strong>New MDify Pro version is live.</strong> Faster conversion, RAG-ready profiles, batch export.
          </p>
          <a className="mpp-cta" href={PRO_URL} target="_blank" rel="noopener noreferrer">
            <span className="mpp-label">Try it now</span>
            <span className="mpp-title">Open MDify Pro →</span>
          </a>
        </div>
      </div>

      <style jsx>{`
        .mpp {
          position: fixed;
          left: 20px;
          bottom: 20px;
          width: 300px;
          max-width: calc(100vw - 32px);
          z-index: 99999;
          padding: 12px;
          border-radius: 16px;
          isolation: isolate;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background:
            radial-gradient(300px circle at 0% 0%, rgba(245, 158, 11, 0.28), transparent 60%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
            rgba(22, 23, 26, 0.42);
          -webkit-backdrop-filter: blur(22px) saturate(1.7) brightness(1.05);
          backdrop-filter: blur(22px) saturate(1.7) brightness(1.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow:
            0 18px 44px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.28),
            inset 0 -1px 0 rgba(0, 0, 0, 0.3);
          opacity: 0;
          transform: translateY(16px);
          pointer-events: none;
          transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.22, 0.8, 0.2, 1);
        }
        /* Refractive rim — the signature liquid-glass edge. */
        .mpp::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          pointer-events: none;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.55),
            rgba(255, 255, 255, 0.06) 26%,
            rgba(245, 158, 11, 0.3) 55%,
            rgba(255, 255, 255, 0.08) 74%,
            rgba(255, 255, 255, 0.4)
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        .mpp-show {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .mpp-close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
          font-size: 17px;
          line-height: 1;
          cursor: pointer;
          border-radius: 6px;
        }
        .mpp-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .mpp-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 6px 10px;
        }
        .mpp-mark {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          object-fit: cover;
          display: block;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }
        .mpp-name {
          font-weight: 700;
          font-size: 13px;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .mpp-card {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 11px;
          padding: 12px 14px 0;
          overflow: hidden;
        }
        .mpp-copy {
          font-size: 12.5px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.64);
          line-height: 1.45;
          margin: 0 0 12px;
        }
        .mpp-copy strong {
          color: #fff;
          font-weight: 700;
        }
        .mpp-cta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 0 -14px;
          padding: 9px 14px;
          text-decoration: none;
          color: #17181a;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border-top: 3px solid rgba(0, 0, 0, 0.28);
          transition: filter 0.15s ease;
        }
        .mpp-cta:hover,
        .mpp-cta:focus-visible {
          filter: brightness(1.07);
        }
        .mpp-label {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0.8;
        }
        .mpp-title {
          font-size: 12.5px;
          font-weight: 800;
        }
        @media (prefers-reduced-motion: reduce) {
          .mpp {
            transition: opacity 0.2s ease;
            transform: none;
          }
          .mpp-show {
            transform: none;
          }
        }
      `}</style>
    </>
  );
}
