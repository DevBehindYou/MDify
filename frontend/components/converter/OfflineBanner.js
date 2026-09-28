'use client';

import React, { memo } from 'react';

function OfflineBanner({ queueCount, onRetry }) {
  return (
    <div className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-300 dark:border-rose-900/60 px-4 py-2 flex items-center justify-between text-[12.5px] font-sans">
      <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200">
        <span>✕</span>
        <span>
          Can’t reach the converter. Your {queueCount} file{queueCount !== 1 ? 's are' : ' is'} safe in the queue.
        </span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="border-[1.5px] border-rose-400 dark:border-rose-700 rounded-full px-3 py-0.5 text-rose-800 dark:text-rose-200 font-tech text-[11px] hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer bg-transparent"
      >
        Retry
      </button>
    </div>
  );
}

export default memo(OfflineBanner);
