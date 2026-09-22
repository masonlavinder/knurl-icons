import type { ArcParams, Pt } from '../model/types.ts';

export type Cubic = { p0: Pt; c1: Pt; c2: Pt; p1: Pt };

export type ArcCenter = {
  c: Pt;
  rx: number;
  ry: number;
  rot: number;
  theta0: number;
  dTheta: number;
};

/**
 * SVG endpoint parameterization -> center parameterization (spec F.6.5).
 *
 * Returns null for a degenerate arc (coincident endpoints or a zero radius),
 * which the spec says to draw as a straight line.
 */
export function endpointToCenter(p0: Pt, p1: Pt, a: ArcParams): ArcCenter | null {
  let { rx, ry } = a;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return null;
  if (p0.x === p1.x && p0.y === p1.y) return null;

  const cos = Math.cos(a.rot);
  const sin = Math.sin(a.rot);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  // Scale up radii that are too small to span the endpoints (spec F.6.6).
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const num = rxSq * rySq - rxSq * y1 * y1 - rySq * x1 * x1;
  const den = rxSq * y1 * y1 + rySq * x1 * x1;
  const factor = Math.sqrt(Math.max(0, num / den)) * (a.largeArc === a.sweep ? -1 : 1);

  const cxp = (factor * (rx * y1)) / ry;
  const cyp = (factor * -(ry * x1)) / rx;

  const c: Pt = {
    x: cos * cxp - sin * cyp + (p0.x + p1.x) / 2,
    y: sin * cxp + cos * cyp + (p0.y + p1.y) / 2,
  };

  const theta0 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dTheta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  dTheta %= 2 * Math.PI;
  if (!a.sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (a.sweep && dTheta < 0) dTheta += 2 * Math.PI;

  return { c, rx, ry, rot: a.rot, theta0, dTheta };
}

function angle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  let ang = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)));
  if (ux * vy - uy * vx < 0) ang = -ang;
  return ang;
}

/**
 * Expand an arc into cubics, at most 90 degrees each.
 *
 * FLATTEN TIME ONLY. bezier-js cannot represent arcs, so hit-testing, bounding
 * boxes and refitting go through this -- but the result is never written back
 * to the document, which keeps `A` commands intact through import and export.
 */
export function arcToCubics(p0: Pt, p1: Pt, a: ArcParams): Cubic[] {
  const ctr = endpointToCenter(p0, p1, a);
  if (!ctr) return [{ p0, c1: p0, c2: p1, p1 }];

  const { c, rx, ry, rot, theta0, dTheta } = ctr;
  const count = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const step = dTheta / count;
  // Control-point distance for a circular arc of sweep `step`.
  const k = (4 / 3) * Math.tan(step / 4);

  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const at = (t: number): Pt => {
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return { x: c.x + cos * x - sin * y, y: c.y + sin * x + cos * y };
  };
  const deriv = (t: number): Pt => {
    const x = -rx * Math.sin(t);
    const y = ry * Math.cos(t);
    return { x: cos * x - sin * y, y: sin * x + cos * y };
  };

  const out: Cubic[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = theta0 + i * step;
    const t1 = t0 + step;
    const a0 = at(t0);
    const a1 = at(t1);
    const d0 = deriv(t0);
    const d1 = deriv(t1);
    out.push({
      p0: a0,
      c1: { x: a0.x + k * d0.x, y: a0.y + k * d0.y },
      c2: { x: a1.x - k * d1.x, y: a1.y - k * d1.y },
      p1: a1,
    });
  }
  // Pin the ends to the exact requested endpoints so accumulated trig error
  // can never move a node.
  out[0]!.p0 = p0;
  out[out.length - 1]!.p1 = p1;
  return out;
}
