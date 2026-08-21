'use client';

// The View. Deliberately thin: it wires the two ViewModels (conversion +
// server health) to the presentational panels. No business logic or fetch
// calls live here — that's what keeps the MVVM boundaries clean.

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { OutputPanel } from '@/components/preview/OutputPanel';
import { UploadPanel } from '@/components/upload/UploadPanel';
import { useConversion } from '@/features/conversion/useConversion';
import { useServerHealth } from '@/features/conversion/useServerHealth';

export default function Home() {
  const vm = useConversion();
  const health = useServerHealth();

  return (
    <div className="h-screen flex flex-col overflow-hidden t-text">
      <Header
        fileCount={vm.files.length}
        serverStatus={health.status}
        countdown={health.countdown}
        onRetry={health.retry}
      />

      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden gap-3 p-3">
        <UploadPanel vm={vm} />
        <OutputPanel vm={vm} />
      </main>

      <Footer doneCount={vm.doneCount} />
    </div>
  );
}
