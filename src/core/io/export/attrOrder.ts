import type { ElementKind } from '../../model/types.ts';

/** `polygon` is a serialized form of a closed polyline, not a model kind. */
export type TagName = ElementKind | 'polygon';

/**
 * Canonical attribute order.
 *
 * SVGO does not reorder attributes, so upstream's source order is the de-facto
 * convention and matching it is free byte-identity. `fill` is appended last,
 * only when present.
 *
 * These orders are measured against the corpus, not guessed.
 */
export const ATTR_ORDER: Record<TagName, readonly string[]> = {
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  // `width height x y` outnumbers `x y width height` 271 to 136 upstream.
  rect: ['width', 'height', 'x', 'y', 'rx', 'ry'],
  // All 135 upstream lines order the x pair before the y pair.
  line: ['x1', 'x2', 'y1', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  path: ['d'],
};

/**
 * Root <svg> attributes, in order. Each is emitted on its own line with the
 * closing `>` on a line of its own -- the verified upstream format.
 */
export const ROOT_ATTR_ORDER = [
  'xmlns',
  'width',
  'height',
  'viewBox',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
] as const;

export const SVG_NS = 'http://www.w3.org/2000/svg';
