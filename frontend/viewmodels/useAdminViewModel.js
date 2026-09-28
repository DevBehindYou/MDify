'use client';

// View models for /mdify-controller. Components render state from these hooks
// and call their actions; all data comes from lib/models/adminApi.js.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, downloadFile, downloadZip, previewText } from '../lib/models/adminApi';
import { buildContentTree } from '../lib/models/contentTree';

// ── Session ────────────────────────────────────────────────────────────────

export function useAdminSessionViewModel() {
  const [state, setState] = useState('loading'); // loading | unconfigured | signed-out | signed-in
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    adminApi
      .session()
      .then((s) => {
        if (!alive) return;
        if (!s.configured) setState('unconfigured');
        else if (s.authenticated) {
          setExpiresAt(s.expires_at);
          setState('signed-in');
        } else setState('signed-out');
      })
      .catch(() => alive && setState('signed-out'));
    return () => {
      alive = false;
    };
  }, []);

  // Sign out on the client when the session runs out.
  useEffect(() => {
    if (state !== 'signed-in' || !expiresAt) return undefined;
    const t = setTimeout(() => {
      setState('signed-out');
      setError('Your session ended. Sign in again.');
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [state, expiresAt]);

  const login = useCallback(async (key1, key2) => {
    setBusy(true);
    setError(null);
    try {
      const s = await adminApi.login(key1, key2);
      setExpiresAt(s.expires_at);
      setState('signed-in');
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await adminApi.logout().catch(() => {});
    setState('signed-out');
    setExpiresAt(null);
  }, []);

  /** Any 401 from the API ends the session in the UI. */
  const handleError = useCallback((err) => {
    if (err?.status === 401) {
      setState('signed-out');
      setError('Your session ended. Sign in again.');
      return true;
    }
    return false;
  }, []);

  return { state, expiresAt, error, busy, login, logout, handleError };
}

// ── Generic list / resource ────────────────────────────────────────────────

/**
 * `load(cursor)` → { items, next }. Keeps pages, loading and error state.
 * `deps` reset the list (filters).
 */
export function usePagedList(load, deps, { handleError, enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (cursor, append) => {
      const gen = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const page = await load(cursor);
        if (gen !== generation.current) return;
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        setNext(page.next);
      } catch (err) {
        if (gen !== generation.current) return;
        if (!handleError?.(err)) setError(err.message);
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    if (enabled) fetchPage(null, false);
  }, [fetchPage, enabled]);

  return {
    items,
    next,
    loading,
    error,
    reload: () => fetchPage(null, false),
    loadMore: () => next && fetchPage(next, true),
  };
}

export function useAdminResource(load, { handleError, enabled = true, refreshMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (err) {
      if (!handleError?.(err)) setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    if (!refreshMs) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, refreshMs);
    return () => clearInterval(t);
  }, [enabled, refreshMs, reload]);

  return { data, loading, error, reload };
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export const EXTEND_OPTIONS = [
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
];

const CONFIRM = {
  DELETE_NOW: 'Delete the stored files of the selected job(s) now? This cannot be undone.',
  DELETE_JOB: 'Delete the files AND the job record(s)? Only the audit entry stays. This cannot be undone.',
};

export function useAdminJobsViewModel({ handleError, notify }) {
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [openJobId, setOpenJobId] = useState(null);
  const [working, setWorking] = useState(null); // label of the running action

  const list = usePagedList(
    async (cursor) => {
      const page = await adminApi.jobs({ status, source, limit: 50, before: cursor?.before, before_id: cursor?.before_id });
      return { items: page.jobs, next: page.next };
    },
    [status, source],
    { handleError }
  );

  useEffect(() => setSelected(new Set()), [status, source]);

  const toggle = useCallback((jobId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const allSelected = list.items.length > 0 && list.items.every((j) => selected.has(j.job_id));
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(list.items.map((j) => j.job_id)));
  }, [allSelected, list.items]);

  const runBulk = useCallback(
    async (action, hours) => {
      const ids = [...selected];
      if (!ids.length) return;
      if (CONFIRM[action] && !window.confirm(CONFIRM[action])) return;
      setWorking(action);
      try {
        const { results } = await adminApi.bulk(ids, action, hours);
        const failed = results.filter((r) => !r.ok);
        notify(failed.length ? `${results.length - failed.length} done, ${failed.length} failed: ${failed[0].error}` : `${results.length} job(s) updated`, failed.length ? 'error' : 'ok');
        setSelected(new Set());
        list.reload();
      } catch (err) {
        if (!handleError(err)) notify(err.message, 'error');
      } finally {
        setWorking(null);
      }
    },
    [selected, notify, handleError, list]
  );

  const closeJob = useCallback(() => setOpenJobId(null), []);

  const zipSelected = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setWorking('ZIP');
    try {
      const items = [];
      for (const id of ids) {
        const detail = await adminApi.job(id);
        for (const f of detail.files) {
          if (f.kind === 'OUTPUT' && f.storage_status === 'ACTIVE') {
            items.push({ jobId: id, fileId: f.file_id, name: `${id.slice(0, 8)}/${f.object_path.split('/').pop()}` });
          }
        }
      }
      if (!items.length) {
        notify('The selected jobs have no stored results', 'error');
        return;
      }
      const { files } = await downloadZip(items, { zipName: `mdify-results-${ids.length}-jobs.zip` });
      notify(`ZIP with ${files} file(s) downloaded`, 'ok');
    } catch (err) {
      if (!handleError(err)) notify(err.message, 'error');
    } finally {
      setWorking(null);
    }
  }, [selected, notify, handleError]);

  return {
    ...list,
    status,
    setStatus,
    source,
    setSource,
    selected,
    toggle,
    toggleAll,
    clearSelection: () => setSelected(new Set()),
    allSelected,
    runBulk,
    zipSelected,
    working,
    openJobId,
    openJob: setOpenJobId,
    closeJob,
  };
}

export function useAdminJobDetailViewModel(jobId, { handleError, notify, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null); // { name, text, truncated } | { name, loading }
  const [working, setWorking] = useState(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await adminApi.job(jobId));
    } catch (err) {
      if (!handleError(err)) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, handleError]);

  useEffect(() => {
    setDetail(null);
    setPreview(null);
    load();
  }, [load]);

  const tree = useMemo(() => (detail ? buildContentTree(detail.nodes, detail.job) : null), [detail]);

  const act = useCallback(
    async (action, hours) => {
      if (CONFIRM[action] && !window.confirm(CONFIRM[action])) return;
      setWorking(action);
      try {
        const r = await adminApi.action(jobId, action, hours);
        notify(`Done: ${String(r.result).replace(/_/g, ' ')}`, 'ok');
        onChanged?.();
        if (action === 'DELETE_JOB') return;
        await load();
      } catch (err) {
        if (!handleError(err)) notify(err.message, 'error');
      } finally {
        setWorking(null);
      }
    },
    [jobId, notify, handleError, onChanged, load]
  );

  const showPreview = useCallback(
    async (file) => {
      const name = file.object_path.split('/').pop();
      setPreview({ name, loading: true });
      try {
        setPreview({ name, ...(await previewText(jobId, file.file_id)) });
      } catch (err) {
        if (!handleError(err)) setPreview({ name, error: err.message });
      }
    },
    [jobId, handleError]
  );

  const download = useCallback(
    async (file) => {
      try {
        await downloadFile(jobId, file.file_id);
      } catch (err) {
        if (!handleError(err)) notify(err.message, 'error');
      }
    },
    [jobId, handleError, notify]
  );

  const downloadAll = useCallback(async () => {
    const files = (detail?.files || []).filter((f) => f.storage_status === 'ACTIVE');
    setWorking('ZIP');
    try {
      await downloadZip(
        files.map((f) => ({ jobId, fileId: f.file_id, name: `${f.kind.toLowerCase()}/${f.object_path.split('/').pop()}` })),
        { zipName: `mdify-job-${jobId.slice(0, 8)}.zip` }
      );
    } catch (err) {
      if (!handleError(err)) notify(err.message, 'error');
    } finally {
      setWorking(null);
    }
  }, [detail, jobId, handleError, notify]);

  return { detail, tree, loading, error, reload: load, act, working, preview, showPreview, closePreview: () => setPreview(null), download, downloadAll };
}

// ── Toasts ─────────────────────────────────────────────────────────────────

export function useAdminNotice() {
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);
  const notify = useCallback((text, tone = 'ok') => {
    clearTimeout(timer.current);
    setNotice({ text, tone });
    timer.current = setTimeout(() => setNotice(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { notice, notify, dismiss: () => setNotice(null) };
}
