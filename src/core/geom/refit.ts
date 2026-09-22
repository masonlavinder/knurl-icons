import { EPS, REFIT_TOL } from '../constants.ts';
import type { ArcParams, Pt } from '../model/types.ts';
import { arcToCubics, type Cubic } from './arc.ts';
import { add, cross, dist, norm, scale, sub } from './pt.ts';

// `| undefined` is explicit throughout: under exactOptionalPropertyTypes an
// optional property does NOT accept an explicit undefined, and these are built
// by spreading values read off nodes that legitimately lack handles.
export type EndRef = { p: Pt; out?: Pt | undefined };
export type MidRef = { p: Pt; in?: Pt | undefined; out?: Pt | undefined; arc?: ArcParams | undefined };
export type NextRef = { p: Pt; in?: Pt | undefined; arc?: ArcParams | undefined };

export type RefitResult =
  | { kind: 'line' }
  | { kind: 'cubic'; c1: Pt; c2: Pt; maxError: number; method: 'lsq' | 'fallback' };

/**
 * Replace the two segments meeting at `mid` with one, deleting `mid`.
 *
 * Constrained least-squares cubic fit (Schneider, Graphics Gems) with the
 * endpoint tangent *directions* held fixed and only the two handle magnitudes
 * solved for. Holding directions fixed is the entire anti-kink mechanism: it
 * preserves G1 continuity with the segments beyond the join, which is what most
 * editors get wrong when they delete a node.
 */
export function mergeSegments(prev: EndRef, mid: MidRef, next: NextRef): RefitResult | null {
  const seg1 = toCubics(prev.p, { in: mid.in, arc: mid.arc }, mid.p, prev.out);
  const seg2 = toCubics(mid.p, { in: next.in, arc: next.arc }, next.p, mid.out);
  if (seg1.length === 0 || seg2.length === 0) return null;

  const straight1 = isStraight(prev.p, prev.out, mid.in, mid.p) && !mid.arc;
  const straight2 = isStraight(mid.p, mid.out, next.in, next.p) && !next.arc;

  // Three collinear points joined by straight segments stay a straight segment.
  // Emitting a cubic here would turn `L` into `C` in the output for no visual
  // reason, and cost byte-identity on every polyline-ish path.
  if (straight1 && straight2) {
    const a = sub(mid.p, prev.p);
    const b = sub(next.p, mid.p);
    const areaish = Math.abs(cross(a, b));
    if (areaish <= 1e-6 * Math.max(1, dist(prev.p, next.p))) return { kind: 'line' };
  }

  const p0 = prev.p;
  const p3 = next.p;
  const t0 = norm(sub(prev.out ?? firstControl(seg1) ?? mid.p, p0));
  const t3 = norm(sub(next.in ?? lastControl(seg2) ?? mid.p, p3));
  if (isZero(t0) || isZero(t3)) return fallback(p0, p3);

  // The junction parameter, which both the sampling and the analytic merge need.
  const tSplit = splitParameter(seg1, seg2);
  const { pts: samples, params } = sampleBoth(seg1, seg2, 32, tSplit);

  // Exact path first. If these two segments came from splitting one cubic --
  // which is precisely what happens when the user inserts a node and later
  // deletes it -- the original is recoverable in closed form, so the round trip
  // is an identity rather than an approximation.
  const exact = analyticMerge(seg1, seg2, tSplit);
  if (exact) {
    // Compared at known parameters, not by searching for the closest point: a
    // coarse closest-point scan has worse resolution than REFIT_TOL and would
    // reject the exact answer it was meant to confirm.
    const err = maxDeviation({ p0, c1: exact.c1, c2: exact.c2, p1: p3 }, samples, params);
    if (err <= REFIT_TOL) {
      return { kind: 'cubic', c1: exact.c1, c2: exact.c2, maxError: err, method: 'lsq' };
    }
  }

  const fit = fitCubicFixedTangents(samples, p0, t0, p3, t3);
  if (!fit) return fallback(p0, p3);

  return { kind: 'cubic', c1: fit.c1, c2: fit.c2, maxError: fit.maxError, method: 'lsq' };
}

/**
 * Closed-form inverse of a de Casteljau split.
 *
 * Splitting a cubic C at parameter t scales the junction tangents by t and
 * 1 - t respectively, so the split point is recoverable from their magnitudes:
 *
 *     |seg1'(1)| / |seg2'(0)| = t / (1 - t)
 *
 * and the original handles follow, since seg1.c1 = p0 + t(C.c1 - p0) and
 * seg2.c2 = p3 + (1 - t)(C.c2 - p3).
 *
 * Only applies to single-cubic neighbours; an arc expands to a chain and has no
 * single pair of handles to invert, so those fall through to the fit.
 */
function analyticMerge(seg1: Cubic[], seg2: Cubic[], t: number): { c1: Pt; c2: Pt } | null {
  if (seg1.length !== 1 || seg2.length !== 1) return null;
  if (!(t > EPS && t < 1 - EPS)) return null;
  const a = seg1[0]!;
  const b = seg2[0]!;

  // seg1.c1 = p0 + t(C.c1 - p0)  and  seg2.c2 = p3 + (1 - t)(C.c2 - p3)
  return {
    c1: add(a.p0, scale(sub(a.c1, a.p0), 1 / t)),
    c2: add(b.p1, scale(sub(b.c2, b.p1), 1 / (1 - t))),
  };
}

/**
 * Where the junction sits in the merged curve's parameter space.
 *
 * Splitting scales the junction tangents by t and 1 - t, so their magnitudes
 * give the ratio directly. For arc chains, which have no single handle pair,
 * fall back to the arc-length proportion.
 */
function splitParameter(seg1: Cubic[], seg2: Cubic[]): number {
  if (seg1.length === 1 && seg2.length === 1) {
    const a = seg1[0]!;
    const b = seg2[0]!;
    const d1 = dist(a.p1, a.c2); // proportional to |seg1'(1)|
    const d2 = dist(b.c1, b.p0); // proportional to |seg2'(0)|
    if (d1 + d2 > EPS) return d1 / (d1 + d2);
  }
  const l1 = totalLength(seg1);
  const l2 = totalLength(seg2);
  return l1 + l2 <= EPS ? 0.5 : l1 / (l1 + l2);
}

/* ------------------------------------------------------------------ */

/**
 * Least-squares cubic through `Q` with fixed endpoints and fixed tangent
 * directions. Only the handle magnitudes are unknown, so each iteration is a
 * closed-form 2x2 solve; Newton-Raphson reparameterization then refines the
 * sample parameters.
 */
export function fitCubicFixedTangents(
  Q: readonly Pt[],
  p0: Pt,
  t0: Pt,
  p3: Pt,
  t3: Pt,
  iterations = 3,
): { c1: Pt; c2: Pt; maxError: number } | null {
  if (Q.length < 2) return null;

  // Centripetal parameterization is more stable than uniform on curvy data.
  let u = centripetalParams(Q);
  let best: { c1: Pt; c2: Pt; maxError: number } | null = null;

  for (let iter = 0; iter <= iterations; iter++) {
    const solved = solveAlphas(Q, u, p0, t0, p3, t3);
    if (!solved) break;
    const c1 = add(p0, scale(t0, solved.a1));
    const c2 = add(p3, scale(t3, solved.a2));
    const cubic: Cubic = { p0, c1, c2, p1: p3 };
    const maxError = maxDeviation(cubic, Q, u);
    if (!best || maxError < best.maxError) best = { c1, c2, maxError };
    if (maxError <= REFIT_TOL * 0.25) break;
    u = reparameterize(cubic, Q, u);
  }

  return best;
}

function solveAlphas(
  Q: readonly Pt[],
  u: readonly number[],
  p0: Pt,
  t0: Pt,
  p3: Pt,
  t3: Pt,
): { a1: number; a2: number } | null {
  let c11 = 0;
  let c12 = 0;
  let c22 = 0;
  let x1 = 0;
  let x2 = 0;

  for (let i = 0; i < Q.length; i++) {
    const t = u[i]!;
    const b0 = bern0(t);
    const b1 = bern1(t);
    const b2 = bern2(t);
    const b3 = bern3(t);

    const a1 = scale(t0, b1);
    const a2 = scale(t3, b2);

    c11 += a1.x * a1.x + a1.y * a1.y;
    c12 += a1.x * a2.x + a1.y * a2.y;
    c22 += a2.x * a2.x + a2.y * a2.y;

    const base = {
      x: p0.x * (b0 + b1) + p3.x * (b2 + b3),
      y: p0.y * (b0 + b1) + p3.y * (b2 + b3),
    };
    const r = sub(Q[i]!, base);
    x1 += r.x * a1.x + r.y * a1.y;
    x2 += r.x * a2.x + r.y * a2.y;
  }

  const det = c11 * c22 - c12 * c12;
  if (Math.abs(det) < 1e-12) return null;

  let a1 = (x1 * c22 - c12 * x2) / det;
  let a2 = (c11 * x2 - x1 * c12) / det;

  // Guard the classic failure: a negative or exploding handle produces a loop.
  const chord = dist(p0, p3);
  const lo = 0.01 * chord;
  const hi = 3 * chord;
  if (!Number.isFinite(a1) || !Number.isFinite(a2) || a1 <= 0 || a2 <= 0) return null;
  a1 = Math.min(Math.max(a1, lo), hi);
  a2 = Math.min(Math.max(a2, lo), hi);
  return { a1, a2 };
}

/** Wu-Barsky fallback: handles one third of the chord along each tangent. */
function fallback(p0: Pt, p3: Pt): RefitResult {
  const d = dist(p0, p3) / 3;
  const dir = norm(sub(p3, p0));
  return {
    kind: 'cubic',
    c1: add(p0, scale(dir, d)),
    c2: sub(p3, scale(dir, d)),
    maxError: Infinity,
    method: 'fallback',
  };
}

/* ------------------------------------------------------------------ */
/* Sampling and cubic evaluation                                       */
/* ------------------------------------------------------------------ */

export function evalCubic(c: Cubic, t: number): Pt {
  const b0 = bern0(t);
  const b1 = bern1(t);
  const b2 = bern2(t);
  const b3 = bern3(t);
  return {
    x: c.p0.x * b0 + c.c1.x * b1 + c.c2.x * b2 + c.p1.x * b3,
    y: c.p0.y * b0 + c.c1.y * b1 + c.c2.y * b2 + c.p1.y * b3,
  };
}

function derivCubic(c: Cubic, t: number): Pt {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (c.c1.x - c.p0.x) + 6 * mt * t * (c.c2.x - c.c1.x) + 3 * t * t * (c.p1.x - c.c2.x),
    y: 3 * mt * mt * (c.c1.y - c.p0.y) + 6 * mt * t * (c.c2.y - c.c1.y) + 3 * t * t * (c.p1.y - c.c2.y),
  };
}

function deriv2Cubic(c: Cubic, t: number): Pt {
  const mt = 1 - t;
  return {
    x: 6 * mt * (c.c2.x - 2 * c.c1.x + c.p0.x) + 6 * t * (c.p1.x - 2 * c.c2.x + c.c1.x),
    y: 6 * mt * (c.c2.y - 2 * c.c1.y + c.p0.y) + 6 * t * (c.p1.y - 2 * c.c2.y + c.c1.y),
  };
}

/**
 * Sample both segments by arc length rather than by parameter.
 *
 * Uniform-t sampling clusters points where the curve moves slowly, which biases
 * the fit toward whichever half happens to be more curved.
 */
function sampleBoth(
  seg1: Cubic[],
  seg2: Cubic[],
  count: number,
  tSplit: number,
): { pts: Pt[]; params: number[] } {
  const len1 = totalLength(seg1);
  const len2 = totalLength(seg2);
  const total = len1 + len2;
  if (total <= EPS) {
    return { pts: [seg1[0]!.p0, seg2[seg2.length - 1]!.p1], params: [0, 1] };
  }

  const n1 = Math.max(2, Math.round((count * len1) / total));
  const n2 = Math.max(2, count - n1);

  const pts = sampleChain(seg1, n1);
  const params = pts.map((_, i) => (i / (n1 - 1)) * tSplit);

  const second = sampleChain(seg2, n2).slice(1);
  pts.push(...second);
  for (let i = 0; i < second.length; i++) {
    params.push(tSplit + ((i + 1) / (n2 - 1)) * (1 - tSplit));
  }

  return { pts, params };
}

function sampleChain(chain: readonly Cubic[], count: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const g = (i / (count - 1)) * chain.length;
    const idx = Math.min(chain.length - 1, Math.floor(g));
    out.push(evalCubic(chain[idx]!, g - idx));
  }
  return out;
}

function totalLength(chain: readonly Cubic[]): number {
  let sum = 0;
  for (const c of chain) {
    let prev = c.p0;
    for (let i = 1; i <= 16; i++) {
      const p = evalCubic(c, i / 16);
      sum += dist(prev, p);
      prev = p;
    }
  }
  return sum;
}

function centripetalParams(Q: readonly Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < Q.length; i++) {
    u.push(u[i - 1]! + Math.sqrt(dist(Q[i]!, Q[i - 1]!)));
  }
  const last = u[u.length - 1]!;
  return last <= EPS ? Q.map((_, i) => i / (Q.length - 1)) : u.map((v) => v / last);
}

function reparameterize(c: Cubic, Q: readonly Pt[], u: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Q.length; i++) {
    const t = u[i]!;
    const d = sub(evalCubic(c, t), Q[i]!);
    const d1 = derivCubic(c, t);
    const d2 = deriv2Cubic(c, t);
    const num = d.x * d1.x + d.y * d1.y;
    const den = d1.x * d1.x + d1.y * d1.y + d.x * d2.x + d.y * d2.y;
    const next = Math.abs(den) < 1e-12 ? t : t - num / den;
    out.push(Math.min(1, Math.max(0, next)));
  }
  // Keep parameters monotone; a crossed pair would fold the fit.
  for (let i = 1; i < out.length; i++) {
    if (out[i]! < out[i - 1]!) out[i] = out[i - 1]!;
  }
  return out;
}

function maxDeviation(c: Cubic, Q: readonly Pt[], u: readonly number[]): number {
  let m = 0;
  for (let i = 0; i < Q.length; i++) {
    const d = dist(evalCubic(c, u[i]!), Q[i]!);
    if (d > m) m = d;
  }
  return m;
}

/* ------------------------------------------------------------------ */

/** Build the cubic chain for the segment arriving at `to`. */
function toCubics(
  from: Pt,
  seg: { in?: Pt | undefined; arc?: ArcParams | undefined },
  to: Pt,
  fromOut?: Pt | undefined,
): Cubic[] {
  if (seg.arc) return arcToCubics(from, to, seg.arc);
  const c1 = fromOut ?? from;
  const c2 = seg.in ?? to;
  return [{ p0: from, c1, c2, p1: to }];
}

const firstControl = (chain: readonly Cubic[]): Pt | undefined => chain[0]?.c1;
const lastControl = (chain: readonly Cubic[]): Pt | undefined => chain[chain.length - 1]?.c2;

function isStraight(p0: Pt, out: Pt | undefined, inH: Pt | undefined, p1: Pt): boolean {
  return (
    (out === undefined || dist(out, p0) <= EPS) && (inH === undefined || dist(inH, p1) <= EPS)
  );
}

const isZero = (p: Pt): boolean => Math.abs(p.x) <= EPS && Math.abs(p.y) <= EPS;

const bern0 = (t: number): number => (1 - t) ** 3;
const bern1 = (t: number): number => 3 * t * (1 - t) ** 2;
const bern2 = (t: number): number => 3 * t * t * (1 - t);
const bern3 = (t: number): number => t ** 3;
