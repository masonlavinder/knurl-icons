/**
 * Syncs the vendored copy of @knurled/kit's stylesheets.
 *
 * knurl-icons lives in its own repository because a GitHub repo can publish
 * exactly one Pages site, and knurled-studio already publishes knurled.studio.
 * So the kit cannot be a workspace dependency here, and these files are a
 * mirror instead.
 *
 *   node scripts/sync-kit.mjs --check    verify the mirror matches upstream
 *   node scripts/sync-kit.mjs            pull upstream over the mirror
 *
 * Upstream defaults to ../knurled-studio next to this checkout; override with
 * KNURLED_STUDIO. --check is what keeps "vendored" from meaning "forked": it
 * reports drift and exits non-zero, and a clean run is the whole report.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What is mirrored, as upstream path -> local path.
 *
 * The four stylesheets are consumed verbatim. The stylelint config comes along
 * because it is what actually enforces the brand — a banned border-radius
 * fails the build here for the same reason it does in the studio.
 *
 * Components are NOT mirrored: src/brand reimplements them against the dark
 * work surface, so copying them would overwrite a deliberate adaptation.
 */
const FILES = [
  ['packages/kit/src/tokens.css', 'tokens.css'],
  ['packages/kit/src/global.css', 'global.css'],
  ['packages/kit/src/patterns.css', 'patterns.css'],
  ['packages/kit/src/fonts.css', 'fonts.css'],
  ['packages/stylelint-config/index.js', 'stylelint-config.js'],
];

const here = dirname(fileURLToPath(import.meta.url));
const mirror = resolve(here, '..', 'vendor', 'knurled-kit');
const studio = process.env.KNURLED_STUDIO ?? resolve(here, '..', '..', 'knurled-studio');

const check = process.argv.includes('--check');

const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

async function read(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

let drifted = 0;
let missing = 0;

for (const [from, file] of FILES) {
  const source = await read(join(studio, from));

  if (source === null) {
    console.error(`  MISSING  ${file} — no ${from} under ${studio}`);
    missing += 1;
    continue;
  }

  const current = await read(join(mirror, file));

  if (current === source) {
    console.log(`  ok       ${file}  ${digest(source)}`);
    continue;
  }

  drifted += 1;

  if (check) {
    console.error(
      `  DRIFT    ${file}  mirror ${current === null ? '(absent)' : digest(current)} != upstream ${digest(source)}`,
    );
    continue;
  }

  await writeFile(join(mirror, file), source);
  console.log(`  updated  ${file}  -> ${digest(source)}`);
}

if (missing > 0) {
  console.error(`\n${String(missing)} file(s) missing upstream. Is KNURLED_STUDIO set correctly? (${studio})`);
  process.exit(2);
}

if (check && drifted > 0) {
  console.error(`\n${String(drifted)} file(s) drifted. Run: pnpm kit:sync`);
  process.exit(1);
}

console.log(drifted === 0 ? '\nMirror is current.' : `\nMirror updated: ${String(drifted)} file(s).`);
