import { EPS } from '../../core/constants.ts';
import type { Node, Pt, Subpath } from '../../core/model/types.ts';

/**
 * Structural comparison with an epsilon.
 *
 * Never use `===` here. Parsing relative command chains accumulates float error
 * on the order of 1e-13 over a long path, which is far below anything visible
 * but fatal to exact equality.
 */
export function ptEq(a: Pt | undefined, b: Pt | undefined, eps = EPS): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

export function nodeEq(a: Node, b: Node, eps = EPS): boolean {
  if (!ptEq(a.p, b.p, eps)) return false;
  if (!ptEq(a.in, b.in, eps)) return false;
  if (!ptEq(a.out, b.out, eps)) return false;
  if ((a.arc === undefined) !== (b.arc === undefined)) return false;
  if (a.arc && b.arc) {
    if (Math.abs(a.arc.rx - b.arc.rx) > eps) return false;
    if (Math.abs(a.arc.ry - b.arc.ry) > eps) return false;
    if (Math.abs(a.arc.rot - b.arc.rot) > eps) return false;
    if (a.arc.largeArc !== b.arc.largeArc) return false;
    if (a.arc.sweep !== b.arc.sweep) return false;
  }
  return true;
}

export function subpathsEq(a: readonly Subpath[], b: readonly Subpath[], eps = EPS): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.closed !== y.closed) return false;
    if (x.nodes.length !== y.nodes.length) return false;
    for (let j = 0; j < x.nodes.length; j++) {
      if (!nodeEq(x.nodes[j]!, y.nodes[j]!, eps)) return false;
    }
  }
  return true;
}

/** First differing location, for readable test failures. */
export function describeSubpathDiff(a: readonly Subpath[], b: readonly Subpath[]): string {
  if (a.length !== b.length) return `subpath count ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.closed !== y.closed) return `subpath ${i} closed ${x.closed} vs ${y.closed}`;
    if (x.nodes.length !== y.nodes.length) {
      return `subpath ${i} node count ${x.nodes.length} vs ${y.nodes.length}`;
    }
    for (let j = 0; j < x.nodes.length; j++) {
      const n = x.nodes[j]!;
      const m = y.nodes[j]!;
      if (!nodeEq(n, m)) return `subpath ${i} node ${j}: ${fmt(n)} vs ${fmt(m)}`;
    }
  }
  return 'equal';
}

const p = (v: Pt | undefined): string => (v ? `(${v.x},${v.y})` : '-');
const fmt = (n: Node): string =>
  `p${p(n.p)} in${p(n.in)} out${p(n.out)}${n.arc ? ` arc(${n.arc.rx},${n.arc.ry},${n.arc.rot},${n.arc.largeArc ? 1 : 0},${n.arc.sweep ? 1 : 0})` : ''}`;
