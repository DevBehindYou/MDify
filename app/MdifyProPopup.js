'use client';

// Mini-Frame announcement (liquid glass) for MDify features.
// Bottom-left, appears after 5s. Reappears on every reload (dismissal is not
// persisted), so a page refresh shows it again.

import { useEffect, useState } from 'react';

const PRO_URL = 'https://mdify-app.onrender.com';

export default function MdifyProPopup() {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setShown(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => setShown(false);

  if (!mounted) return null;

  return (
    <div
      className={`fixed left-5 bottom-5 w-[300px] max-w-[calc(100vw-32px)] z-[99999] p-3 rounded-2xl isolate font-sans bg-[#16171a]/92 backdrop-blur-xl border border-white/15 shadow-2xl transition-all duration-400 ease-out ${
        shown
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      role="dialog"
      aria-label="MDify announcement"
    >
      <button
        className="absolute top-2 right-2 w-6 h-6 border-0 bg-transparent text-white/60 hover:text-white hover:bg-white/10 text-[17px] leading-none cursor-pointer rounded-md flex items-center justify-center transition-colors"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
      <div className="flex items-center gap-2 px-1.5 pt-1 pb-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="w-5 h-5 rounded-md object-cover block shadow-md"
          src="/mdify-icon.png"
          alt="MDify"
          width="20"
          height="20"
        />
        <span className="font-bold text-[13px] text-white tracking-tight">MDify</span>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 pt-3 overflow-hidden">
        <p className="text-[12.5px] font-medium text-white/65 leading-snug mb-3">
          <strong className="text-white font-bold">New MDify version is live.</strong> Faster conversion, RAG-ready profiles, batch export.
        </p>
        <a
          className="flex flex-col gap-0.5 -mx-3.5 px-3.5 py-2.5 text-inherit no-underline text-[#17181a] bg-gradient-to-br from-amber-400 to-amber-600 hover:brightness-105 border-t border-black/25 transition-all"
          href={PRO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="text-[9.5px] font-extrabold tracking-wider uppercase opacity-80">Try it now</span>
          <span className="text-[12.5px] font-extrabold text-[#17181a]">Open MDify →</span>
        </a>
      </div>
    </div>
  );
}
