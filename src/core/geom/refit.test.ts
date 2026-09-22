import { describe, expect, it } from 'vitest';

import type { Pt } from '../model/types.ts';
import type { Cubic } from './arc.ts';
import { arcToCubics } from './arc.ts';
import { dist } from './pt.ts';
import { evalCubic, mergeSegments } from './refit.ts';

/** de Casteljau split at t. */
function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
  const lerp = (a: Pt, b: Pt): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p01 = lerp(c.p0, c.c1);
  const p12 = lerp(c.c1, c.c2);
  const p23 = lerp(c.c2, c.p1);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const mid = lerp(p012, p123);
  return [
    { p0: c.p0, c1: p01, c2: p012, p1: mid },
    { p0: mid, c1: p123, c2: p23, p1: c.p1 },
  ];
}

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('mergeSegments', () => {
  it('recovers the original cubic when merging a split of it', () => {
    const rand = rng(12345);
    let worstControl = 0;
    let worstShape = 0;
    let checked = 0;

    for (let i = 0; i < 2000; i++) {
      const p = (): Pt => ({ x: rand() * 24, y: rand() * 24 });
      const original: Cubic = { p0: p(), c1: p(), c2: p(), p1: p() };
      const t = 0.15 + rand() * 0.7; // avoid degenerate splits at the very ends
      const [a, b] = splitCubic(original, t);

      const result = mergeSegments(
        { p: a.p0, out: a.c1 },
        { p: a.p1, in: a.c2, out: b.c1 },
        { p: b.p1, in: b.c2 },
      );
      if (!result || result.kind !== 'cubic') continue;
      checked += 1;

      worstControl = Math.max(
        worstControl,
        dist(result.c1, original.c1),
        dist(result.c2, original.c2),
      );

      // Shape agreement matters more than control-point identity.
      const merged: Cubic = { p0: a.p0, c1: result.c1, c2: result.c2, p1: b.p1 };
      for (let k = 0; k <= 20; k++) {
        worstShape = Math.max(worstShape, dist(evalCubic(merged, k / 20), evalCubic(original, k / 20)));
      }
    }

    expect(checked).toBeGreaterThan(1900);
    // Sub-thousandth of a unit on a 24-unit canvas: far below one device pixel.
    expect(worstControl).toBeLessThan(1e-3);
    expect(worstShape).toBeLessThan(1e-4);
  });

  it('keeps a straight run straight instead of promoting it to a curve', () => {
    const r = mergeSegments({ p: { x: 2, y: 2 } }, { p: { x: 6, y: 6 } }, { p: { x: 10, y: 10 } });
    expect(r).toEqual({ kind: 'line' });
  });

  it('curves a non-collinear run of straight segments', () => {
    const r = mergeSegments({ p: { x: 2, y: 2 } }, { p: { x: 6, y: 10 } }, { p: { x: 10, y: 2 } });
    expect(r?.kind).toBe('cubic');
  });

  it('refuses nothing: an arc neighbour still merges', () => {
    const arc = { rx: 5, ry: 5, rot: 0, largeArc: false, sweep: true };
    const r = mergeSegments(
      { p: { x: 2, y: 12 } },
      { p: { x: 12, y: 12 }, arc },
      { p: { x: 20, y: 12 } },
    );
    expect(r?.kind).toBe('cubic');
  });
});

describe('arcToCubics', () => {
  it('lands exactly on the requested endpoints', () => {
    const p0 = { x: 4, y: 12 };
    const p1 = { x: 20, y: 12 };
    const cubics = arcToCubics(p0, p1, { rx: 8, ry: 8, rot: 0, largeArc: false, sweep: true });
    expect(cubics[0]!.p0).toEqual(p0);
    expect(cubics[cubics.length - 1]!.p1).toEqual(p1);
  });

  it('approximates a semicircle to well under a pixel', () => {
    const c = { x: 12, y: 12 };
    const r = 8;
    const cubics = arcToCubics(
      { x: c.x - r, y: c.y },
      { x: c.x + r, y: c.y },
      { rx: r, ry: r, rot: 0, largeArc: false, sweep: true },
    );
    let worst = 0;
    for (const cu of cubics) {
      for (let k = 0; k <= 16; k++) {
        const p = evalCubic(cu, k / 16);
        worst = Math.max(worst, Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - r));
      }
    }
    // A 90-degree cubic approximation of a circular arc has a known maximum
    // radial error of ~2.7e-4 * r. At r = 8 that is 0.0022 units, i.e. 0.002
    // device pixels at 24px -- assert the theoretical bound, not a rounder one.
    expect(worst).toBeLessThan(2.7e-4 * r * 1.05);
  });

  it('draws a degenerate zero-radius arc as a line', () => {
    const cubics = arcToCubics(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { rx: 0, ry: 0, rot: 0, largeArc: false, sweep: false },
    );
    expect(cubics).toHaveLength(1);
    expect(cubics[0]!.p1).toEqual({ x: 10, y: 0 });
  });
});
