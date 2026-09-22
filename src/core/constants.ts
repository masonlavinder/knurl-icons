/**
 * House spec constants.
 *
 * Nothing in here is a magic number at a use site: screen-space quantities are
 * stored in *pixels* and divided by zoom where they are used, and the crispness
 * phase is derived from stroke width rather than hardcoded to 0.5.
 */

/** viewBox is 0 0 CANVAS CANVAS. */
export const CANVAS = 24;

/** Nominal padding, measured on the *visual* (stroked) bounding box. */
export const PADDING = 1;

/** House stroke width. */
export const STROKE_WIDTH = 2;

/**
 * Centerline padding. The visual box is the geometric box inflated by w/2, so
 * geometry must live in [PADDING + w/2, CANVAS - PADDING - w/2] = [2, 22].
 * This trips everyone up: nominal padding is 1, centerline padding is 2.
 */
export const GEOMETRIC_MIN = PADDING + STROKE_WIDTH / 2;
export const GEOMETRIC_MAX = CANVAS - PADDING - STROKE_WIDTH / 2;

/** Visual-box bounds. */
export const VISUAL_MIN = PADDING;
export const VISUAL_MAX = CANVAS - PADDING;

/**
 * Snap tolerance in *screen pixels*. Must be constant in screen space: a fixed
 * unit tolerance feels sticky zoomed in and useless zoomed out. Divide by zoom
 * at the use site via snapTolUnits().
 */
export const SNAP_TOL_PX = 6;

/**
 * Minimum grab width in *screen pixels* for hit targets, so thin geometry stays
 * grabbable at any zoom. Hit stroke width = max(strokeWidth, HIT_MIN_PX / zoom).
 */
export const HIT_MIN_PX = 10;

/**
 * How far the pointer may travel in *screen pixels* and still count as a click
 * rather than a drag. A click on empty canvas clears the selection and a drag
 * pans it, so this is what keeps a shaky hand from throwing away a selection.
 */
export const PAN_THRESHOLD_PX = 3;

/** Max deviation (icon units) tolerated when refitting two cubics into one. */
export const REFIT_TOL = 0.02;

/**
 * Serialized coordinate precision. Measured against the upstream corpus: 38% of
 * icons carry 3 decimals, and exactly 5 icons carry 4-5. Rounding those 5 shifts
 * geometry by <= 0.0005 units = 0.0013px at a 64px raster, i.e. invisible.
 */
export const DECIMALS = 3;

/** Epsilon for structural comparison. Relative-command parsing accumulates ~1e-13. */
export const EPS = 1e-9;

/** Angle snapping increment, radians. */
export const ANGLE_SNAP = Math.PI / 12; // 15 degrees

/** History depth. */
export const HISTORY_LIMIT = 200;

/**
 * Crispness phase for a given stroke width.
 *
 * A stroke of width w centered at x_c has edges at x_c +/- w/2. Those edges land
 * on device pixels exactly when x_c === w/2 (mod 1). So even widths want integer
 * centers and odd widths want half-integer centers. Derived, never hardcoded,
 * because a 1.5px variant set is a plausible v1.
 */
export function crispPhase(strokeWidth: number = STROKE_WIDTH): number {
  const phase = (strokeWidth / 2) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/** Snap a scalar to the nearest crisp position for the given stroke width. */
export function snapCrisp(v: number, strokeWidth: number = STROKE_WIDTH): number {
  const phase = crispPhase(strokeWidth);
  return Math.round(v - phase) + phase;
}

/** Snap tolerance expressed in icon units at a given zoom. */
export function snapTolUnits(zoom: number): number {
  return SNAP_TOL_PX / zoom;
}

/** Hit-target stroke width in icon units at a given zoom. */
export function hitWidthUnits(zoom: number, strokeWidth: number = STROKE_WIDTH): number {
  return Math.max(strokeWidth, HIT_MIN_PX / zoom);
}
