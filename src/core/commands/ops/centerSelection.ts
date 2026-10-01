import { documentGeometricBox, geometricBox } from '../../geom/bbox.ts';
import { center, union, isEmpty, EMPTY_BOX, type Box } from '../../geom/box.ts';
import { CANVAS, PADDING } from '../../constants.ts';
import type { Address, Element, IconDoc } from '../../model/types.ts';
import { command, type Command } from '../types.ts';
import { translateElement } from './moveGeometry.ts';

/**
 * Center the selection on the canvas, or the whole icon when nothing is
 * selected. Measured on the geometric box: the stroke is symmetric about the
 * centreline, so inflating it by w/2 would shift the center by nothing and
 * cost a needless dependency on stroke width.
 */
export function centerSelection(doc: IconDoc, addrs: readonly Address[]): Command {
  const target = targetBox(doc, addrs);
  if (!target) return command('Center', () => {});

  const c = center(target.box);
  const d = { x: half(CANVAS / 2 - c.x), y: half(CANVAS / 2 - c.y) };
  return moveBy(doc, target.ids, d, target.ids.size > 0 ? 'Center selection' : 'Center icon');
}

/**
 * Push the selection straight up or down until it meets the padding, or the
 * whole icon when nothing is selected. Horizontal position is left alone.
 *
 * "Meets the padding" means the stroke's outer edge lands on it, which puts
 * the centreline half a stroke further in -- the same [PADDING + w/2,
 * CANVAS - PADDING - w/2] band the conformance rule checks against, so an
 * aligned shape is in bounds by construction rather than by eye.
 */
export function alignSelection(
  doc: IconDoc,
  addrs: readonly Address[],
  edge: 'top' | 'bottom',
): Command {
  const label = edge === 'top' ? 'Align top' : 'Align bottom';
  const target = targetBox(doc, addrs);
  if (!target) return command(label, () => {});

  const inset = PADDING + doc.strokeSpec.width / 2;
  const dy = edge === 'top' ? inset - target.box.minY : CANVAS - inset - target.box.maxY;
  return moveBy(doc, target.ids, { x: 0, y: half(dy) }, label);
}

/**
 * Quantise a move to the half grid. An exact delta is an arbitrary number --
 * a shape whose width is not a multiple of 1 needs a fractional shift -- and
 * applying it drags every on-grid coordinate off the grid, which is where
 * values like 13.375 come from. Being half a tenth of a unit off is
 * invisible; scattering the geometry off the grid is not.
 */
const half = (v: number): number => Math.round(v * 2) / 2;

/** The selected elements' ids and their joint geometric box; all of them if none. */
function targetBox(doc: IconDoc, addrs: readonly Address[]): { ids: Set<string>; box: Box } | null {
  const ids = new Set(addrs.map((a) => a.el));
  const targets = ids.size > 0 ? doc.elements.filter((e) => ids.has(e.id)) : doc.elements;
  if (targets.length === 0) return null;

  let box: Box = EMPTY_BOX;
  for (const el of targets) box = union(box, geometricBox(el));
  if (isEmpty(box)) box = documentGeometricBox(doc);
  if (isEmpty(box)) return null;
  return { ids, box };
}

function moveBy(
  doc: IconDoc,
  ids: Set<string>,
  d: { x: number; y: number },
  label: string,
): Command {
  return command(label, (draft) => {
    for (const el of draft.elements) {
      if (ids.size > 0 && !ids.has(el.id)) continue;
      const origin = doc.elements.find((e) => e.id === el.id);
      if (origin) translateElement(el, origin as Element, d);
    }
  });
}
