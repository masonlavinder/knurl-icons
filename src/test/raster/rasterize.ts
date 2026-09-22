import { Resvg } from '@resvg/resvg-js';

export type Raster = { width: number; height: number; pixels: Buffer };

/**
 * Normalization applied IDENTICALLY to both sides of a comparison.
 *
 * Asymmetric preprocessing would invalidate the whole test, so this must never
 * branch on which side it is rendering. `currentColor` needs a concrete value,
 * and an opaque background removes alpha-compositing as a variable.
 */
export function prepareForRaster(svg: string): string {
  return svg.replace(/<svg\b/, '<svg color="#000000"');
}

export function rasterize(svg: string, width: number): Raster {
  const r = new Resvg(prepareForRaster(svg), {
    fitTo: { mode: 'width', value: width },
    background: 'white',
    shapeRendering: 2, // geometricPrecision
    // Scanning system fonts dominates construction cost (~150ms/icon) and a
    // stroke icon never contains text, so skip it entirely.
    font: { loadSystemFonts: false },
  });
  const img = r.render();
  return { width: img.width, height: img.height, pixels: img.pixels };
}

export function resvgAvailable(): boolean {
  try {
    rasterize(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>',
      16,
    );
    return true;
  } catch {
    return false;
  }
}
