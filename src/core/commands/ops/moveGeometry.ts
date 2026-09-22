import type { Draft } from 'immer';

import { controlsOf, nodeListsOf } from '../../model/access.ts';
import { normalizeAddrs } from '../../model/address.ts';
import type { Address, Element, IconDoc, Node, Pt } from '../../model/types.ts';
import { command, type Command } from '../types.ts';

/**
 * Move whatever the addresses point at by `delta`.
 *
 * `origin` is the document as it was when the gesture began, and every update
 * recomputes positions from it. Accumulating incremental deltas instead would
 * drift, would break when the browser coalesces pointer events, and would make
 * an exact cancel impossible. With absolute-from-origin the drag is idempotent:
 * the same delta always yields the same document.
 */
export function moveGeometry(
  origin: IconDoc,
  addrs: readonly Address[],
  delta: Pt,
  mergeKey: string,
  label = 'Move',
): Command {
  const targets = normalizeAddrs([...addrs]);

  return command(
    label,
    (draft) => {
      for (const addr of targets) {
        const originEl = origin.elements.find((e) => e.id === addr.el);
        const el = draft.elements.find((e) => e.id === addr.el);
        if (!originEl || !el) continue;

        if ('handle' in addr) {
          moveHandle(el, originEl, addr.node, addr.handle, delta);
        } else if ('node' in addr) {
          moveNode(el, originEl, addr.node, delta);
        } else if ('sub' in addr && addr.sub !== undefined) {
          moveSubpath(el, originEl, addr.sub, delta);
        } else {
          translateElement(el, originEl, delta);
        }
      }
    },
    { mergeKey },
  );
}

/* ------------------------------------------------------------------ */

const shift = (p: Pt, d: Pt): Pt => ({ x: p.x + d.x, y: p.y + d.y });

/** Moving an anchor carries its handles, so the curve shape is preserved. */
function moveNode(el: Draft<Element>, origin: Element, nodeId: string, d: Pt): void {
  // A primitive's endpoints are synthetic controls, not entries in a node list.
  const control = controlsOf(origin).find((c) => c.id === nodeId);
  if (control) {
    const target = (el as unknown as Record<string, Pt>)[control.field];
    const from = (origin as unknown as Record<string, Pt>)[control.field];
    if (target && from) {
      target.x = from.x + d.x;
      target.y = from.y + d.y;
    }
    return;
  }

  forEachNodePair(el, origin, (node, originNode) => {
    if (node.id !== nodeId) return;
    node.p = shift(originNode.p, d);
    if (node.in && originNode.in) node.in = shift(originNode.in, d);
    if (node.out && originNode.out) node.out = shift(originNode.out, d);
  });
}

/**
 * Moving one handle leaves the anchor alone, and mirrors onto the opposite
 * handle when the node is smooth or symmetric -- which is what makes a join
 * stay smooth while you drag it.
 */
function moveHandle(
  el: Draft<Element>,
  origin: Element,
  nodeId: string,
  which: 'in' | 'out',
  d: Pt,
): void {
  forEachNodePair(el, origin, (node, originNode) => {
    if (node.id !== nodeId) return;
    const from = originNode[which];
    if (!from) return;
    const moved = shift(from, d);
    node[which] = moved;

    if (node.type === 'corner') return;
    const other = which === 'in' ? 'out' : 'in';
    const originOther = originNode[other];
    if (!originOther) return;

    // Reflect through the anchor. Symmetric matches length too; smooth keeps
    // the opposite handle's own length and only follows the direction.
    const vx = node.p.x - moved.x;
    const vy = node.p.y - moved.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-9) return;

    const keep =
      node.type === 'symmetric'
        ? len
        : Math.hypot(originOther.x - originNode.p.x, originOther.y - originNode.p.y);
    node[other] = { x: node.p.x + (vx / len) * keep, y: node.p.y + (vy / len) * keep };
  });
}

function moveSubpath(el: Draft<Element>, origin: Element, subId: string, d: Pt): void {
  if (el.kind !== 'path' || origin.kind !== 'path') return;
  const sub = el.subpaths.find((s) => s.id === subId);
  const originSub = origin.subpaths.find((s) => s.id === subId);
  if (!sub || !originSub) return;
  sub.nodes.forEach((n, i) => translateNode(n, originSub.nodes[i], d));
}

export function translateElement(el: Draft<Element>, origin: Element, d: Pt): void {
  switch (el.kind) {
    case 'circle':
      if (origin.kind === 'circle') el.c = shift(origin.c, d);
      return;
    case 'ellipse':
      if (origin.kind === 'ellipse') el.c = shift(origin.c, d);
      return;
    case 'rect':
      if (origin.kind === 'rect') {
        el.x = origin.x + d.x;
        el.y = origin.y + d.y;
      }
      return;
    case 'line':
      if (origin.kind === 'line') {
        el.a = shift(origin.a, d);
        el.b = shift(origin.b, d);
      }
      return;
    case 'polyline':
      if (origin.kind === 'polyline') {
        el.nodes.forEach((n, i) => translateNode(n, origin.nodes[i], d));
      }
      return;
    case 'path':
      if (origin.kind === 'path') {
        el.subpaths.forEach((s, si) => {
          const os = origin.subpaths[si];
          if (os) s.nodes.forEach((n, i) => translateNode(n, os.nodes[i], d));
        });
      }
  }
}

function translateNode(n: Draft<Node> | undefined, origin: Node | undefined, d: Pt): void {
  if (!n || !origin) return;
  n.p = shift(origin.p, d);
  if (n.in && origin.in) n.in = shift(origin.in, d);
  if (n.out && origin.out) n.out = shift(origin.out, d);
}

function forEachNodePair(
  el: Draft<Element>,
  origin: Element,
  visit: (node: Draft<Node>, originNode: Node) => void,
): void {
  const originLists = nodeListsOf(origin);
  nodeListsOf(el as Element).forEach((list, li) => {
    const originList = originLists[li];
    if (!originList) return;
    list.nodes.forEach((n, i) => {
      const on = originList.nodes[i];
      if (on) visit(n as Draft<Node>, on);
    });
  });
}
