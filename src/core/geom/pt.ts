import { EPS } from '../constants.ts';
import type { Pt } from '../model/types.ts';

export const pt = (x: number, y: number): Pt => ({ x, y });

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
export const len = (a: Pt): number => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const rot90 = (a: Pt): Pt => ({ x: -a.y, y: a.x });

export function norm(a: Pt): Pt {
  const l = Math.hypot(a.x, a.y);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function approxEq(a: Pt, b: Pt, eps = EPS): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

export function numEq(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

/** Rotate `a` about the origin by `theta` radians. */
export function rotate(a: Pt, theta: number): Pt {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}
