#!/usr/bin/env node
/**
 * Byte-identity drift report (non-gating).
 *
 * Byte-identical round-tripping of the upstream corpus is impossible by
 * construction: the corpus contains at least two incompatible SVGO dialects, so
 * it is not the output of any single deterministic serializer. What IS useful is
 * tracking how much of it our canonical form happens to reproduce, broken down
 * by cause -- dialect drift then shows up as a number long before it becomes a
 * correctness problem.
 *
 * The actual gates live in src/core/io/roundtrip.test.ts.
 */
import { serialize } from '../src/core/io/export/serialize.ts';
import { parseSvg } from '../src/core/io/import/parseSvg.ts';
import { registerNodeXmlParser } from '../src/platform/xmlNode.ts';
import { loadCorpus } from '../src/test/corpus/loadCorpus.ts';

registerNodeXmlParser();

const icons = loadCorpus();
let identical = 0;
const causes = new Map<string, number>();
const samples = new Map<string, string>();

for (const icon of icons) {
  const ours = serialize(parseSvg(icon.svg).value);
  if (ours === icon.svg) {
    identical += 1;
    continue;
  }
  const cause = classify(icon.svg, ours);
  causes.set(cause, (causes.get(cause) ?? 0) + 1);
  if (!samples.has(cause)) samples.set(cause, icon.name);
}

const pct = ((100 * identical) / icons.length).toFixed(1);
console.log(`byte-identical: ${identical}/${icons.length} (${pct}%)\n`);
for (const [cause, n] of [...causes].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cause.padEnd(22)} ${String(n).padStart(5)}   e.g. ${samples.get(cause)}`);
}

function classify(upstream: string, ours: string): string {
  if (upstream.trim().replace(/\s+/g, '') === ours.trim().replace(/\s+/g, '')) return 'whitespace';
  if (/[Qq]/.test(upstream)) return 'quadratic-elevated';
  if (/\.\d{4,}/.test(upstream)) return 'precision';
  if (/<polygon/.test(upstream)) return 'polygon-to-polyline';
  if (/[0-9. ][01][01][0-9]/.test(upstream)) return 'arc-flag-packing';
  if (/[a-zA-Z]\.\d/.test(upstream)) return 'number-form';
  return 'other';
}
