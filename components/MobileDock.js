'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MobileDock({
  activeTab = 'convert',
  onSelectTab,
  onToggleTheme,
  onOpenBlog,
  onOpenMenu,
}) {
  const router = useRouter();

  // Index mapping for lens position:
  // 0: Convert, 1: Why, 2: Blog, 3: Theme, 4: Menu
  const getIndex = () => {
    switch (activeTab) {
      case 'convert': return 0;
      case 'why': return 1;
      case 'blog': return 2;
      case 'theme': return 3;
      case 'menu': return 4;
      default: return 0;
    }
  };

  const activeIndex = getIndex();

  const handleItemClick = (type, index) => {
    if (type === 'convert') {
      if (onSelectTab) onSelectTab('convert');
    } else if (type === 'why') {
      router.push('/usecase');
    } else if (type === 'blog') {
      if (onOpenBlog) onOpenBlog();
    } else if (type === 'theme') {
      if (onToggleTheme) onToggleTheme();
    } else if (type === 'menu') {
      if (onOpenMenu) onOpenMenu();
    }
  };

  return (
    <div className="md:hidden fixed bottom-3 left-0 right-0 z-40 flex flex-col items-center pointer-events-none select-none">
      {/* 74px Dock Container (1g) */}
      <div className="pointer-events-auto relative w-[340px] max-w-[calc(100vw-28px)] h-[74px] rounded-[31px] border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] bg-[var(--surface)] p-[7px] grid grid-cols-5 items-center shadow-lg transition-all backdrop-blur-md">
        
        {/* Animated Lens */}
        <div
          className="absolute top-[7px] h-[58px] rounded-[23px] bg-[var(--lens-bg)] border-[1.5px] border-[var(--lens-border)] transition-all duration-300 ease-out pointer-events-none"
          style={{
            width: 'calc((100% - 14px) / 5)',
            left: `calc(7px + ${activeIndex} * ((100% - 14px) / 5))`,
          }}
        />

        {/* Item 1: Convert */}
        <button
          onClick={() => handleItemClick('convert', 0)}
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 h-full ${
            activeIndex === 0 ? 'text-[var(--text)] font-semibold' : 'text-[var(--muted)]'
          }`}
        >
          <span className="text-[19px] leading-none">▣</span>
          <span className="text-[9.5px] font-sans">Convert</span>
        </button>

        {/* Item 2: Why */}
        <button
          onClick={() => handleItemClick('why', 1)}
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 h-full ${
            activeIndex === 1 ? 'text-[var(--text)] font-semibold' : 'text-[var(--muted)]'
          }`}
        >
          <span className="text-[19px] leading-none">?</span>
          <span className="text-[9.5px] font-sans">Why</span>
        </button>

        {/* Item 3: Blog */}
        <button
          onClick={() => handleItemClick('blog', 2)}
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 h-full ${
            activeIndex === 2 ? 'text-[var(--text)] font-semibold' : 'text-[var(--muted)]'
          }`}
        >
          <span className="text-[19px] leading-none">▤</span>
          <span className="text-[9.5px] font-sans">Blog</span>
        </button>

        {/* Item 4: Theme */}
        <button
          onClick={() => handleItemClick('theme', 3)}
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 h-full ${
            activeIndex === 3 ? 'text-[var(--text)] font-semibold' : 'text-[var(--muted)]'
          }`}
        >
          <span className="text-[19px] leading-none">◐</span>
          <span className="text-[9.5px] font-sans">Theme</span>
        </button>

        {/* Item 5: Menu */}
        <button
          onClick={() => handleItemClick('menu', 4)}
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 h-full ${
            activeIndex === 4 ? 'text-[var(--text)] font-semibold' : 'text-[var(--muted)]'
          }`}
        >
          <span className="text-[19px] leading-none">≡</span>
          <span className="text-[9.5px] font-sans">Menu</span>
        </button>
      </div>

      {/* First-run hint pill */}
      <div className="mt-1.5 px-3 py-0.5 rounded-full border border-dashed border-[var(--border-3)] bg-[var(--surface-2)]/90 backdrop-blur-sm text-[8.5px] font-tech text-[var(--faint)]">
        first-run hint: tap tabs to navigate
      </div>
    </div>
  );
}
