/**
 * A stable, subtle colour per node.
 *
 * The same index yields the same hue on the canvas and in the element tree, so
 * a ring around a dot and the swatch beside its row are recognisably the same
 * node. Hues advance by the golden angle, which keeps adjacent nodes far apart
 * in colour without anyone choosing a palette.
 *
 * Saturation and lightness stay low and fixed: this is a quiet index, not a
 * highlight, and it must never compete with the selection colour.
 */
const GOLDEN_ANGLE = 137.508;

export function nodeHue(index: number): number {
  return (index * GOLDEN_ANGLE + 205) % 360;
}

/** Ring and swatch colour. */
export function nodeColor(index: number, alpha = 1): string {
  const h = nodeHue(index);
  return alpha >= 1 ? `hsl(${h} 52% 64%)` : `hsl(${h} 52% 64% / ${alpha})`;
}
