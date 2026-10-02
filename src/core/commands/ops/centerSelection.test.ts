import { produce } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';

import { registerNodeXmlParser } from '../../../utils/xmlNode.ts';
import { geometricBox } from '../../geom/bbox.ts';
import { parseSvg } from '../../io/import/parseSvg.ts';
import type { IconDoc } from '../../model/types.ts';
import { alignSelection, centerSelection } from './centerSelection.ts';

beforeAll(() => {
  registerNodeXmlParser();
});

const doc = (body: string): IconDoc =>
  parseSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2">${body}</svg>`,
  ).value;

const run = (d: IconDoc, cmd: { mutate: (draft: IconDoc) => void }): IconDoc =>
  produce(d, cmd.mutate);

/** Align the first element of a one-off document and return its new box. */
const aligned = (body: string, edge: 'top' | 'bottom') => {
  const d = doc(body);
  return geometricBox(run(d, alignSelection(d, [{ el: d.elements[0]!.id }], edge)).elements[0]!);
};

// A 4x4 square sitting in the middle: 10..14 on both axes.
const SQUARE = '<rect x="10" y="10" width="4" height="4" />';

describe('alignSelection', () => {
  it('puts the stroke edge on the top padding, and only moves vertically', () => {
    const box = aligned(SQUARE, 'top');
    // Padding 1 plus half a 2-wide stroke: the centreline sits at 2.
    expect(box.minY).toBe(2);
    expect(box.minX).toBe(10);
  });

  it('puts the stroke edge on the bottom padding', () => {
    const box = aligned(SQUARE, 'bottom');
    expect(box.maxY).toBe(22);
    expect(box.minX).toBe(10);
  });

  it('moves only what is selected', () => {
    const two = doc(`${SQUARE}<circle cx="5" cy="12" r="2" />`);
    const out = run(two, alignSelection(two, [{ el: two.elements[0]!.id }], 'top'));
    expect(geometricBox(out.elements[1]!)).toEqual(geometricBox(two.elements[1]!));
  });

  it('keeps the move on the half grid', () => {
    const dy = aligned('<rect x="10" y="10.3" width="4" height="4" />', 'top').minY - 10.3;
    expect(Math.abs(dy * 2 - Math.round(dy * 2))).toBeLessThan(1e-9);
  });

  it('still centres like Ctrl+E', () => {
    const off = doc('<rect x="2" y="4" width="4" height="4" />');
    const out = run(off, centerSelection(off, [{ el: off.elements[0]!.id }]));
    const box = geometricBox(out.elements[0]!);
    expect((box.minX + box.maxX) / 2).toBe(12);
    expect((box.minY + box.maxY) / 2).toBe(12);
  });
});
