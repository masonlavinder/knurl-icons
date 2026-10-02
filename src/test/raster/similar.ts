import { serialize } from '../../core/io/export/serialize.ts';
import { parseSvg } from '../../core/io/import/parseSvg.ts';
import { rasterize } from './rasterize.ts';

/**
 * Is this icon one we already have, or one of Lucide's?
 *
 * Two tests, because copies come in two kinds. A straight copy has the same
 * geometry once both sides go through the serializer, whatever order or
 * encoding it arrived in. A re-encoded copy (a path split in two, a circle
 * drawn as arcs) has different elements but the same picture, which only a
 * raster comparison sees.
 *
 * Calibrated on the pinned Lucide corpus, and the calibration sets the limits
 * of what a machine can decide here. Its most alike pairs of *different* icons
 * (lock / lock-open, monitor / tv-minimal) overlap by up to 0.96, while the
 * same drawing nudged a quarter of a unit falls to about 0.85. No threshold
 * separates "redrawn copy" from "legitimate variant", so only what renders as
 * practically the same picture is refused outright, and everything from
 * NOTE_AT up is put in front of the reviewer, who decides.
 */
export const COPY_AT = 0.97;
export const NOTE_AT = 0.85;

/** Big enough that a 2px stroke is 4px of ink, small enough to stay cheap. */
const SCALE = 48;

export type Candidate = { name: string; source: 'library' | 'lucide'; svg: string };
export type Match = { name: string; source: Candidate['source']; overlap: number; exact: boolean };

/**
 * The geometry alone, in a fixed order: element lines from the serializer,
 * names stripped, sorted. Equal keys mean the same drawing.
 */
export function geometryKey(svg: string): string {
  return serialize(parseSvg(svg).value)
    .split('\n')
    .filter((l) => l.startsWith('  <'))
    .map((l) => l.trim().replace(/ data-name="[^"]*"/, ''))
    .sort()
    .join('\n');
}

/** Which pixels carry ink, rendered black on white. */
export function inkMask(svg: string): Uint8Array {
  const { pixels, width, height } = rasterize(svg, SCALE);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4]! < 128 ? 1 : 0;
  return mask;
}

/**
 * Shared ink over combined ink. Measured against the union rather than the
 * whole canvas, because most of every icon is empty and would make any two
 * look alike.
 */
export function overlap(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    both += a[i]! & b[i]!;
    either += a[i]! | b[i]!;
  }
  return either === 0 ? 1 : both / either;
}

/** Every candidate at NOTE_AT or above, closest first. */
export function findMatches(svg: string, candidates: readonly Candidate[]): Match[] {
  const key = geometryKey(svg);
  const mask = inkMask(svg);
  return candidates
    .map((c) => {
      const exact = geometryKey(c.svg) === key;
      return { name: c.name, source: c.source, exact, overlap: exact ? 1 : overlap(mask, inkMask(c.svg)) };
    })
    .filter((m) => m.exact || m.overlap >= NOTE_AT)
    .sort((a, b) => b.overlap - a.overlap);
}

export const isCopy = (m: Match): boolean => m.exact || m.overlap >= COPY_AT;

export const describeMatch = (m: Match): string =>
  `${m.source === 'lucide' ? "Lucide's" : 'our'} \`${m.name}\` (${m.exact ? 'identical geometry' : `${Math.round(m.overlap * 100)}% overlap`})`;
