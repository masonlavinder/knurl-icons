import type { Draft } from 'immer';

import { closestTOnCubic, closestTOnSegment, splitArc, splitCubic } from '../../geom/split.ts';
import { makeId, type Id } from '../../ids.ts';
import { nodeListsOf } from '../../model/access.ts';
import type { Address, Element, Node, Pt } from '../../model/types.ts';
import { command, type Command } from '../types.ts';

export type SegmentRef = { el: Id; sub?: Id | undefined; index: number };

/**
 * Insert a node into the segment ending at `index`, at the point nearest `near`.
 *
 * Inserting where the pointer actually met the curve -- rather than at the
 * midpoint -- is what stops the shape shifting under the cursor. A cubic is
 * divided by de Casteljau, so the geometry is bit-identical either side of the
 * new node; an arc is divided in arc space, so it stays an arc.
 */
export function insertNode(ref: SegmentRef, near: Pt): Command {
  return command('Insert node', (draft) => {
    const el = draft.elements.find((e) => e.id === ref.el);
    if (!el) return;
    const list = pickList(el, ref.sub);
    if (!list) return;

    const { nodes, closed } = list;
    const count = closed ? nodes.length : nodes.length - 1;
    if (ref.index < 1 || ref.index > count) return;

    const fromIdx = ref.index - 1;
    const toIdx = ref.index % nodes.length;
    const from = nodes[fromIdx];
    const to = nodes[toIdx];
    if (!from || !to) return;

    const inserted = buildInserted(from, to, near);
    if (!inserted) return;
    nodes.splice(ref.index, 0, inserted);
  });
}

function buildInserted(from: Draft<Node>, to: Draft<Node>, near: Pt): Node | null {
  // Arc: divide the sweep, keep both halves as arcs.
  if (to.arc) {
    const t = 0.5; // an arc has no cheap closest-point; the midpoint reads fine
    const split = splitArc(from.p, to.p, to.arc, t);
    if (!split) return null;
    const mid: Node = { id: makeId('n'), p: split.mid, type: 'smooth', arc: split.first };
    to.arc = split.second;
    return mid;
  }

  const curved = from.out !== undefined || to.in !== undefined;

  if (!curved) {
    const t = closestTOnSegment(from.p, to.p, near);
    const exact = {
      x: from.p.x + (to.p.x - from.p.x) * t,
      y: from.p.y + (to.p.y - from.p.y) * t,
    };
    // Snap to the half grid, but only when doing so keeps the point on the
    // segment -- on an axis-aligned run it always does, and on a diagonal it
    // would otherwise put a visible kink in a straight line.
    const snapped = { x: half(exact.x), y: half(exact.y) };
    const onLine = distToSegment(snapped, from.p, to.p) < 1e-9;
    return { id: makeId('n'), p: onLine ? snapped : exact, type: 'corner' };
  }

  const cubic = {
    p0: from.p,
    c1: from.out ?? from.p,
    c2: to.in ?? to.p,
    p1: to.p,
  };
  const t = closestTOnCubic(cubic, near);
  const [left, right] = splitCubic(cubic, t);

  from.out = left.c1;
  to.in = right.c2;
  return { id: makeId('n'), p: left.p1, type: 'smooth', in: left.c2, out: right.c1 };
}

/**
 * Add a node at the end of a run.
 *
 * A closed shape has a segment between its last node and its first, so the new
 * node goes there. An open run has no such segment, so the path is extended:
 * the new node continues the direction of the final segment, which is what
 * "add another point" means when you are drawing.
 */
export function appendNode(elId: Id, subId: Id | undefined): Command {
  return command('Add node', (draft) => {
    const el = draft.elements.find((e) => e.id === elId);
    if (!el) return;
    const list = pickList(el, subId);
    if (!list || list.nodes.length === 0) return;

    const { nodes, closed } = list;

    if (closed) {
      const from = nodes[nodes.length - 1]!;
      const to = nodes[0]!;
      const inserted = buildInserted(from, to, {
        x: (from.p.x + to.p.x) / 2,
        y: (from.p.y + to.p.y) / 2,
      });
      if (inserted) nodes.push(inserted);
      return;
    }

    const last = nodes[nodes.length - 1]!;
    const prev = nodes[nodes.length - 2];
    let dx = prev ? last.p.x - prev.p.x : 4;
    let dy = prev ? last.p.y - prev.p.y : 0;
    const len = Math.hypot(dx, dy);
    // Normalise to a readable step, and never extend to nothing.
    const step = 4;
    if (len < 1e-6) {
      dx = step;
      dy = 0;
    } else {
      dx = (dx / len) * step;
      dy = (dy / len) * step;
    }

    nodes.push({
      id: makeId('n'),
      p: {
        x: half(Math.min(22, Math.max(2, last.p.x + dx))),
        y: half(Math.min(22, Math.max(2, last.p.y + dy))),
      },
      type: 'corner',
    });
  });
}

/**
 * Turn a node's curvature on or off.
 *
 * Deliberately a two-state toggle rather than a corner/smooth/symmetric cycle.
 * A cycle cannot be undone by clicking again -- which is exactly what people
 * expect from a control that added something visible -- and the distinction
 * between smooth and symmetric is a refinement nobody needs before they have a
 * curve at all. Turning it off removes the handles it added.
 */
export function setNodeCurved(addr: Address & { node: Id }, curved: boolean): Command {
  return command(curved ? 'Curve node' : 'Straighten node', (draft) => {
    const el = draft.elements.find((e) => e.id === addr.el);
    if (!el) return;
    for (const list of nodeListsOf(el as Element)) {
      const node = list.nodes.find((n) => n.id === addr.node) as Draft<Node> | undefined;
      if (!node) continue;

      if (curved) {
        node.type = 'smooth';
        ensureHandles(list.nodes as Draft<Node>[], node);
      } else {
        node.type = 'corner';
        delete node.in;
        delete node.out;
      }
      return;
    }
  });
}

/** True when this node carries any curvature. */
export function isCurvedNode(n: Node): boolean {
  return n.in !== undefined || n.out !== undefined;
}

/** Give a node handles when it is promoted out of `corner`. */
function ensureHandles(nodes: readonly Draft<Node>[], node: Draft<Node>): void {
  const i = nodes.indexOf(node);
  const prev = nodes[i - 1] ?? nodes[nodes.length - 1];
  const next = nodes[i + 1] ?? nodes[0];
  if (!prev || !next || prev === node || next === node) return;

  // Tangent parallel to the neighbours' chord: the standard smooth default.
  const tx = (next.p.x - prev.p.x) / 6;
  const ty = (next.p.y - prev.p.y) / 6;
  if (!node.in) node.in = { x: node.p.x - tx, y: node.p.y - ty };
  if (!node.out) node.out = { x: node.p.x + tx, y: node.p.y + ty };
}

/** Nearest half-unit. */
const half = (v: number): number => Math.round(v * 2) / 2;

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const t = closestTOnSegment(a, b, p);
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

function pickList(
  el: Draft<Element>,
  subId: Id | undefined,
): { nodes: Draft<Node>[]; closed: boolean } | null {
  if (el.kind === 'polyline') return { nodes: el.nodes, closed: el.closed };
  if (el.kind === 'path') {
    const sub = subId ? el.subpaths.find((s) => s.id === subId) : el.subpaths[0];
    return sub ? { nodes: sub.nodes, closed: sub.closed } : null;
  }
  return null;
}
