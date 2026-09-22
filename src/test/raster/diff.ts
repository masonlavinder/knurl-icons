import { rasterize, type Raster } from './rasterize.ts';

export type DiffPolicy = {
  /** Render width in px. */
  scale: number;
  /** Per-channel delta tolerated without counting a pixel as different. */
  maxChannelDelta: number;
  /** Fraction of pixels allowed to exceed maxChannelDelta. */
  maxDiffRatio: number;
};

/**
 * Both sides go through the SAME renderer, so this is a self-consistency test,
 * not a cross-renderer comparison -- resvg-vs-browser stroke differences are
 * irrelevant here.
 *
 * The 1x tier is the real gate ("does it look identical"). The larger tiers are
 * geometry-sensitivity probes: a coordinate typo that 1x antialiasing would blur
 * away shows up clearly at 16x.
 */
export const GATE: readonly DiffPolicy[] = [
  { scale: 24, maxChannelDelta: 0, maxDiffRatio: 0 },
  { scale: 96, maxChannelDelta: 1, maxDiffRatio: 0 },
  { scale: 384, maxChannelDelta: 2, maxDiffRatio: 0.0005 },
];

export type DiffResult = {
  scale: number;
  differing: number;
  total: number;
  ratio: number;
  maxDelta: number;
  pass: boolean;
};

export function diffRasters(a: Raster, b: Raster, policy: DiffPolicy): DiffResult {
  const total = a.width * a.height;
  if (a.width !== b.width || a.height !== b.height) {
    return { scale: policy.scale, differing: total, total, ratio: 1, maxDelta: 255, pass: false };
  }

  let differing = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(a.pixels[i + c]! - b.pixels[i + c]!);
      if (delta > d) d = delta;
    }
    if (d > maxDelta) maxDelta = d;
    if (d > policy.maxChannelDelta) differing += 1;
  }

  const ratio = total === 0 ? 0 : differing / total;
  return {
    scale: policy.scale,
    differing,
    total,
    ratio,
    maxDelta,
    pass: ratio <= policy.maxDiffRatio,
  };
}

export function comparePixels(
  svgA: string,
  svgB: string,
  policies: readonly DiffPolicy[] = GATE,
): DiffResult[] {
  return policies.map((p) => diffRasters(rasterize(svgA, p.scale), rasterize(svgB, p.scale), p));
}
