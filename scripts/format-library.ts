/**
 * Rewrites every library icon as the editor's serializer output.
 *
 * An icon added by hand (or exported from another tool) only has to parse;
 * this puts it in house form — fixed attribute order, 2-space indent, no
 * editor metadata beyond what the model holds. src/library.test.ts fails on
 * any file that is not already in that form.
 *
 *   node scripts/format-library.ts           rewrite in place
 *   node scripts/format-library.ts --check   list what would change; exit 1
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serialize } from '../src/core/io/export/serialize.ts';
import { parseSvg } from '../src/core/io/import/parseSvg.ts';
import { registerNodeXmlParser } from '../src/utils/xmlNode.ts';

const icons = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'library', 'icons');
const check = process.argv.includes('--check');

registerNodeXmlParser();
let changed = 0;
for (const file of readdirSync(icons).filter((f) => f.endsWith('.svg')).sort()) {
  const path = join(icons, file);
  const src = readFileSync(path, 'utf8');
  const out = serialize({ ...parseSvg(src).value, name: file.replace(/\.svg$/, '') });
  if (out === src) continue;
  changed++;
  console.log(`${check ? 'unformatted' : 'formatted'}  library/icons/${file}`);
  if (!check) writeFileSync(path, out);
}
if (check && changed > 0) process.exit(1);
