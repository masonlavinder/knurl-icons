import { useEffect } from 'react';

import { centerSelection } from '../../core/commands/ops/centerSelection.ts';
import { moveGeometry } from '../../core/commands/ops/moveGeometry.ts';
import { deleteAddresses } from '../../core/commands/ops/deleteAddresses.ts';
import { encodeAddr } from '../../core/model/address.ts';
import type { Address } from '../../core/model/types.ts';
import { useDocStore } from '../../store/docStore.ts';
import { useSelectionStore } from '../../store/selectionStore.ts';
import { useViewStore } from '../../store/viewStore.ts';

/**
 * Keyboard control. Half of M0's gate is being able to select and delete by
 * keyboard alone, at any zoom -- so element traversal lives here too, and is
 * zoom-independent by construction.
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      // Never steal keys from a text field.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;

      const doc = useDocStore.getState();
      const sel = useSelectionStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.selection.addrs.length === 0) return;
        e.preventDefault();
        // Alt+Del splits the subpath at the node instead of rejoining it.
        doc.dispatch(deleteAddresses(sel.selection.addrs, e.altKey ? 'split' : 'rejoin'));
        return;
      }

      if (e.key === 'Escape') {
        sel.clear();
        return;
      }

      // Only hijack Tab when focus is not inside the panels. Swallowing it
      // everywhere would trap keyboard users: they could never reach the
      // numeric fields or the buttons that sit beside them.
      if (e.key === 'Tab') {
        const inPanel = target?.closest('.panel') != null;
        if (inPanel) return;
        e.preventDefault();
        cycleElements(e.shiftKey ? -1 : 1);
        return;
      }

      // Centre whatever is selected on the canvas (the whole icon if nothing is).
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        doc.dispatch(centerSelection(doc.doc, sel.selection.addrs));
        return;
      }

      if (e.key.toLowerCase() === 'a' && mod) {
        e.preventDefault();
        sel.set({ addrs: doc.doc.elements.map((el) => ({ el: el.id })) });
        return;
      }

      // Nudge on the half grid, matching what dragging snaps to -- an arrow key
      // that moved by a different quantum than the mouse would put coordinates
      // off the grid one keystroke at a time. Shift steps a whole unit.
      // Repeats share a merge key, so holding a key is one undo step.
      const NUDGE: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = NUDGE[e.key];
      if (dir) {
        if (sel.selection.addrs.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.5;
        doc.dispatch(
          moveGeometry(
            doc.doc,
            sel.selection.addrs,
            { x: dir[0] * step, y: dir[1] * step },
            `nudge:${e.key}`,
            'Nudge',
          ),
        );
        return;
      }

      if (!mod && e.key === 'g') useViewStore.getState().toggleGrid();
      if (!mod && e.key === 'k') useViewStore.getState().toggleKeylines();
      if (!mod && e.key === '0') useViewStore.getState().reset();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function cycleElements(step: number): void {
  const { doc } = useDocStore.getState();
  const sel = useSelectionStore.getState();
  if (doc.elements.length === 0) return;

  const current = sel.selection.addrs[0];
  const idx = current ? doc.elements.findIndex((e) => e.id === current.el) : -1;
  const next = (idx + step + doc.elements.length * 2) % doc.elements.length;
  const el = doc.elements[next];
  if (!el) return;

  const addr: Address = { el: el.id };
  sel.select(addr);
  // Without this, keyboard selection at high zoom picks something off-screen.
  ensureVisible(encodeAddr(addr));
}

/** Bring a freshly selected element into view when it falls outside the viewBox. */
function ensureVisible(key: string): void {
  const node = document.querySelector(`[data-addr="${CSS.escape(key)}"]`);
  if (!(node instanceof SVGGraphicsElement)) return;

  const view = useViewStore.getState();
  const box = node.getBBox();
  const vb = view.viewBox;

  const inside =
    box.x >= vb.x &&
    box.y >= vb.y &&
    box.x + box.width <= vb.x + vb.w &&
    box.y + box.height <= vb.y + vb.h;
  if (inside) return;

  view.setViewBox({
    ...vb,
    x: box.x + box.width / 2 - vb.w / 2,
    y: box.y + box.height / 2 - vb.h / 2,
  });
}
