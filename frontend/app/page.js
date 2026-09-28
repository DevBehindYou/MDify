'use client';

// View for the converter screen. All state and commands come from
// useConverterScreenViewModel; this file only lays out views and binds them.

import React, { useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import MarkDifyHeader from '../components/MarkDifyHeader';
import MarkDifyFooter from '../components/MarkDifyFooter';
import MobileDock from '../components/MobileDock';
import LayoutToolbar from '../components/converter/LayoutToolbar';
import LandingWorkspace from '../components/converter/LandingWorkspace';
import ThreeColumnWorkspace from '../components/converter/ThreeColumnWorkspace';
import MobileWorkspace from '../components/converter/MobileWorkspace';
import OfflineBanner from '../components/converter/OfflineBanner';
import Toast from '../components/converter/Toast';
import { useConverterScreenViewModel } from '../viewmodels/useConverterScreenViewModel';
import { useMediaQuery } from '../viewmodels/useMediaQuery';
import { ACCEPT_ATTRIBUTE } from '../lib/formats';

// Overlays load on first open instead of shipping in the initial bundle.
const BlogModal = dynamic(() => import('../components/BlogModal'), { ssr: false });
const ApiModal = dynamic(() => import('../components/ApiModal'), { ssr: false });
const LegalModal = dynamic(() => import('../components/LegalModal'), { ssr: false });
const RecentSessionsSidebar = dynamic(() => import('../components/RecentSessionsSidebar'), { ssr: false });
const MobileMenu = dynamic(() => import('../components/converter/MobileMenu'), { ssr: false });

export default function Home() {
  const fileInputRef = useRef(null);
  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const vm = useConverterScreenViewModel({ openFilePicker });
  const { converter, exporter, recent, ui } = vm;

  // Null until hydrated. Both layouts render on the server (CSS picks one);
  // once the viewport is known, only the visible layout stays mounted, so the
  // Markdown viewer is never rendered twice.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isThreeColumn = ui.viewLayout === '1c' || (ui.viewLayout === 'auto' && converter.items.length > 0);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)] transition-colors relative">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            converter.addFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      <MarkDifyHeader
        activeTab="converter"
        serverStatus={vm.serverStatus}
        wakeCountdown={vm.wakeCountdown}
        onRetry={vm.recheck}
        theme={vm.theme}
        onToggleTheme={vm.toggleTheme}
        onOpenBlog={ui.openBlog}
        activeResult={converter.activeResult}
        onToggleRecentSidebar={ui.toggleSidebar}
        recentSessionsCount={recent.sessions.length}
        isRecentSidebarOpen={ui.sidebarOpen}
      />

      {vm.serverStatus === 'offline' && (
        <OfflineBanner queueCount={converter.items.length} onRetry={vm.recheck} />
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-5 flex flex-col">
        {isDesktop !== false && (
          <div className="hidden md:flex flex-col flex-1">
            <LayoutToolbar
              isThreeColumn={isThreeColumn}
              onSelectLayout={ui.setViewLayout}
              sidebarOpen={ui.sidebarOpen}
              onToggleSidebar={ui.toggleSidebar}
              recentCount={recent.sessions.length}
              queueCount={converter.items.length}
              resultCount={converter.results.length}
            />
            {isThreeColumn ? (
              <ThreeColumnWorkspace converter={converter} exporter={exporter} ui={ui} onBrowse={openFilePicker} />
            ) : (
              <LandingWorkspace
                theme={vm.theme}
                converter={converter}
                exporter={exporter}
                ui={ui}
                onBrowse={openFilePicker}
              />
            )}
          </div>
        )}

        {isDesktop !== true && (
          <MobileWorkspace converter={converter} exporter={exporter} ui={ui} onBrowse={openFilePicker} />
        )}
      </main>

      <MarkDifyFooter
        onOpenBlog={ui.openBlog}
        onOpenApi={ui.openApi}
        onOpenLegal={ui.openLegal}
        activeResult={converter.activeResult}
        totalConverted={converter.results.length}
        onDownloadMd={exporter.downloadActive}
        onCopyMd={exporter.copyActive}
        copied={exporter.copied}
        onDownloadZip={exporter.downloadAll}
        onToggleRecentSidebar={ui.toggleSidebar}
        recentSessionsCount={recent.sessions.length}
      />

      <MobileDock
        activeTab="convert"
        onSelectTab={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onToggleTheme={vm.toggleTheme}
        onOpenBlog={ui.openBlog}
        onOpenMenu={ui.openMenu}
      />

      {ui.menuOpen && (
        <MobileMenu
          theme={vm.theme}
          recentCount={recent.sessions.length}
          onClose={ui.closeMenu}
          onToggleTheme={vm.toggleTheme}
          onOpenSidebar={ui.openSidebar}
          onOpenBlog={ui.openBlog}
          onOpenApi={ui.openApi}
          onOpenLegal={ui.openLegal}
        />
      )}

      {ui.sidebarOpen && (
        <RecentSessionsSidebar
          isOpen
          onClose={ui.closeSidebar}
          sessions={recent.sessions}
          activeSessionId={recent.activeSessionId}
          onSelectSession={recent.selectSession}
          onDeleteSession={recent.deleteSession}
          onClearAllSessions={recent.clearSessions}
          onLoadSample={recent.loadSampleSession}
        />
      )}

      {ui.blogOpen && <BlogModal isOpen onClose={ui.closeBlog} />}
      {ui.apiOpen && <ApiModal isOpen onClose={ui.closeApi} />}
      {ui.legalModal && <LegalModal isOpen onClose={ui.closeLegal} initialTab={ui.legalModal} />}

      <Toast message={vm.toast} />
    </div>
  );
}
