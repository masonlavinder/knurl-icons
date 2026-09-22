import type { Id } from '../../ids.ts';
import { describeElement } from '../../model/access.ts';
import { createElement } from '../../model/factory.ts';
import type { Element, ElementKind } from '../../model/types.ts';
import { command, type Command } from '../types.ts';

export function addElement(kind: ElementKind | 'polygon'): Command {
  const el = createElement(kind);
  return command(
    `Add ${describeElement(el)}`,
    (draft) => {
      draft.elements.push(el);
    },
    { selectionAfter: () => ({ addrs: [{ el: el.id }], anchor: { el: el.id } }) },
  );
}

/** A single numeric field on an element, addressed by a dotted path. */
export type FieldPath = string;

/**
 * Write one numeric field.
 *
 * Successive edits to the same field coalesce into one history entry via the
 * merge key, so dragging a number input or holding an arrow key produces a
 * single undo step rather than one per keystroke.
 */
export function setElementField(elId: Id, path: FieldPath, value: number): Command {
  return command(
    `Edit ${path}`,
    (draft) => {
      const el = draft.elements.find((e) => e.id === elId);
      if (!el) return;
      writeField(el as Element, path, value);
    },
    { mergeKey: `field:${elId}:${path}` },
  );
}

export function setElementFill(elId: Id, fill: 'none' | 'currentColor' | undefined): Command {
  return command(`Set fill`, (draft) => {
    const el = draft.elements.find((e) => e.id === elId);
    if (!el) return;
    if (fill === undefined) delete el.fill;
    else el.fill = fill;
  });
}

export function setClosed(elId: Id, closed: boolean): Command {
  return command(closed ? 'Close shape' : 'Open shape', (draft) => {
    const el = draft.elements.find((e) => e.id === elId);
    if (!el) return;
    if (el.kind === 'polyline') el.closed = closed;
    else if (el.kind === 'path') for (const s of el.subpaths) s.closed = closed;
    else return;
    // An open run has no interior, so a fill on it is meaningless. Dropping it
    // here keeps the document from carrying a state the UI already forbids --
    // otherwise re-closing the shape would resurrect a fill nobody asked for.
    if (!closed) delete el.fill;
  });
}

export function reorderElement(elId: Id, delta: number): Command {
  return command(delta < 0 ? 'Move backward' : 'Move forward', (draft) => {
    const i = draft.elements.findIndex((e) => e.id === elId);
    if (i < 0) return;
    const j = Math.min(draft.elements.length - 1, Math.max(0, i + delta));
    if (i === j) return;
    const [moved] = draft.elements.splice(i, 1);
    if (moved) draft.elements.splice(j, 0, moved);
  });
}

/* ------------------------------------------------------------------ */

/**
 * Field paths are flat strings ("c.x", "nodes.3.y") so the inspector can be
 * data-driven rather than a switch per element kind repeated in the UI.
 */
function writeField(el: Element, path: FieldPath, value: number): void {
  const parts = path.split('.');
  let target: Record<string, unknown> = el as unknown as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = target[key];
    if (next === undefined || next === null) return;
    target = next as Record<string, unknown>;
  }

  const last = parts[parts.length - 1]!;
  if (typeof target[last] !== 'number') return;
  target[last] = value;

  // A rect's radii are clamped by its own size; letting rx exceed w/2 renders
  // differently in different engines.
  if (el.kind === 'rect') {
    el.rx = Math.min(Math.max(el.rx, 0), el.w / 2);
    el.ry = Math.min(Math.max(el.ry, 0), el.h / 2);
  }
  if (el.kind === 'circle') el.r = Math.max(0, el.r);
  if (el.kind === 'ellipse') {
    el.rx = Math.max(0, el.rx);
    el.ry = Math.max(0, el.ry);
  }
}
