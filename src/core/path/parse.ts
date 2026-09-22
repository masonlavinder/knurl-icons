import svgpath from 'svgpath';

import { EPS } from '../constants.ts';
import { makeId } from '../ids.ts';
import type { Node, Pt, Subpath } from '../model/types.ts';
import { approxEq } from '../geom/pt.ts';

/** svgpath emits command tuples: a letter followed by its numeric arguments. */
type RawSegment = readonly [string, ...number[]];

/**
 * Parse a `d` attribute into subpaths.
 *
 * Never tokenize path data by hand. `a5 5 0 013` means rx=5 ry=5 rot=0
 * largeArc=0 sweep=1 x=3 -- arc flags are single characters and may be packed
 * against the following number, so `split(/[\s,]/)` yields silent garbage.
 * svgpath has a proper flag-aware tokenizer; 294 corpus icons depend on it.
 *
 * Output is absolute, with S/T expanded, H/V promoted to line segments, and Q
 * promoted to C (one curve segment type in the model is worth the extra control
 * point). Arcs are preserved as `A` -- see ArcParams.
 */
export function parsePath(d: string): Subpath[] {
  // `.segments` exists at runtime but is not in svgpath's public typings, so
  // collect through the declared `.iterate` API instead of casting around it.
  const segs: RawSegment[] = [];
  svgpath(d)
    .abs()
    .unshort()
    .iterate((seg) => {
      segs.push(seg);
    });

  const subpaths: Subpath[] = [];
  let nodes: Node[] = [];
  let closed = false;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };

  const flush = (): void => {
    if (nodes.length > 0) {
      subpaths.push(finishSubpath(nodes, closed));
    }
    nodes = [];
    closed = false;
  };

  /** Append a node arriving at `p`. `inH` governs the arriving segment. */
  const arrive = (p: Pt, inH?: Pt, outPrev?: Pt): Node => {
    // A drawing command may follow Z with no intervening M, in which case the
    // subpath restarts at the previous subpath's start point.
    if (nodes.length === 0) nodes.push({ id: makeId('n'), p: cur, type: 'corner' });
    const prev = nodes[nodes.length - 1];
    if (prev && outPrev) prev.out = outPrev;
    const node: Node = { id: makeId('n'), p, type: 'corner' };
    if (inH) node.in = inH;
    nodes.push(node);
    cur = p;
    return node;
  };

  for (const seg of segs) {
    const cmd = seg[0];
    switch (cmd) {
      case 'M': {
        flush();
        cur = { x: num(seg[1]), y: num(seg[2]) };
        start = cur;
        nodes.push({ id: makeId('n'), p: cur, type: 'corner' });
        break;
      }
      case 'L': {
        arrive({ x: num(seg[1]), y: num(seg[2]) });
        break;
      }
      case 'H': {
        arrive({ x: num(seg[1]), y: cur.y });
        break;
      }
      case 'V': {
        arrive({ x: cur.x, y: num(seg[1]) });
        break;
      }
      case 'C': {
        const c1 = { x: num(seg[1]), y: num(seg[2]) };
        const c2 = { x: num(seg[3]), y: num(seg[4]) };
        const p = { x: num(seg[5]), y: num(seg[6]) };
        arrive(p, c2, c1);
        break;
      }
      case 'Q': {
        // Elevate quadratic to cubic exactly: c1 = p0 + 2/3(q - p0), c2 = p3 + 2/3(q - p3)
        const q = { x: num(seg[1]), y: num(seg[2]) };
        const p = { x: num(seg[3]), y: num(seg[4]) };
        const c1 = { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) };
        const c2 = { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) };
        arrive(p, c2, c1);
        break;
      }
      case 'A': {
        const p = { x: num(seg[6]), y: num(seg[7]) };
        const node = arrive(p);
        node.arc = {
          rx: Math.abs(num(seg[1])),
          ry: Math.abs(num(seg[2])),
          rot: (num(seg[3]) * Math.PI) / 180,
          largeArc: num(seg[4]) !== 0,
          sweep: num(seg[5]) !== 0,
        };
        break;
      }
      case 'Z':
      case 'z': {
        closed = true;
        cur = start;
        flush();
        break;
      }
      default:
        break;
    }
  }
  flush();

  return subpaths.filter((s) => s.nodes.length > 0);
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

/**
 * Infer node types from handle geometry.
 *
 * The parser builds every node as a corner because it sees one segment at a
 * time. Once both handles are known, collinear ones mean the author intended a
 * smooth join -- and equal lengths mean a symmetric one. Getting this right is
 * what makes dragging a handle on an imported icon keep the curve smooth
 * instead of instantly kinking it.
 */
function classifyNodes(nodes: Node[]): void {
  for (const n of nodes) {
    if (!n.in || !n.out) continue;
    const ax = n.p.x - n.in.x;
    const ay = n.p.y - n.in.y;
    const bx = n.out.x - n.p.x;
    const by = n.out.y - n.p.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < EPS || lb < EPS) continue;
    // Collinear within a hair: cross product of the unit vectors.
    if (Math.abs((ax / la) * (by / lb) - (ay / la) * (bx / lb)) > 1e-6) continue;
    n.type = Math.abs(la - lb) <= 1e-6 ? 'symmetric' : 'smooth';
  }
}

/**
 * Collapse the explicit closing node.
 *
 * `M0 0 L10 0 L10 10 L0 0 Z` ends with a node coincident with the start. Keeping
 * it would leave a duplicate node plus a zero-length implicit closing segment.
 * Drop it, transferring its arriving handle (or arc) onto the first node, which
 * is where the implicit closing segment terminates.
 */
function finishSubpath(nodes: Node[], closed: boolean): Subpath {
  if (closed && nodes.length > 1) {
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (approxEq(first.p, last.p, EPS)) {
      nodes.pop();
      // The segment that arrived at `last` is now the implicit closing segment,
      // which terminates at `first`. Its departing handle already lives on the
      // node before `last` and stays put; `last.out` governed the now-discarded
      // zero-length hop and is dropped.
      if (last.in) first.in = last.in;
      if (last.arc) first.arc = last.arc;
    }
  }
  classifyNodes(nodes);
  return { id: makeId('s'), nodes, closed };
}
