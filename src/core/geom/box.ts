import type { Pt } from '../model/types.ts';

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export const EMPTY_BOX: Box = {
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
};

export function isEmpty(b: Box): boolean {
  return b.minX > b.maxX || b.minY > b.maxY;
}

export function fromPts(pts: readonly Pt[]): Box {
  let box = EMPTY_BOX;
  for (const p of pts) box = extend(box, p);
  return box;
}

export function extend(b: Box, p: Pt): Box {
  return {
    minX: Math.min(b.minX, p.x),
    minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x),
    maxY: Math.max(b.maxY, p.y),
  };
}

export function union(a: Box, b: Box): Box {
  if (isEmpty(a)) return b;
  if (isEmpty(b)) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Grow on all sides. Exact for round caps and round joins. */
export function inflate(b: Box, d: number): Box {
  if (isEmpty(b)) return b;
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

export function contains(b: Box, p: Pt): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

export function containsBox(outer: Box, inner: Box): boolean {
  if (isEmpty(inner)) return true;
  if (isEmpty(outer)) return false;
  return (
    inner.minX >= outer.minX &&
    inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX &&
    inner.maxY <= outer.maxY
  );
}

export function intersects(a: Box, b: Box): boolean {
  if (isEmpty(a) || isEmpty(b)) return false;
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

export const width = (b: Box): number => (isEmpty(b) ? 0 : b.maxX - b.minX);
export const height = (b: Box): number => (isEmpty(b) ? 0 : b.maxY - b.minY);
export const center = (b: Box): Pt => ({
  x: (b.minX + b.maxX) / 2,
  y: (b.minY + b.maxY) / 2,
});
