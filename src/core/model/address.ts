import { asId, type Id } from '../ids.ts';
import type { Address, Selection } from './types.ts';

/**
 * Serialized address, used as a DOM `data-addr` attribute, a React key, and a
 * Set member for O(1) "is selected" checks.
 *
 * One attribute rather than four: atomic (no partially-updated states) and
 * directly comparable.
 */
export type AddrKey = string;

export function encodeAddr(a: Address): AddrKey {
  let k = `e:${a.el}`;
  if ('sub' in a && a.sub !== undefined) k += `/s:${a.sub}`;
  if ('node' in a) k += `/n:${a.node}`;
  if ('handle' in a) k += `/h:${a.handle}`;
  if ('segment' in a) k += '/seg';
  return k;
}

export function decodeAddr(k: AddrKey): Address | null {
  const parts = k.split('/');
  let el: Id | undefined;
  let sub: Id | undefined;
  let node: Id | undefined;
  let handle: 'in' | 'out' | undefined;
  let segment = false;

  for (const part of parts) {
    const i = part.indexOf(':');
    const tag = i === -1 ? part : part.slice(0, i);
    const val = i === -1 ? '' : part.slice(i + 1);
    switch (tag) {
      case 'e':
        el = asId(val);
        break;
      case 's':
        sub = asId(val);
        break;
      case 'n':
        node = asId(val);
        break;
      case 'h':
        if (val !== 'in' && val !== 'out') return null;
        handle = val;
        break;
      case 'seg':
        segment = true;
        break;
      default:
        return null;
    }
  }

  if (el === undefined) return null;
  if (handle !== undefined) {
    if (node === undefined) return null;
    return sub === undefined ? { el, node, handle } : { el, sub, node, handle };
  }
  if (segment) {
    if (node === undefined) return null;
    return sub === undefined ? { el, node, segment: true } : { el, sub, node, segment: true };
  }
  if (node !== undefined) {
    return sub === undefined ? { el, node } : { el, sub, node };
  }
  if (sub !== undefined) return { el, sub };
  return { el };
}

export function addrEq(a: Address, b: Address): boolean {
  return encodeAddr(a) === encodeAddr(b);
}

/** Granularity, coarse to fine. Used for promotion and dominance. */
export function addrLevel(a: Address): 0 | 1 | 2 | 3 {
  if ('handle' in a) return 3;
  if ('node' in a || 'segment' in a) return 2;
  if ('sub' in a && a.sub !== undefined) return 1;
  return 0;
}

/**
 * True when `a` is an ancestor of `b`: selecting `{el}` implies every node
 * inside it. Deleting both would otherwise delete twice.
 */
export function dominates(a: Address, b: Address): boolean {
  if (a.el !== b.el) return false;
  if (addrEq(a, b)) return false;
  const la = addrLevel(a);
  const lb = addrLevel(b);
  if (la >= lb) return false;
  if (la === 0) return true;
  const aSub = 'sub' in a ? a.sub : undefined;
  const bSub = 'sub' in b ? b.sub : undefined;
  if (aSub !== undefined && aSub !== bSub) return false;
  if (la === 1) return true;
  // la === 2: a is a node/segment, b must be a handle on the same node
  const aNode = 'node' in a ? a.node : undefined;
  const bNode = 'node' in b ? b.node : undefined;
  return aNode !== undefined && aNode === bNode;
}

/**
 * Drop dominated addresses, dedupe, and order stably.
 *
 * Mandatory before any delete: without it, a selection holding both `{el}` and
 * `{el,node}` deletes the element and then tries to delete a node inside it.
 */
export function normalizeAddrs(addrs: Address[]): Address[] {
  const seen = new Set<AddrKey>();
  const unique: Address[] = [];
  for (const a of addrs) {
    const k = encodeAddr(a);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(a);
  }
  const kept = unique.filter((a) => !unique.some((b) => dominates(b, a)));
  kept.sort((x, y) => encodeAddr(x).localeCompare(encodeAddr(y)));
  return kept;
}

export function normalizeSelection(sel: Selection): Selection {
  const addrs = normalizeAddrs(sel.addrs);
  if (sel.anchor !== undefined && addrs.some((a) => addrEq(a, sel.anchor!))) {
    return { addrs, anchor: sel.anchor };
  }
  return { addrs };
}

/** Promote an address to whole-element (Shift+click) or whole-subpath (Alt+click). */
export function promoteToElement(a: Address): Address {
  return { el: a.el };
}

export function promoteToSubpath(a: Address): Address {
  const sub = 'sub' in a ? a.sub : undefined;
  return sub === undefined ? { el: a.el } : { el: a.el, sub };
}

export function addrsToKeySet(addrs: Address[]): Set<AddrKey> {
  return new Set(addrs.map(encodeAddr));
}
