import type { Element, IconDoc, Node, Pt } from '../model/types.ts';
import { nodeListsOf } from '../model/access.ts';
import { arcToCubics, type Cubic } from './arc.ts';
import { EMPTY_BOX, extend, inflate, union, type Box } from './box.ts';

/**
 * Geometric bounding box: the path itself, ignoring stroke width.
 *
 * Cubic extents come from the derivative roots, never from the control-point
 * hull. The hull over-estimates -- sometimes badly -- and an over-estimated box
 * rejects perfectly legal icons at the padding check.
 */
export function geometricBox(el: Element): Box {
  switch (el.kind) {
    case 'circle':
      return {
        minX: el.c.x - el.r,
        minY: el.c.y - el.r,
        maxX: el.c.x + el.r,
        maxY: el.c.y + el.r,
      };

    case 'ellipse': {
      // Half-extent of a rotated ellipse: sqrt(rx^2 cos^2 t + ry^2 sin^2 t),
      // not max(rx, ry).
      const c = Math.cos(el.rot);
      const s = Math.sin(el.rot);
      const hx = Math.sqrt(el.rx * el.rx * c * c + el.ry * el.ry * s * s);
      const hy = Math.sqrt(el.rx * el.rx * s * s + el.ry * el.ry * c * c);
      return { minX: el.c.x - hx, minY: el.c.y - hy, maxX: el.c.x + hx, maxY: el.c.y + hy };
    }

    case 'rect':
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };

    case 'line':
      return extend(extend(EMPTY_BOX, el.a), el.b);

    case 'polyline': {
      let box = EMPTY_BOX;
      for (const n of el.nodes) box = extend(box, n.p);
      return box;
    }

    case 'path': {
      let box = EMPTY_BOX;
      for (const list of nodeListsOf(el)) {
        box = union(box, nodeListBox(list.nodes, list.closed));
      }
      return box;
    }
  }
}

function nodeListBox(nodes: readonly Node[], closed: boolean): Box {
  let box = EMPTY_BOX;
  if (nodes.length === 0) return box;

  for (const n of nodes) box = extend(box, n.p);

  const segmentCount = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const from = nodes[i]!;
    const to = nodes[(i + 1) % nodes.length]!;

    if (to.arc) {
      for (const c of arcToCubics(from.p, to.p, to.arc)) box = union(box, cubicBox(c));
      continue;
    }
    if (from.out === undefined && to.in === undefined) continue; // straight
    box = union(
      box,
      cubicBox({ p0: from.p, c1: from.out ?? from.p, c2: to.in ?? to.p, p1: to.p }),
    );
  }
  return box;
}

/** Exact cubic extent: endpoints plus any derivative root inside (0, 1). */
export function cubicBox(c: Cubic): Box {
  let box = extend(extend(EMPTY_BOX, c.p0), c.p1);
  for (const t of derivativeRoots(c.p0.x, c.c1.x, c.c2.x, c.p1.x)) {
    box = extend(box, at(c, t));
  }
  for (const t of derivativeRoots(c.p0.y, c.c1.y, c.c2.y, c.p1.y)) {
    box = extend(box, at(c, t));
  }
  return box;
}

function at(c: Cubic, t: number): Pt {
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

/** Roots of the derivative of a 1-D cubic Bezier, restricted to (0, 1). */
function derivativeRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;

  const out: number[] = [];
  const push = (t: number): void => {
    if (t > 0 && t < 1) out.push(t);
  };

  if (Math.abs(a) < 1e-12) {
    // Degenerates to linear: b t + c = 0
    if (Math.abs(b) > 1e-12) push(-c / b);
    return out;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return out;
  const root = Math.sqrt(disc);
  push((-b + root) / (2 * a));
  push((-b - root) / (2 * a));
  return out;
}

export function documentGeometricBox(doc: IconDoc): Box {
  let box = EMPTY_BOX;
  for (const el of doc.elements) box = union(box, geometricBox(el));
  return box;
}

/**
 * Visual box: geometry inflated by half the stroke width.
 *
 * Exact for round caps and round joins, which is the house spec. A miter join
 * would extend further, so if miter ever becomes an option this identity has to
 * be revisited -- there is a test pinning it.
 */
export function visualBox(doc: IconDoc): Box {
  const box = documentGeometricBox(doc);
  return inflate(box, doc.strokeSpec.width / 2);
}

export function elementVisualBox(el: Element, strokeWidth: number): Box {
  return inflate(geometricBox(el), strokeWidth / 2);
}
