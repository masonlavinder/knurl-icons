import { HISTORY_LIMIT } from '../constants.ts';
import type { IconDoc, Selection } from '../model/types.ts';
import type { MergeKey } from './types.ts';

/**
 * One undo step. Stores the state *before* its command ran, which is what makes
 * drag coalescing a single comparison: if the incoming command carries the same
 * merge key as the top entry, that entry already holds the correct pre-drag
 * state and nothing needs to be pushed.
 */
export type HistoryEntry = {
  doc: IconDoc;
  selection: Selection;
  label: string;
  mergeKey?: MergeKey;
};

export type History = {
  past: HistoryEntry[];
  future: HistoryEntry[];
  limit: number;
};

export const emptyHistory = (limit = HISTORY_LIMIT): History => ({
  past: [],
  future: [],
  limit,
});

/**
 * Snapshots rather than inverse patches.
 *
 * Under Immer a snapshot is nearly free: `produce` structurally shares every
 * unchanged element, so an entry costs one root object plus the objects that
 * actually changed. Patches would cost more (they need enablePatches() on every
 * produce, plus the stored patch arrays) and cascading deletes are exactly where
 * array-index patches go subtly wrong. Snapshots also carry the selection, which
 * lives outside the document but must come back on undo.
 */
export function pushEntry(h: History, e: HistoryEntry): History {
  const top = h.past[h.past.length - 1];
  if (e.mergeKey !== undefined && top?.mergeKey === e.mergeKey) {
    // Same continuous gesture: the existing entry is already the right anchor.
    return { ...h, future: [] };
  }
  const past = [...h.past, e];
  if (past.length > h.limit) past.splice(0, past.length - h.limit);
  return { ...h, past, future: [] };
}

/** Relabel the newest entry, e.g. when a drag commits and its extent is known. */
export function relabelTop(h: History, label: string): History {
  if (h.past.length === 0) return h;
  const past = [...h.past];
  const top = past[past.length - 1]!;
  past[past.length - 1] = { ...top, label };
  return { ...h, past };
}

/** Detach the newest entry's merge key so later gestures start a fresh step. */
export function sealTop(h: History): History {
  if (h.past.length === 0) return h;
  const past = [...h.past];
  const { mergeKey: _drop, ...rest } = past[past.length - 1]!;
  past[past.length - 1] = rest;
  return { ...h, past };
}

export type Transition = { history: History; restore: HistoryEntry };

export function undo(h: History, current: HistoryEntry): Transition | null {
  if (h.past.length === 0) return null;
  const past = [...h.past];
  const restore = past.pop()!;
  return { history: { ...h, past, future: [...h.future, current] }, restore };
}

export function redo(h: History, current: HistoryEntry): Transition | null {
  if (h.future.length === 0) return null;
  const future = [...h.future];
  const restore = future.pop()!;
  return { history: { ...h, past: [...h.past, current], future }, restore };
}

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;
