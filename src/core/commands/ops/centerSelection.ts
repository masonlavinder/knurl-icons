import { documentGeometricBox, geometricBox } from '../../geom/bbox.ts';
import { center, union, isEmpty, EMPTY_BOX, type Box } from '../../geom/box.ts';
import { CANVAS } from '../../constants.ts';
import type { Address, Element, IconDoc } from '../../model/types.ts';
import { command, type Command } from '../types.ts';
import { translateElement } from './moveGeometry.ts';

/**
 * Centre the selection on the canvas, or the whole icon when nothing is
 * selected. Measured on the geometric box: the stroke is symmetric about the
 * centreline, so inflating it by w/2 would shift the centre by nothing and
 * cost a needless dependency on stroke width.
 */
export function centerSelection(doc: IconDoc, addrs: readonly Address[]): Command {
  const ids = new Set(addrs.map((a) => a.el));
  const targets = ids.size > 0 ? doc.elements.filter((e) => ids.has(e.id)) : doc.elements;
  if (targets.length === 0) return command('Centre', () => {});

  let box: Box = EMPTY_BOX;
  for (const el of targets) box = union(box, geometricBox(el));
  if (isEmpty(box)) box = documentGeometricBox(doc);
  if (isEmpty(box)) return command('Centre', () => {});

  const c = center(box);
  // Quantise the move to the half grid. An exact centring delta is an arbitrary
  // number -- a shape whose width is not a multiple of 1 needs a fractional
  // shift -- and applying it drags every on-grid coordinate off the grid, which
  // is where values like 13.375 come from. Being half a tenth of a unit off
  // centre is invisible; scattering the geometry off the grid is not.
  const half = (v: number): number => Math.round(v * 2) / 2;
  const d = { x: half(CANVAS / 2 - c.x), y: half(CANVAS / 2 - c.y) };

  return command(ids.size > 0 ? 'Centre selection' : 'Centre icon', (draft) => {
    for (const el of draft.elements) {
      if (ids.size > 0 && !ids.has(el.id)) continue;
      const origin = doc.elements.find((e) => e.id === el.id);
      if (origin) translateElement(el, origin as Element, d);
    }
  });
}
