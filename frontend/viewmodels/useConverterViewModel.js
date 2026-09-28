'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { convertFile } from '../lib/models/conversionService';
import {
  initialQueueState,
  planAddFiles,
  queueReducer,
  selectActiveResult,
  selectConvertible,
  selectConvertingItem,
} from '../lib/models/queueModel';
import { MAX_QUEUE_FILES } from '../lib/formats';

// Two requests in flight halves batch time without stacking many large
// parses on a single self-hosted Node process.
const CONCURRENCY = 2;

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function describeSkipped({ rejected, duplicates, overflow }) {
  const parts = [];
  if (rejected.length === 1) parts.push(`Skipped "${rejected[0].name}" — ${rejected[0].reason}`);
  if (rejected.length > 1) parts.push(`Skipped ${rejected.length} files — unsupported or too large`);
  if (duplicates) parts.push(`${duplicates} already in queue`);
  if (overflow) parts.push(`Queue limit is ${MAX_QUEUE_FILES} — ${overflow} not added`);
  return parts.join(' · ');
}

/**
 * ViewModel for the upload queue: owns queue/result state and every command
 * that changes it. Views receive plain values plus stable callbacks.
 *
 * @param {object} options
 * @param {(result: object, meta: { item: object, profile: string }) => void} [options.onConverted]
 * @param {() => void} [options.onNetworkFailure]
 * @param {(message: string) => void} [options.onNotice]
 */
export function useConverterViewModel({ onConverted, onNetworkFailure, onNotice } = {}) {
  const [state, dispatch] = useReducer(queueReducer, initialQueueState);
  const [profile, setProfile] = useState('Standard');
  const [isRunning, setRunning] = useState(false);

  // Latest values for async commands, so the commands themselves can stay
  // referentially stable and memoized views don't re-render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const callbacksRef = useRef({ onConverted, onNetworkFailure, onNotice });
  callbacksRef.current = { onConverted, onNetworkFailure, onNotice };

  const controllersRef = useRef(new Map());
  const cancelledRef = useRef(new Set());
  const runningRef = useRef(false);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => controllers.forEach((controller) => controller.abort());
  }, []);

  const addFiles = useCallback((fileList) => {
    const plan = planAddFiles(stateRef.current, Array.from(fileList), { makeId: uid });
    if (plan.accepted.length) dispatch({ type: 'itemsAdded', items: plan.accepted });
    const notice = describeSkipped(plan);
    if (notice) callbacksRef.current.onNotice?.(notice);
  }, []);

  const runJob = useCallback(async (item) => {
    if (controllersRef.current.has(item.id) || cancelledRef.current.has(item.id)) return;
    const controller = new AbortController();
    controllersRef.current.set(item.id, controller);
    const jobProfile = profileRef.current;
    dispatch({ type: 'jobStarted', id: item.id });

    try {
      const data = await convertFile(item.file, jobProfile, {
        signal: controller.signal,
        onProgress: (progress) => dispatch({ type: 'jobProgress', id: item.id, progress }),
      });
      if (controller.signal.aborted) return;
      dispatch({ type: 'jobSucceeded', id: item.id, result: data });
      callbacksRef.current.onConverted?.({ ...data, id: item.id }, { item, profile: jobProfile });
    } catch (err) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      dispatch({ type: 'jobFailed', id: item.id, message: err.message });
      if (err.network) callbacksRef.current.onNetworkFailure?.();
    } finally {
      controllersRef.current.delete(item.id);
    }
  }, []);

  const convertAll = useCallback(async () => {
    if (runningRef.current) return;
    const queue = selectConvertible(stateRef.current);
    if (!queue.length) return;

    runningRef.current = true;
    setRunning(true);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next];
        next += 1;
        await runJob(item);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [runJob]);

  const retry = useCallback(
    (id) => {
      const item = stateRef.current.items.find((i) => i.id === id);
      if (item?.file) runJob(item);
    },
    [runJob]
  );

  const cancel = useCallback((id) => {
    cancelledRef.current.add(id);
    controllersRef.current.get(id)?.abort();
  }, []);

  const removeFile = useCallback(
    (id) => {
      cancel(id);
      dispatch({ type: 'itemRemoved', id });
    },
    [cancel]
  );

  const clearAll = useCallback(() => {
    stateRef.current.items.forEach((item) => cancel(item.id));
    dispatch({ type: 'cleared' });
  }, [cancel]);

  const selectResult = useCallback((id) => dispatch({ type: 'resultSelected', id }), []);

  const updateContent = useCallback(
    (id, content) => dispatch({ type: 'contentUpdated', id, content }),
    []
  );

  const loadSession = useCallback((session) => dispatch({ type: 'sessionLoaded', session }), []);

  const derived = useMemo(() => {
    const convertingItem = selectConvertingItem(state);
    return {
      activeResult: selectActiveResult(state),
      hasConvertible: selectConvertible(state).length > 0,
      convertingName: convertingItem?.name || '',
      isBusy: isRunning || Boolean(convertingItem),
    };
  }, [state, isRunning]);

  return {
    items: state.items,
    results: state.results,
    activeResultId: derived.activeResult?.id ?? null,
    ...derived,
    profile,
    setProfile,
    addFiles,
    convertAll,
    retry,
    removeFile,
    clearAll,
    selectResult,
    updateContent,
    loadSession,
  };
}
