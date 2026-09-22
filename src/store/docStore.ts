import { produce } from 'immer';
import { create } from 'zustand';

import {
  canRedo,
  canUndo,
  emptyHistory,
  pushEntry,
  redo as redoHistory,
  relabelTop,
  sealTop,
  undo as undoHistory,
  type History,
} from '../core/commands/history.ts';
import type { Command } from '../core/commands/types.ts';
import { CANVAS, PADDING, STROKE_WIDTH } from '../core/constants.ts';
import { makeId } from '../core/ids.ts';
import { addressExists, } from '../core/model/access.ts';
import { normalizeSelection } from '../core/model/address.ts';
import type { IconDoc, Selection } from '../core/model/types.ts';
import { useSelectionStore } from './selectionStore.ts';

export const emptyDoc = (name = 'untitled'): IconDoc => ({
  id: makeId('doc'),
  name,
  canvas: { size: CANVAS, padding: PADDING },
  strokeSpec: { width: STROKE_WIDTH, cap: 'round', join: 'round' },
  elements: [],
  meta: { contributors: [], tags: [], categories: [], useCases: [] },
});

type DocState = {
  doc: IconDoc;
  history: History;
  dispatch: (cmd: Command) => void;
  replace: (doc: IconDoc, label: string) => void;
  undo: () => void;
  redo: () => void;
  sealHistory: () => void;
  restore: (doc: IconDoc) => void;
  relabel: (label: string) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export const useDocStore = create<DocState>((set, get) => ({
  doc: emptyDoc(),
  history: emptyHistory(),

  dispatch: (cmd) => {
    const { doc, history } = get();
    const selection = useSelectionStore.getState().selection;

    const next = produce(doc, cmd.mutate);
    // Immer returns the same reference when nothing changed, which is a free
    // and exact no-op check -- no need to diff.
    if (next === doc) return;

    const entry = {
      doc,
      selection,
      label: cmd.label,
      ...(cmd.mergeKey !== undefined ? { mergeKey: cmd.mergeKey } : {}),
    };

    set({ doc: next, history: pushEntry(history, entry) });

    const after = cmd.selectionAfter
      ? cmd.selectionAfter(next, selection)
      : repairSelection(next, selection);
    useSelectionStore.getState().set(after);
  },

  replace: (doc, label) => {
    const prev = get();
    const selection = useSelectionStore.getState().selection;
    set({
      doc,
      history: pushEntry(prev.history, { doc: prev.doc, selection, label }),
    });
    useSelectionStore.getState().clear();
  },

  undo: () => {
    const { doc, history } = get();
    const selection = useSelectionStore.getState().selection;
    const step = undoHistory(history, { doc, selection, label: 'current' });
    if (!step) return;
    set({ doc: step.restore.doc, history: step.history });
    useSelectionStore.getState().set(repairSelection(step.restore.doc, step.restore.selection));
  },

  redo: () => {
    const { doc, history } = get();
    const selection = useSelectionStore.getState().selection;
    const step = redoHistory(history, { doc, selection, label: 'current' });
    if (!step) return;
    set({ doc: step.restore.doc, history: step.history });
    useSelectionStore.getState().set(repairSelection(step.restore.doc, step.restore.selection));
  },

  sealHistory: () => set({ history: sealTop(get().history) }),

  /**
   * Put a document back without touching history. Used to cancel a drag: the
   * gesture's own entry is still the one on top, so restoring the pre-drag
   * document leaves history exactly as it was before the gesture began.
   */
  restore: (doc) => {
    const { history } = get();
    const past = [...history.past];
    if (past.length > 0 && past[past.length - 1]?.mergeKey !== undefined) past.pop();
    set({ doc, history: { ...history, past } });
  },

  relabel: (label) => set({ history: relabelTop(get().history, label) }),
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
}));

/**
 * Drop selection entries whose geometry no longer exists.
 *
 * Without this a stale address survives a delete and the next Del keystroke
 * silently does nothing -- a direct M0 gate failure.
 */
export function repairSelection(doc: IconDoc, sel: Selection): Selection {
  const addrs = sel.addrs.filter((a) => addressExists(doc, a));
  if (addrs.length === sel.addrs.length) return sel;
  return normalizeSelection({ addrs });
}
