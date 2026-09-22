#!/usr/bin/env node
/**
 * Fetch the upstream Lucide icon corpus into .cache/ for the round-trip gates.
 *
 * Pinned by commit sha, not tag, and verified against a committed lock so the
 * gates can't silently drift when upstream lands new icons. The cache is
 * gitignored: committing 2102 files would bury every real diff in noise.
 *
 * Source is the GitHub repo's icons/*.svg -- NOT `lucide-static` on npm, whose
 * dist injects a class="lucide lucide-*" attribute the repo files don't have.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { extract } from 'tar';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, 'src/test/corpus/corpus.lock.json');

const lock = JSON.parse(await readFile(LOCK, 'utf8'));
const dest = join(ROOT, '.cache/lucide-corpus', lock.commit);

if (existsSync(join(dest, '.complete'))) {
  console.log(`corpus already present: ${dest}`);
  process.exit(0);
}

const url = `https://codeload.github.com/${lock.repo}/tar.gz/${lock.commit}`;
console.log(`fetching ${url}`);

const res = await fetch(url);
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
const buf = Buffer.from(await res.arrayBuffer());

const sha256 = createHash('sha256').update(buf).digest('hex');
if (lock.sha256 && lock.sha256 !== sha256) {
  throw new Error(`tarball sha256 mismatch\n  expected ${lock.sha256}\n  actual   ${sha256}`);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

// Keep only icons/*.svg, flattened.
await pipeline(
  Readable.from(buf),
  createGunzip(),
  extract({
    cwd: dest,
    strip: 2,
    filter: (p) => /^[^/]+\/icons\/[^/]+\.svg$/.test(p),
  }),
);

const { readdir } = await import('node:fs/promises');
const files = (await readdir(dest)).filter((f) => f.endsWith('.svg'));
if (files.length !== lock.count) {
  throw new Error(`expected ${lock.count} icons, extracted ${files.length}`);
}

await writeFile(join(dest, '.complete'), sha256);
if (!lock.sha256) {
  console.log(`\nlock has no sha256 -- record this one:\n  "sha256": "${sha256}"\n`);
}
console.log(`extracted ${files.length} icons -> ${dest}`);
