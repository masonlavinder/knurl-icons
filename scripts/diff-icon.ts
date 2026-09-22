#!/usr/bin/env node
/**
 * Show how our serialization differs from upstream for named icons.
 *
 *   node scripts/diff-icon.ts umbrella circle-check
 *
 * With no arguments, prints the first few mismatching icons in the corpus.
 */
import { serialize } from '../src/core/io/export/serialize.ts';
import { parseSvg } from '../src/core/io/import/parseSvg.ts';
import { registerNodeXmlParser } from '../src/platform/xmlNode.ts';
import { loadCorpus } from '../src/test/corpus/loadCorpus.ts';

registerNodeXmlParser();

const wanted = new Set(process.argv.slice(2));
const icons = loadCorpus();
let shown = 0;

for (const icon of icons) {
  if (wanted.size > 0 && !wanted.has(icon.name)) continue;
  const ours = serialize(parseSvg(icon.svg).value);
  if (wanted.size === 0) {
    if (ours === icon.svg) continue;
    if (shown >= 5) break;
    shown += 1;
  }

  console.log(`=== ${icon.name}${ours === icon.svg ? ' (identical)' : ''} ===`);
  const a = icon.svg.split('\n');
  const b = ours.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    console.log(`  up: ${a[i] ?? '<none>'}`);
    console.log(`  us: ${b[i] ?? '<none>'}`);
  }
}
