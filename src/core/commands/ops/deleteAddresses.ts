import type { Draft } from 'immer';

import type { Id } from '../../ids.ts';
import { normalizeAddrs } from '../../model/address.ts';
import { nodeListsOf } from '../../model/access.ts';
import type { Address, Element, IconDoc, Node, Selection } from '../../model/types.ts';
import { mergeSegments } from '../../geom/refit.ts';
import { command, type Command } from '../types.ts';

export type DeleteMode =
  /** Remove the node and rejoin its neighbours with a refitted curve. */
  | 'rejoin'
  /** Remove the node and split the subpath there. */
  | 'split';

/**
 * Delete everything the selection addresses.
 *
 * Four things make this correct, and naive implementations miss all of them:
 *
 *  1. Dominated addresses are dropped first. A selection holding both {el} and a
 *     node inside it would otherwise delete the element and then hunt for a node
 *     that no longer exists.
 *  2. Nodes are removed by descending index, so earlier removals don't shift the
 *     positions of later ones.
 *  3. Emptied containers cascade: a subpath below two nodes goes, and a path with
 *     no subpaths left goes with it.
 *  4. Selection is recomputed to the nearest survivor. Skipping this is a direct
 *     M0 gate failure -- the second Del keystroke silently does nothing because
 *     the selection still points at deleted geometry.
 */
export function deleteAddresses(addrs: Address[], mode: DeleteMode = 'rejoin'): Command {
  const targets = normalizeAddrs(addrs);
  const label = describeDeletion(targets);

  return command(
    label,
    (draft) => {
      applyDeletion(draft, targets, mode);
    },
    { selectionAfter: (doc, prev) => nearestSurvivor(doc, prev, targets) },
  );
}

function applyDeletion(draft: Draft<IconDoc>, targets: Address[], mode: DeleteMode): void {
  const wholeElements = new Set<Id>();
  const subpathTargets = new Map<Id, Set<Id>>();
  // element id -> subpath id (or '' for a polyline's implicit list) -> node ids
  const nodeTargets = new Map<Id, Map<string, Set<Id>>>();

  for (const a of targets) {
    if ('node' in a) {
      if ('handle' in a) continue; // handled separately below
      const byList = nodeTargets.get(a.el) ?? new Map<string, Set<Id>>();
      const key = 'sub' in a && a.sub !== undefined ? a.sub : '';
      const set = byList.get(key) ?? new Set<Id>();
      set.add(a.node);
      byList.set(key, set);
      nodeTargets.set(a.el, byList);
    } else if ('sub' in a && a.sub !== undefined) {
      const set = subpathTargets.get(a.el) ?? new Set<Id>();
      set.add(a.sub);
      subpathTargets.set(a.el, set);
    } else {
      wholeElements.add(a.el);
    }
  }

  // Clearing a handle is a degenerate "delete": the segment straightens.
  for (const a of targets) {
    if (!('handle' in a)) continue;
    const el = draft.elements.find((e) => e.id === a.el);
    if (!el) continue;
    for (const list of nodeListsOf(el as Element)) {
      const node = list.nodes.find((n) => n.id === a.node);
      if (node) delete node[a.handle];
    }
  }

  for (const [elId, subIds] of subpathTargets) {
    const el = draft.elements.find((e) => e.id === elId);
    if (el?.kind !== 'path') continue;
    el.subpaths = el.subpaths.filter((s) => !subIds.has(s.id));
  }

  for (const [elId, byList] of nodeTargets) {
    const el = draft.elements.find((e) => e.id === elId);
    if (!el) continue;
    for (const [key, ids] of byList) {
      if (el.kind === 'polyline') {
        removeNodes(el.nodes, ids, el.closed, mode);
      } else if (el.kind === 'path') {
        for (const sub of el.subpaths) {
          if (key !== '' && sub.id !== key) continue;
          removeNodes(sub.nodes, ids, sub.closed, mode);
          if (mode === 'split') sub.closed = false;
        }
      }
    }
  }

  // Cascade: drop emptied containers, then emptied elements.
  for (const el of draft.elements) {
    if (el.kind === 'path') el.subpaths = el.subpaths.filter((s) => s.nodes.length >= 2);
  }
  draft.elements = draft.elements.filter((el) => {
    if (wholeElements.has(el.id)) return false;
    if (el.kind === 'path') return el.subpaths.length > 0;
    if (el.kind === 'polyline') return el.nodes.length >= 2;
    return true;
  });
}

/**
 * Remove nodes from one list, rejoining the gap.
 *
 * Descending order matters: removing index 2 before index 5 would shift 5.
 */
function removeNodes(
  nodes: Draft<Node>[],
  ids: Set<Id>,
  closed: boolean,
  mode: DeleteMode,
): void {
  const indices = nodes
    .map((n, i) => (ids.has(n.id) ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => b - a);

  for (const i of indices) {
    if (mode === 'rejoin') rejoinAround(nodes, i, closed);
    nodes.splice(i, 1);
  }
}

/**
 * Refit the two segments meeting at `nodes[i]` into one before the node goes.
 *
 * Leaving the neighbours' handles untouched is what produces the kinked join
 * most editors leave behind.
 */
function rejoinAround(nodes: Draft<Node>[], i: number, closed: boolean): void {
  const n = nodes.length;
  if (n < 3) return;

  const prevIdx = i - 1 < 0 ? (closed ? n - 1 : -1) : i - 1;
  const nextIdx = i + 1 >= n ? (closed ? 0 : -1) : i + 1;
  if (prevIdx < 0 || nextIdx < 0) return; // endpoint of an open path: nothing to rejoin

  const prev = nodes[prevIdx]!;
  const mid = nodes[i]!;
  const next = nodes[nextIdx]!;

  const fit = mergeSegments(
    { p: prev.p, out: prev.out },
    { p: mid.p, in: mid.in, out: mid.out, arc: mid.arc },
    { p: next.p, in: next.in, arc: next.arc },
  );
  if (!fit) return;

  if (fit.kind === 'line') {
    delete prev.out;
    delete next.in;
    delete next.arc;
    return;
  }

  prev.out = fit.c1;
  next.in = fit.c2;
  // An arc cannot express the refitted shape, so the joined segment becomes a
  // cubic and the arc parameters are dropped.
  delete next.arc;
  // Deleting a node changes a neighbour handle's length. If that neighbour was
  // symmetric, mirroring the change onto its other handle would swing the far
  // segment: demote to smooth instead. Changing a handle's length is nearly
  // invisible; changing its direction is a visible kink.
  if (prev.type === 'symmetric') prev.type = 'smooth';
  if (next.type === 'symmetric') next.type = 'smooth';
}

function describeDeletion(targets: Address[]): string {
  if (targets.length === 0) return 'Delete';
  if (targets.length > 1) return `Delete ${targets.length} items`;
  const a = targets[0]!;
  if ('handle' in a) return 'Clear handle';
  if ('segment' in a) return 'Delete segment';
  if ('node' in a) return 'Delete node';
  if ('sub' in a && a.sub !== undefined) return 'Delete subpath';
  return 'Delete element';
}

/**
 * Where selection lands after a delete: prefer a sibling in the same container,
 * then the container itself, then nothing.
 */
function nearestSurvivor(doc: IconDoc, prev: Selection, targets: Address[]): Selection {
  const survivors = prev.addrs.filter(
    (a) => !targets.some((t) => JSON.stringify(t) === JSON.stringify(a)),
  );
  const stillThere = survivors.filter((a) => doc.elements.some((e) => e.id === a.el));
  if (stillThere.length > 0) return { addrs: stillThere };

  const parentEl = targets[0]?.el;
  if (parentEl !== undefined && doc.elements.some((e) => e.id === parentEl)) {
    return { addrs: [{ el: parentEl }] };
  }
  return { addrs: [] };
}
