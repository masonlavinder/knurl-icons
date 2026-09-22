import { describe, expect, it } from 'vitest';

import { corpusAvailable, loadCorpus } from '../../test/corpus/loadCorpus.ts';
import { describeSubpathDiff, subpathsEq } from '../../test/helpers/structuralEq.ts';
import { emitPath } from './emit.ts';
import { formatNum, needsSep } from './num.ts';
import { parsePath } from './parse.ts';

describe('formatNum', () => {
  it('rounds to 3dp, strips trailing zeros, elides the leading zero', () => {
    expect(formatNum(3.5)).toBe('3.5');
    expect(formatNum(4)).toBe('4');
    expect(formatNum(0.5)).toBe('.5');
    expect(formatNum(-0.5)).toBe('-.5');
    expect(formatNum(12.248)).toBe('12.248');
    expect(formatNum(16.8607)).toBe('16.861');
    expect(formatNum(-0)).toBe('0');
    expect(formatNum(1e-9)).toBe('0');
  });
});

describe('needsSep', () => {
  it('omits the separator only where the grammar self-delimits', () => {
    expect(needsSep('1', '-.5')).toBe(false); // minus self-delimits
    expect(needsSep('1.5', '.5')).toBe(false); // prev already spent its dot
    expect(needsSep('1', '.5')).toBe(true); // else "1.5" would read as one number
    expect(needsSep('1', '2')).toBe(true);
  });
});

describe('parsePath dialects', () => {
  it('reads packed arc flags', () => {
    // a4.501 4.501 0 0 0 0 9 -- flags packed as "000"
    const sp = parsePath('M1 1a4.501 4.501 0 000 9z');
    expect(sp).toHaveLength(1);
    const arcNode = sp[0]!.nodes[1] ?? sp[0]!.nodes[0]!;
    expect(arcNode.arc).toBeDefined();
    expect(arcNode.arc!.rx).toBeCloseTo(4.501, 6);
    expect(arcNode.arc!.largeArc).toBe(false);
    expect(arcNode.arc!.sweep).toBe(false);
  });

  it('reads leading-zero elision', () => {
    const sp = parsePath('M1 1a.5.5 0 01.627 0');
    const n = sp[0]!.nodes[1]!;
    expect(n.arc!.rx).toBeCloseTo(0.5, 9);
    expect(n.arc!.sweep).toBe(true);
    expect(n.p.x).toBeCloseTo(1.627, 9);
  });

  it('reads hand-spaced style', () => {
    const sp = parsePath('M 12.248 21.969 a 1 1 0 0 1 -0.849 -0.17');
    expect(sp[0]!.nodes[0]!.p.x).toBeCloseTo(12.248, 9);
    expect(sp[0]!.nodes[1]!.p.x).toBeCloseTo(11.399, 9);
  });

  it('expands H/V and implicit repeats into line nodes', () => {
    const sp = parsePath('M1 1L2 2 3 3H7V9');
    expect(sp[0]!.nodes.map((n) => [n.p.x, n.p.y])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [7, 3],
      [7, 9],
    ]);
  });

  it('elevates quadratics to cubics exactly', () => {
    const sp = parsePath('M0 0Q3 0 6 6');
    const n = sp[0]!.nodes[1]!;
    expect(n.in).toBeDefined();
    expect(sp[0]!.nodes[0]!.out).toEqual({ x: 2, y: 0 });
    expect(n.in!.x).toBeCloseTo(4, 9);
    expect(n.in!.y).toBeCloseTo(2, 9);
  });

  it('collapses an explicit closing node back onto the start', () => {
    const closed = parsePath('M0 0L10 0L10 10L0 0Z');
    expect(closed[0]!.closed).toBe(true);
    expect(closed[0]!.nodes).toHaveLength(3);
  });
});

describe('emitPath', () => {
  it('uses implicit repetition after a moveto', () => {
    // m then an implicit relative lineto, exactly as upstream writes it
    expect(emitPath(parsePath('m16 9-5.5 5.5L8 12'))).toBe('m16 9-5.5 5.5L8 12');
  });

  it('prefers H/V for axis-aligned lines', () => {
    // A leading moveto is a length tie, and a moveto tie goes to absolute;
    // the following command is a tie too, and those go to relative.
    expect(emitPath(parsePath('M12 2L12 4'))).toBe('M12 2v2');
    expect(emitPath(parsePath('M12 2L16 2'))).toBe('M12 2h4');
  });

  it('never emits "-0"', () => {
    expect(emitPath(parsePath('M0 0L-0.0001 5'))).not.toContain('-0 ');
  });
});

/* ------------------------------------------------------------------ */
/* Corpus gate 1: path-level idempotence                               */
/* ------------------------------------------------------------------ */

/**
 * Idempotence is a statement about *our* canonical form being a fixed point --
 * not about our output reproducing the input's precision. Sources carrying 4-5
 * decimals, and quadratics elevated to cubics (which produce thirds), both land
 * legitimately off the input by up to half an output ulp.
 *
 * So there are two distinct assertions:
 *   1. emit(parse(emit(parse(d)))) === emit(parse(d))   -- byte-level fixed point
 *   2. parse(d) ~= parse(emit(parse(d))) within half an output ulp -- no drift
 */
const HALF_ULP = 0.5 * 10 ** -3;

describe.skipIf(!corpusAvailable())('path round-trip over the corpus', () => {
  it('reaches a byte-level fixed point after one pass', () => {
    const failures: string[] = [];
    let paths = 0;

    for (const icon of loadCorpus()) {
      for (const m of icon.svg.matchAll(/\sd="([^"]*)"/g)) {
        paths += 1;
        const s1 = emitPath(parsePath(m[1]!));
        const s2 = emitPath(parsePath(s1));
        if (s1 !== s2) failures.push(`${icon.name}:\n    1: ${s1}\n    2: ${s2}`);
      }
    }

    expect(paths).toBeGreaterThan(6000);
    expect(failures.slice(0, 5).join('\n  ')).toBe('');
  });

  it('preserves geometry to within half an output ulp', () => {
    const failures: string[] = [];

    for (const icon of loadCorpus()) {
      for (const m of icon.svg.matchAll(/\sd="([^"]*)"/g)) {
        const d = m[1]!;
        const once = parsePath(d);
        const twice = parsePath(emitPath(once));
        if (!subpathsEq(once, twice, HALF_ULP)) {
          failures.push(`${icon.name}: ${describeSubpathDiff(once, twice)}\n    d=${d}`);
        }
      }
    }

    expect(failures.slice(0, 5).join('\n  ')).toBe('');
  });
});
