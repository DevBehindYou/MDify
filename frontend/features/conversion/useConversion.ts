'use client';

// ViewModel for the conversion workflow. Owns the file queue, results, and the
// per-file state machine, and exposes intent-level actions to the View. All
// network access is delegated to the API client (the Model), never inline.

import { useCallback, useMemo, useRef, useState } from 'react';

import { convertFile } from '@/lib/api/client';
import { ApiError } from '@/lib/errors';
import { DEFAULT_PROFILE, MAX_FILES, MAX_PARALLEL_CONVERSIONS, uid } from '@/lib/config';
import type { FileItem, ProfileId, ResultItem } from '@/types';

export interface ConversionVM {
  files: FileItem[];
  results: ResultItem[];
  activeIndex: number;
  converting: boolean;
  // derived
  pendingCount: number;
  doneCount: number;
  isFull: boolean;
  anyConverting: boolean;
  currentResult: ResultItem | undefined;
  profile: ProfileId;
  // actions
  setProfile: (p: ProfileId) => void;
  addFiles: (incoming: FileList | File[]) => void;
  convertOne: (item: FileItem) => Promise<void>;
  convertAll: () => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  setActiveIndex: (i: number) => void;
  downloadResult: (result: ResultItem) => void;
  downloadAll: () => void;
  downloadZip: () => Promise<void>;
  copyResult: (result: ResultItem) => Promise<void>;
}

export function useConversion(): ConversionVM {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [converting, setConverting] = useState(false);
  const [profile, setProfileState] = useState<ProfileId>(DEFAULT_PROFILE);

  // Guards against double-converting the same file across rapid clicks.
  const inFlight = useRef<Set<string>>(new Set());
  // Guards convertAll itself; two rapid "Convert all" clicks must not create
  // overlapping pools that compete for the same pending items.
  const batchInFlight = useRef(false);
  // Ref keeps convertOne/convertAll callbacks stable while reading live profile.
  const profileRef = useRef<ProfileId>(DEFAULT_PROFILE);
  const setProfile = useCallback((p: ProfileId) => {
    profileRef.current = p;
    setProfileState(p);
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.file.name));
      const slots = MAX_FILES - prev.length;
      const toAdd = arr
        .filter((f) => !existing.has(f.name))
        .slice(0, slots)
        .map<FileItem>((f) => ({ id: uid(), file: f, status: 'pending' }));
      return [...prev, ...toAdd];
    });
  }, []);

  const patch = useCallback((id: string, next: Partial<FileItem>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...next } : f)));
  }, []);

  const convertOne = useCallback(
    async (item: FileItem) => {
      if (inFlight.current.has(item.id)) return;
      inFlight.current.add(item.id);
      patch(item.id, { status: 'converting', errorMsg: undefined });

      try {
        const result = await convertFile(item.file, profileRef.current);
        patch(item.id, { status: 'done' });
        setResults((prev) => {
          const entry: ResultItem = { ...result, id: item.id };
          const idx = prev.findIndex((r) => r.id === item.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = entry;
            return updated;
          }
          const nextResults = [...prev, entry];
          setActiveIndex(nextResults.length - 1);
          return nextResults;
        });
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Conversion failed.';
        patch(item.id, { status: 'error', errorMsg: msg });
      } finally {
        inFlight.current.delete(item.id);
      }
    },
    [patch],
  );

  // Use a small bounded client-side worker pool. This gives users real
  // parallel conversion while the backend independently enforces its own
  // per-process concurrency cap.
  const convertAll = useCallback(async () => {
    if (batchInFlight.current) return;
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    batchInFlight.current = true;
    setConverting(true);
    try {
      for (let i = 0; i < pending.length; i += MAX_PARALLEL_CONVERSIONS) {
        const batch = pending.slice(i, i + MAX_PARALLEL_CONVERSIONS);
        await Promise.all(batch.map((item) => convertOne(item)));
      }
    } finally {
      batchInFlight.current = false;
      setConverting(false);
    }
  }, [files, convertOne]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setResults((prev) => {
      const next = prev.filter((r) => r.id !== id);
      setActiveIndex((cur) => Math.min(cur, Math.max(0, next.length - 1)));
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setResults([]);
    setActiveIndex(0);
    inFlight.current.clear();
  }, []);

  const downloadResult = useCallback((result: ResultItem) => {
    const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const downloadAll = useCallback(() => {
    results.forEach((r, i) => setTimeout(() => downloadResult(r), i * 120));
  }, [results, downloadResult]);

  // Bundle all results into one .zip (JSZip loaded on demand — off the main
  // bundle). Deduplicates filename collisions with a numeric suffix.
  const downloadZip = useCallback(async () => {
    if (results.length === 0) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const used = new Map<string, number>();
    for (const r of results) {
      let name = r.filename;
      const n = used.get(name) ?? 0;
      used.set(name, n + 1);
      if (n > 0) name = name.replace(/(\.md)?$/i, `-${n}.md`);
      zip.file(name, r.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mdify-pro-export.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [results]);

  const copyResult = useCallback(async (result: ResultItem) => {
    await navigator.clipboard.writeText(result.content);
  }, []);

  const pendingCount = useMemo(
    () => files.filter((f) => f.status === 'pending').length,
    [files],
  );
  const doneCount = useMemo(
    () => files.filter((f) => f.status === 'done').length,
    [files],
  );
  const anyConverting = useMemo(
    () => files.some((f) => f.status === 'converting'),
    [files],
  );

  return {
    files,
    results,
    activeIndex,
    converting,
    pendingCount,
    doneCount,
    isFull: files.length >= MAX_FILES,
    anyConverting,
    currentResult: results[activeIndex],
    profile,
    setProfile,
    addFiles,
    convertOne,
    convertAll,
    removeFile,
    clearAll,
    setActiveIndex,
    downloadResult,
    downloadAll,
    downloadZip,
    copyResult,
  };
}
