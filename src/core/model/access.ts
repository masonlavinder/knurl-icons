import { asId, type Id } from '../ids.ts';
import type { Address, Element, IconDoc, Node, Pt, Subpath } from './types.ts';

/**
 * A polyline holds nodes directly; a path holds them inside subpaths. This is
 * the one place that difference is smoothed over, so callers can walk "the node
 * lists of an element" without branching on kind everywhere.
 */
export type NodeList = { subId: Id | null; nodes: Node[]; closed: boolean };

export function nodeListsOf(el: Element): NodeList[] {
  if (el.kind === 'polyline') return [{ subId: null, nodes: el.nodes, closed: el.closed }];
  if (el.kind === 'path') {
    return el.subpaths.map((s) => ({ subId: s.id, nodes: s.nodes, closed: s.closed }));
  }
  return [];
}

/**
 * Draggable control points for primitives, which have no node list of their own.
 *
 * A line's endpoints are as much "nodes" as a polyline's are, and it is odd for
 * one to be draggable and the other not. The ids are synthetic and stable
 * (derived from the field name), so an address survives edits the way a real
 * node id does.
 */
export type ControlPoint = { id: Id; p: Pt; label: string; field: string };

export function controlsOf(el: Element): ControlPoint[] {
  switch (el.kind) {
    case 'line':
      return [
        { id: asId('a'), p: el.a, label: 'Start', field: 'a' },
        { id: asId('b'), p: el.b, label: 'End', field: 'b' },
      ];
    case 'circle':
    case 'ellipse':
      return [{ id: asId('c'), p: el.c, label: 'Centre', field: 'c' }];
    default:
      return [];
  }
}

export const findControl = (el: Element, id: Id): ControlPoint | undefined =>
  controlsOf(el).find((c) => c.id === id);

export const findElement = (doc: IconDoc, id: Id): Element | undefined =>
  doc.elements.find((e) => e.id === id);

export const elementIndex = (doc: IconDoc, id: Id): number =>
  doc.elements.findIndex((e) => e.id === id);

export function findSubpath(el: Element, subId: Id): Subpath | undefined {
  return el.kind === 'path' ? el.subpaths.find((s) => s.id === subId) : undefined;
}

export function findNode(el: Element, nodeId: Id, subId?: Id): Node | undefined {
  for (const list of nodeListsOf(el)) {
    if (subId !== undefined && list.subId !== null && list.subId !== subId) continue;
    const n = list.nodes.find((x) => x.id === nodeId);
    if (n) return n;
  }
  return undefined;
}

export type Resolved =
  | { kind: 'element'; el: Element }
  | { kind: 'subpath'; el: Element; sub: Subpath }
  | { kind: 'node'; el: Element; node: Node }
  | { kind: 'control'; el: Element; control: ControlPoint }
  | { kind: 'handle'; el: Element; node: Node; handle: 'in' | 'out' }
  | { kind: 'segment'; el: Element; node: Node };

/**
 * Resolve an address against a document, or null when it no longer exists.
 *
 * Returning null rather than throwing is deliberate: selections routinely
 * outlive the geometry they point at, and repairing a stale selection is normal
 * control flow, not an error.
 */
export function resolveAddress(doc: IconDoc, addr: Address): Resolved | null {
  const el = findElement(doc, addr.el);
  if (!el) return null;

  const subId = 'sub' in addr ? addr.sub : undefined;

  if ('node' in addr) {
    const node = findNode(el, addr.node, subId);
    if (!node) {
      // Primitives expose synthetic control points instead of a node list.
      const control = findControl(el, addr.node);
      return control ? { kind: 'control', el, control } : null;
    }
    if ('handle' in addr) return { kind: 'handle', el, node, handle: addr.handle };
    if ('segment' in addr) return { kind: 'segment', el, node };
    return { kind: 'node', el, node };
  }

  if (subId !== undefined) {
    const sub = findSubpath(el, subId);
    return sub ? { kind: 'subpath', el, sub } : null;
  }

  return { kind: 'element', el };
}

export const addressExists = (doc: IconDoc, addr: Address): boolean =>
  resolveAddress(doc, addr) !== null;

/** Total node count, used for element-list labels and the NODE_COUNT lint. */
export function countNodes(el: Element): number {
  return nodeListsOf(el).reduce((n, l) => n + l.nodes.length, 0);
}

/** Human label for the element list. */
export function describeElement(el: Element): string {
  switch (el.kind) {
    case 'path': {
      const n = countNodes(el);
      const subs = el.subpaths.length;
      return subs > 1 ? `path (${n} nodes, ${subs} subpaths)` : `path (${n} nodes)`;
    }
    case 'polyline':
      return `${el.closed ? 'polygon' : 'polyline'} (${el.nodes.length} nodes)`;
    case 'circle':
      return 'circle';
    case 'ellipse':
      return 'ellipse';
    case 'rect':
      return 'rect';
    case 'line':
      return 'line';
  }
}
