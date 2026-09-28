// Pure state model for the conversion queue and its results. No React, DOM,
// or network access: the converter ViewModel feeds it actions, and the unit
// tests drive it directly.

import { MAX_QUEUE_FILES, validateUpload } from '../formats.js';

/**
 * @typedef {'pending'|'converting'|'done'|'error'} ItemStatus
 * @typedef {{ id: string, name: string, size: number, file: File|null,
 *   status: ItemStatus, progress: number, errorMsg: string|null }} QueueItem
 * @typedef {{ id: string, filename: string, original_name: string,
 *   content: string, tokens_est?: number, quality_score?: number }} ConversionResult
 */

export const initialQueueState = {
  /** @type {QueueItem[]} */
  items: [],
  /** @type {ConversionResult[]} */
  results: [],
  /** @type {string|null} */
  activeResultId: null,
};

/**
 * Decides which of the incoming files join the queue. Kept separate from the
 * reducer so the caller can report what was skipped.
 */
export function planAddFiles(state, files, { makeId, max = MAX_QUEUE_FILES }) {
  const taken = new Set(state.items.map((item) => item.name));
  const accepted = [];
  const rejected = [];
  let duplicates = 0;
  let overflow = 0;

  for (const file of files) {
    if (taken.has(file.name)) {
      duplicates += 1;
      continue;
    }
    const reason = validateUpload(file);
    if (reason) {
      rejected.push({ name: file.name, reason });
      continue;
    }
    if (state.items.length + accepted.length >= max) {
      overflow += 1;
      continue;
    }
    taken.add(file.name);
    accepted.push({
      id: makeId(),
      name: file.name,
      size: file.size,
      file,
      status: 'pending',
      progress: 0,
      errorMsg: null,
    });
  }

  return { accepted, rejected, duplicates, overflow };
}

function patchItem(state, id, patch) {
  let found = false;
  const items = state.items.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return { ...item, ...patch };
  });
  return found ? { ...state, items } : state;
}

function upsertResult(results, entry) {
  const idx = results.findIndex((r) => r.id === entry.id);
  if (idx < 0) return { results: [...results, entry], isNew: true };
  const next = [...results];
  next[idx] = entry;
  return { results: next, isNew: false };
}

export function queueReducer(state, action) {
  switch (action.type) {
    case 'itemsAdded': {
      const room = MAX_QUEUE_FILES - state.items.length;
      if (room <= 0 || action.items.length === 0) return state;
      return { ...state, items: [...state.items, ...action.items.slice(0, room)] };
    }

    case 'jobStarted':
      return patchItem(state, action.id, { status: 'converting', progress: 5, errorMsg: null });

    case 'jobProgress': {
      // Only forward, and only while the item is still converting.
      const item = state.items.find((i) => i.id === action.id);
      if (!item || item.status !== 'converting' || action.progress <= item.progress) return state;
      return patchItem(state, action.id, { progress: Math.min(99, Math.round(action.progress)) });
    }

    case 'jobSucceeded': {
      // The file may have been removed while its request was in flight.
      if (!state.items.some((item) => item.id === action.id)) return state;
      const withItem = patchItem(state, action.id, { status: 'done', progress: 100 });
      const { results, isNew } = upsertResult(withItem.results, { ...action.result, id: action.id });
      return {
        ...withItem,
        results,
        activeResultId: isNew ? action.id : withItem.activeResultId,
      };
    }

    case 'jobFailed':
      return patchItem(state, action.id, { status: 'error', progress: 0, errorMsg: action.message });

    case 'itemRemoved': {
      const removedIdx = state.results.findIndex((r) => r.id === action.id);
      const items = state.items.filter((item) => item.id !== action.id);
      const results = state.results.filter((r) => r.id !== action.id);
      let { activeResultId } = state;
      if (activeResultId === action.id) {
        // Select the result that slides into the removed slot, else the last.
        const fallback = results[Math.min(Math.max(removedIdx, 0), results.length - 1)];
        activeResultId = fallback ? fallback.id : null;
      }
      return { items, results, activeResultId };
    }

    case 'cleared':
      return initialQueueState;

    case 'resultSelected':
      if (!state.results.some((r) => r.id === action.id)) return state;
      return { ...state, activeResultId: action.id };

    case 'contentUpdated': {
      let changed = false;
      const results = state.results.map((r) => {
        if (r.id !== action.id || r.content === action.content) return r;
        changed = true;
        return { ...r, content: action.content };
      });
      return changed ? { ...state, results } : state;
    }

    case 'sessionLoaded': {
      const { session } = action;
      if (state.results.some((r) => r.id === session.id)) {
        return { ...state, activeResultId: session.id };
      }
      const result = {
        id: session.id,
        filename: session.filename,
        original_name: session.original_name,
        content: session.content,
        tokens_est: session.tokens_est,
        quality_score: session.quality_score,
      };
      // Mirror the restored result in the queue so the rail lists it.
      const items = state.items.some((item) => item.id === session.id)
        ? state.items
        : [
            ...state.items,
            {
              id: session.id,
              name: session.original_name,
              size: session.fileSize || session.content.length,
              file: null,
              status: 'done',
              progress: 100,
              errorMsg: null,
            },
          ];
      return { items, results: [...state.results, result], activeResultId: session.id };
    }

    default:
      return state;
  }
}

// ── Selectors ────────────────────────────────────────────────────────────────

export function selectActiveResult(state) {
  return state.results.find((r) => r.id === state.activeResultId) || state.results[0] || null;
}

/** Items that "Convert all" should (re)process. Restored sessions have no file. */
export function selectConvertible(state) {
  return state.items.filter(
    (item) => item.file && (item.status === 'pending' || item.status === 'error')
  );
}

export function selectConvertingItem(state) {
  return state.items.find((item) => item.status === 'converting') || null;
}
