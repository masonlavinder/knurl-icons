import { beforeAll, describe, expect, it } from 'vitest';

import { registerNodeXmlParser } from '../../platform/xmlNode.ts';
import { corpusAvailable, loadCorpus } from '../../test/corpus/loadCorpus.ts';
import { comparePixels, GATE } from '../../test/raster/diff.ts';
import { resvgAvailable } from '../../test/raster/rasterize.ts';
import { serialize } from './export/serialize.ts';
import { parseSvg } from './import/parseSvg.ts';

beforeAll(() => {
  registerNodeXmlParser();
});

describe('serialize', () => {
  it('emits the upstream root format', () => {
    const src = [
      '<svg',
      '  xmlns="http://www.w3.org/2000/svg"',
      '  width="24"',
      '  height="24"',
      '  viewBox="0 0 24 24"',
      '  fill="none"',
      '  stroke="currentColor"',
      '  stroke-width="2"',
      '  stroke-linecap="round"',
      '  stroke-linejoin="round"',
      '>',
      '  <circle cx="12" cy="12" r="10" />',
      '  <path d="m16 9-5.5 5.5L8 12" />',
      '</svg>',
      '',
    ].join('\n');

    expect(serialize(parseSvg(src).value)).toBe(src);
  });

  it('applies SVG corner-radius defaulting so a lone ry stays rounded', () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<rect x="15" y="14" width="4" height="6" ry="2"/></svg>';
    // A missing rx defaults to ry; treating it as 0 would square the corners.
    expect(serialize(parseSvg(src).value)).toContain(
      '<rect width="4" height="6" x="15" y="14" rx="2" />',
    );
  });

  it('keeps primitives as primitives', () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="1" y1="2" x2="3" y2="4"/>' +
      '<ellipse cx="12" cy="5" rx="9" ry="3"/></svg>';
    const out = serialize(parseSvg(src).value);
    expect(out).toContain('<rect width="18" height="18" x="3" y="3" rx="2" />');
    expect(out).toContain('<line x1="1" x2="3" y1="2" y2="4" />');
    expect(out).toContain('<ellipse cx="12" cy="5" rx="9" ry="3" />');
  });

  it('preserves the currentColor dot that 10 upstream icons rely on', () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>';
    expect(serialize(parseSvg(src).value)).toContain(
      '<circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />',
    );
  });

  it('round-trips polygon as polygon, since closure changes stroking', () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<polygon points="12 2 2 7 12 12 22 7 12 2"/></svg>';
    expect(serialize(parseSvg(src).value)).toContain('<polygon points="12 2 2 7 12 12 22 7 12 2" />');
  });
});

/* ------------------------------------------------------------------ */
/* Corpus gates                                                        */
/* ------------------------------------------------------------------ */

describe.skipIf(!corpusAvailable())('corpus gate 1: idempotence', () => {
  it('serialize(parse(x)) is a byte-level fixed point', () => {
    const failures: string[] = [];
    for (const icon of loadCorpus()) {
      const once = serialize(parseSvg(icon.svg).value);
      const twice = serialize(parseSvg(once).value);
      if (once !== twice) failures.push(icon.name);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('imports every icon without an error diagnostic', () => {
    const failures: string[] = [];
    for (const icon of loadCorpus()) {
      const errs = parseSvg(icon.svg).diagnostics.filter((d) => d.severity === 'error');
      if (errs.length > 0) failures.push(`${icon.name}: ${errs.map((e) => e.code).join(',')}`);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });
});

/**
 * Icons whose pixel difference comes from a conversion we chose on purpose, not
 * from a defect. Each costs a handful of antialiased edge pixels at delta <= 64/255.
 *
 * This list must shrink, never grow. A new entry appearing here is a bug.
 */
const LOSSY = new Map<string, string>([
  // Sources carrying 4-5 decimals; we serialize 3. Max shift 0.0005 units.
  ['bell-check', 'source precision > 3dp'],
  ['rotate-3d', 'source precision > 3dp'],
  // Q/T elevated to C. The exact cubic controls are thirds, which 3dp rounding
  // cannot represent (1.666... -> 1.667).
  ['carrot', 'quadratic elevated to cubic'],
  ['flame', 'quadratic elevated to cubic'],
  ['paw-print', 'quadratic elevated to cubic'],
  ['waves-horizontal', 'quadratic elevated to cubic'],
  ['waves-vertical', 'quadratic elevated to cubic'],
  // Not a loss on our side. Upstream follows an absolute arc with a *relative*
  // command; resvg renders arcs by converting them to cubics, so its arc
  // endpoint carries a small numerical error that the relative offset then
  // measures from. We emit the absolute form, which re-anchors to the exact
  // coordinate. Verified in isolation: abs-vs-rel is pixel-identical after a
  // cubic and after a moveto, and differs only after an arc.
  ['map-pin-x', 'upstream relative-after-arc carries resvg arc-conversion drift'],
]);

describe.skipIf(!corpusAvailable() || !resvgAvailable())('corpus gate 2: pixel identity', () => {
  it('renders identically to upstream at every tier', () => {
    const icons = loadCorpus();
    const failures: string[] = [];
    const unexpectedlyClean: string[] = [];
    let worst16x = 0;

    for (const icon of icons) {
      const ours = serialize(parseSvg(icon.svg).value);
      const results = comparePixels(icon.svg, ours, GATE);
      const probe = results[results.length - 1]!;
      if (probe.maxDelta > worst16x) worst16x = probe.maxDelta;

      const bad = results.filter((r) => !r.pass);
      if (bad.length > 0 && !LOSSY.has(icon.name)) {
        failures.push(
          `${icon.name}: ` +
            bad.map((r) => `${r.scale}px ${r.differing}/${r.total} maxΔ${r.maxDelta}`).join(', '),
        );
      }
      if (bad.length === 0 && LOSSY.has(icon.name)) unexpectedlyClean.push(icon.name);
    }

    console.log(
      `[gate 2] ${icons.length - LOSSY.size} icons at hard pixel identity, ` +
        `${LOSSY.size} allowlisted, worst 384px channel delta ${worst16x}`,
    );
    expect(failures.slice(0, 10)).toEqual([]);
    // The allowlist is a debt register: entries that stop being needed come out.
    expect(unexpectedlyClean).toEqual([]);
  });
});

describe.skipIf(!corpusAvailable())('byte-identity drift metric (non-gating)', () => {
  it('reports how much of the corpus we reproduce exactly', () => {
    const icons = loadCorpus();
    let identical = 0;
    const causes = new Map<string, number>();

    for (const icon of icons) {
      const ours = serialize(parseSvg(icon.svg).value);
      if (ours === icon.svg) {
        identical += 1;
        continue;
      }
      const cause = classify(icon.svg, ours);
      causes.set(cause, (causes.get(cause) ?? 0) + 1);
    }

    const pct = ((100 * identical) / icons.length).toFixed(1);
    const breakdown = [...causes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c}=${n}`)
      .join(' ');
    console.log(`[byte-identity] ${identical}/${icons.length} (${pct}%)  ${breakdown}`);

    // Non-gating: asserted only as "we did not regress to nothing".
    expect(identical).toBeGreaterThan(0);
  });
});

/** Cheap mismatch classification, for the drift breakdown. */
function classify(upstream: string, ours: string): string {
  const u = upstream.trim();
  const o = ours.trim();
  if (u.replace(/\s+/g, '') === o.replace(/\s+/g, '')) return 'whitespace';
  if (/[Qq]/.test(u)) return 'quadratic-elevated';
  if (/\.\d{4,}/.test(u)) return 'precision';
  if (/<polygon/.test(u)) return 'polygon-to-polyline';
  if (/[0-9. ][01][01][0-9]/.test(u)) return 'arc-flag-packing';
  if (/[a-zA-Z]\.\d/.test(u)) return 'number-form';
  return 'other';
}
