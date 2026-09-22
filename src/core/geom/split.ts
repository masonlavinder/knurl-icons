import type { ArcParams, Pt } from '../model/types.ts';
import { endpointToCenter, type Cubic } from './arc.ts';
import { dist, lerp, sub } from './pt.ts';

/** de Casteljau split. Both halves together reproduce the original exactly. */
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = lerp(c.p0, c.c1, t);
  const p12 = lerp(c.c1, c.c2, t);
  const p23 = lerp(c.c2, c.p1, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const mid = lerp(p012, p123, t);
  return [
    { p0: c.p0, c1: p01, c2: p012, p1: mid },
    { p0: mid, c1: p123, c2: p23, p1: c.p1 },
  ];
}

export function evalCubicAt(c: Cubic, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const d = 3 * mt * t * t;
  const e = t * t * t;
  return {
    x: c.p0.x * a + c.c1.x * b + c.c2.x * d + c.p1.x * e,
    y: c.p0.y * a + c.c1.y * b + c.c2.y * d + c.p1.y * e,
  };
}

/**
 * Parameter of the closest point on a cubic, by coarse scan plus bisection.
 *
 * Used to insert a node exactly where the pointer met the segment, rather than
 * snapping it to the midpoint and moving the curve under the user's cursor.
 */
export function closestTOnCubic(c: Cubic, q: Pt, samples = 64): number {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const d = dist(evalCubicAt(c, t), q);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  let lo = Math.max(0, bestT - 1 / samples);
  let hi = Math.min(1, bestT + 1 / samples);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dist(evalCubicAt(c, m1), q) < dist(evalCubicAt(c, m2), q)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

/** Parameter of the closest point on a line segment, clamped to [0, 1]. */
export function closestTOnSegment(a: Pt, b: Pt, q: Pt): number {
  const ab = sub(b, a);
  const len2 = ab.x * ab.x + ab.y * ab.y;
  if (len2 < 1e-12) return 0;
  const aq = sub(q, a);
  return Math.min(1, Math.max(0, (aq.x * ab.x + aq.y * ab.y) / len2));
}

export type ArcSplit = { mid: Pt; first: ArcParams; second: ArcParams };

/**
 * Split an elliptical arc without leaving arc space.
 *
 * Converting to cubics first would silently destroy the `A` command that 70% of
 * the corpus depends on, so the sweep is divided in the center parameterization
 * and only the large-arc flags are recomputed.
 */
export function splitArc(p0: Pt, p1: Pt, a: ArcParams, t: number): ArcSplit | null {
  const ctr = endpointToCenter(p0, p1, a);
  if (!ctr) return null;

  const { c, rx, ry, rot, theta0, dTheta } = ctr;
  const thetaMid = theta0 + dTheta * t;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const x = rx * Math.cos(thetaMid);
  const y = ry * Math.sin(thetaMid);
  const mid = { x: c.x + cos * x - sin * y, y: c.y + sin * x + cos * y };

  return {
    mid,
    first: { rx, ry, rot, largeArc: Math.abs(dTheta * t) > Math.PI, sweep: a.sweep },
    second: {
      rx,
      ry,
      rot,
      largeArc: Math.abs(dTheta * (1 - t)) > Math.PI,
      sweep: a.sweep,
    },
  };
}
