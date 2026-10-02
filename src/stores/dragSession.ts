import { moveGeometry } from '../core/commands/ops/moveGeometry.ts';
import { resolveAddress } from '../core/model/access.ts';
import type { Address, IconDoc, Pt } from '../core/model/types.ts';
import { useDocStore } from './docStore.ts';

type Session = {
  key: string;
  originDoc: IconDoc;
  originPt: Pt;
  /** Position of the dragged anchor when the gesture began, for snapping. */
  anchor: Pt | null;
  addrs: Address[];
  label: string;
  moved: boolean;
};

/**
 * Drag state lives here, not in React or zustand.
 *
 * A pointermove-rate `set()` would re-render the whole canvas sixty times a
 * second. This module is plain mutable state; only the document store is
 * touched, and only with a merge key so the entire gesture collapses into one
 * undo step on release.
 */
let session: Session | null = null;

export const isDragging = (): boolean => session !== null;

/** Whether the current (or just-finished) gesture actually moved anything. */
export const dragMoved = (): boolean => session?.moved ?? false;

export function beginDrag(addrs: Address[], originPt: Pt, label: string): void {
  if (addrs.length === 0) return;
  const originDoc = useDocStore.getState().doc;
  session = {
    key: `drag:${Date.now()}:${addrs.map((a) => a.el).join(',')}`,
    originDoc,
    originPt,
    anchor: anchorOf(originDoc, addrs[0]!),
    addrs,
    label,
    moved: false,
  };
}

export function updateDrag(curPt: Pt, opts: { snap: boolean; zoom: number }): void {
  if (!session) return;

  let dx = curPt.x - session.originPt.x;
  let dy = curPt.y - session.originPt.y;

  if (opts.snap && !session.anchor) {
    // Moving a whole shape has no single anchor to land on the grid, so the
    // *delta* is quantised instead. The shape keeps its internal geometry and
    // still steps in half units.
    dx = Math.round(dx * 2) / 2;
    dy = Math.round(dy * 2) / 2;
  } else if (opts.snap && session.anchor) {
    // Snap the resulting *position*, not the delta, so the dragged point lands
    // on the grid regardless of where inside a cell the gesture started.
    //
    // Snapping is unconditional rather than gated on a screen-space tolerance.
    // A tolerance of 6px is ~0.01 units once you are zoomed in, so it stops
    // engaging exactly when precision matters most, and the canvas quietly
    // fills up with coordinates like 11.732. Cmd/Ctrl is the escape hatch.
    const targetX = session.anchor.x + dx;
    const targetY = session.anchor.y + dy;
    dx = Math.round(targetX * 2) / 2 - session.anchor.x;
    dy = Math.round(targetY * 2) / 2 - session.anchor.y;
  }

  if (!session.moved && Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
  session.moved = true;

  useDocStore
    .getState()
    .dispatch(
      moveGeometry(session.originDoc, session.addrs, { x: dx, y: dy }, session.key, session.label),
    );
}

export function commitDrag(): void {
  if (!session) return;
  // Seal the entry so the next gesture starts a new undo step.
  if (session.moved) useDocStore.getState().sealHistory();
  session = null;
}

/** Restore the pre-drag document exactly. Escape during a drag. */
export function cancelDrag(): void {
  if (!session) return;
  const { originDoc, moved } = session;
  session = null;
  if (!moved) return;
  useDocStore.getState().restore(originDoc);
}

function anchorOf(doc: IconDoc, addr: Address): Pt | null {
  const resolved = resolveAddress(doc, addr);
  if (!resolved) return null;
  switch (resolved.kind) {
    case 'node':
      return resolved.node.p;
    case 'control':
      return resolved.control.p;
    case 'handle':
      return resolved.node[resolved.handle] ?? resolved.node.p;
    default:
      return null;
  }
}
