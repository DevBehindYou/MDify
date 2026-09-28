'use client';

import { useCallback, useRef, useState } from 'react';
import { generateSampleSession } from '../lib/models/sessionRepository';
import { useThemeViewModel } from './useThemeViewModel';
import { useServerStatusViewModel } from './useServerStatusViewModel';
import { useToastViewModel } from './useToastViewModel';
import { useRecentSessionsViewModel } from './useRecentSessionsViewModel';
import { useConverterViewModel } from './useConverterViewModel';
import { useExportViewModel } from './useExportViewModel';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useConsentViewModel } from './useConsentViewModel';

/**
 * ViewModel for the converter screen (app/page.js). Composes the feature
 * ViewModels, wires them to each other, and owns screen-only UI state.
 *
 * @param {object} options
 * @param {() => void} options.openFilePicker  View-provided command that opens
 *   the hidden file input; the ViewModel never touches the DOM itself.
 */
export function useConverterScreenViewModel({ openFilePicker }) {
  const { theme, toggleTheme } = useThemeViewModel();
  const { serverStatus, wakeCountdown, recheck } = useServerStatusViewModel();
  const { toast, showToast } = useToastViewModel();
  const recent = useRecentSessionsViewModel();
  const { saveSession, setActiveSessionId, deleteSession: removeSession, clearSessions: wipeSessions } =
    recent;

  const handleConverted = useCallback(
    (result, { item, profile }) => {
      saveSession({
        id: result.id,
        filename: result.filename || `${item.name}.md`,
        original_name: result.original_name || item.name,
        content: result.content,
        tokens_est: result.tokens_est,
        quality_score: result.quality_score,
        profile,
        fileSize: item.size,
      });
    },
    [saveSession]
  );

  const converter = useConverterViewModel({
    onConverted: handleConverted,
    onNetworkFailure: recheck,
    onNotice: showToast,
  });
  const exporter = useExportViewModel({
    activeResult: converter.activeResult,
    results: converter.results,
    onNotice: showToast,
  });
  const { loadSession } = converter;

  // ── Consent gate: files leave the browser only after the visitor accepts
  // the Terms and Privacy Policy (ConsentBanner in app/layout.js).
  const { accepted: consentAccepted } = useConsentViewModel();
  const consentRef = useRef(consentAccepted);
  consentRef.current = consentAccepted;
  const requireConsent = useCallback(() => {
    if (consentRef.current) return true;
    showToast('Accept the Terms and Privacy Policy to convert files');
    return false;
  }, [showToast]);

  const { convertAll: runConvertAll, retry: runRetry } = converter;
  const convertAll = useCallback(() => {
    if (requireConsent()) runConvertAll();
  }, [requireConsent, runConvertAll]);
  const retry = useCallback(
    (id) => {
      if (requireConsent()) runRetry(id);
    },
    [requireConsent, runRetry]
  );

  // ── Screen UI state
  const [previewMode, setPreviewMode] = useState('split'); // 'split' | 'rendered' | 'raw'
  const [viewLayout, setViewLayout] = useState('auto'); // 'auto' | '1a' | '1c'
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blogOpen, setBlogOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // 'privacy' | 'terms' | null

  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;

  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const openBlog = useCallback(() => setBlogOpen(true), []);
  const closeBlog = useCallback(() => setBlogOpen(false), []);
  const openApi = useCallback(() => setApiOpen(true), []);
  const closeApi = useCallback(() => setApiOpen(false), []);
  const openLegal = useCallback((tab) => setLegalModal(tab), []);
  const closeLegal = useCallback(() => setLegalModal(null), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleSheet = useCallback(() => setSheetExpanded((expanded) => !expanded), []);

  // ── Recent sessions
  const selectSession = useCallback(
    (session) => {
      setActiveSessionId(session.id);
      loadSession(session);
      showToast(`Loaded "${session.original_name}" from recent sessions`);
    },
    [setActiveSessionId, loadSession, showToast]
  );

  const deleteSession = useCallback(
    (sessionId) => {
      removeSession(sessionId);
      showToast('Removed from recent sessions');
    },
    [removeSession, showToast]
  );

  const clearSessions = useCallback(() => {
    wipeSessions();
    showToast('Recent session history cleared');
  }, [wipeSessions, showToast]);

  const loadSampleSession = useCallback(() => {
    const sample = generateSampleSession();
    saveSession(sample);
    selectSession(sample);
  }, [saveSession, selectSession]);

  // ── Keyboard shortcuts (Cmd/Ctrl + O, Enter, Shift+C, B)
  useKeyboardShortcuts({
    o: () => {
      openFilePicker();
      showToast('File picker opened (⌘O)');
    },
    enter: () => {
      if (converter.hasConvertible) {
        if (!requireConsent()) return;
        showToast('Starting conversion (⌘↵)');
        runConvertAll();
      } else if (converter.items.length === 0) {
        openFilePicker();
        showToast('Queue is empty. Select files first (⌘O)');
      } else {
        showToast('All files already converted (100%)');
      }
    },
    'shift+c': async () => {
      if (!converter.activeResult?.content) {
        showToast('No converted Markdown to copy yet');
        return;
      }
      if (await exporter.copyActive()) showToast('Markdown copied to clipboard! (⌘⇧C)');
    },
    b: () => {
      const next = !sidebarOpenRef.current;
      setSidebarOpen(next);
      showToast(next ? 'Recent sidebar opened (⌘B)' : 'Recent sidebar closed');
    },
  });

  return {
    theme,
    toggleTheme,
    serverStatus,
    wakeCountdown,
    recheck,
    toast,
    converter: { ...converter, convertAll, retry },
    exporter,
    recent: {
      sessions: recent.sessions,
      activeSessionId: recent.activeSessionId,
      selectSession,
      deleteSession,
      clearSessions,
      loadSampleSession,
    },
    ui: {
      previewMode,
      setPreviewMode,
      viewLayout,
      setViewLayout,
      sheetExpanded,
      toggleSheet,
      sidebarOpen,
      toggleSidebar,
      openSidebar,
      closeSidebar,
      menuOpen,
      openMenu,
      closeMenu,
      blogOpen,
      openBlog,
      closeBlog,
      apiOpen,
      openApi,
      closeApi,
      legalModal,
      openLegal,
      closeLegal,
    },
  };
}
