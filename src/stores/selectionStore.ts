import { create } from 'zustand';

import {
  addrEq,
  addrsToKeySet,
  encodeAddr,
  normalizeSelection,
  type AddrKey,
} from '../core/model/address.ts';
import type { Address, Selection } from '../core/model/types.ts';

type SelectionState = {
  selection: Selection;
  /** Derived key set, so "is this selected?" is O(1) during render. */
  keys: Set<AddrKey>;
  hover: AddrKey | null;

  set: (sel: Selection) => void;
  select: (addr: Address) => void;
  toggle: (addr: Address) => void;
  add: (addrs: Address[]) => void;
  clear: () => void;
  setHover: (key: AddrKey | null) => void;
  isSelected: (addr: Address) => boolean;
};

/**
 * Selection lives outside the document: it is not undoable on its own, but each
 * history entry carries a snapshot of it so undo restores the working context.
 *
 * Kept in its own store because it changes at pointer rate and must not
 * re-render geometry or the element list.
 */
export const useSelectionStore = create<SelectionState>((set, get) => ({
  selection: { addrs: [] },
  keys: new Set(),
  hover: null,

  set: (sel) => {
    const normalized = normalizeSelection(sel);
    set({ selection: normalized, keys: addrsToKeySet(normalized.addrs) });
  },

  select: (addr) => get().set({ addrs: [addr], anchor: addr }),

  toggle: (addr) => {
    const { selection } = get();
    const has = selection.addrs.some((a) => addrEq(a, addr));
    const addrs = has
      ? selection.addrs.filter((a) => !addrEq(a, addr))
      : [...selection.addrs, addr];
    get().set({ addrs, anchor: addr });
  },

  add: (addrs) => {
    const { selection } = get();
    get().set({ addrs: [...selection.addrs, ...addrs] });
  },

  clear: () => set({ selection: { addrs: [] }, keys: new Set() }),

  setHover: (key) => {
    if (get().hover === key) return;
    set({ hover: key });
  },

  isSelected: (addr) => get().keys.has(encodeAddr(addr)),
}));
