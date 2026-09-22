import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import lock from './corpus.lock.json' with { type: 'json' };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = join(ROOT, '.cache/lucide-corpus', lock.commit);

export type CorpusIcon = { name: string; svg: string };

export const corpusAvailable = (): boolean => existsSync(join(DIR, '.complete'));

export const CORPUS_HINT =
  `corpus not fetched -- run \`pnpm corpus:fetch\` (pinned to ${lock.repo}@${lock.commit.slice(0, 8)})`;

/**
 * Load the upstream corpus. Offline-first: reads the cache and never touches the
 * network, so a test run without the cache skips rather than hangs.
 */
export function loadCorpus(): CorpusIcon[] {
  if (!corpusAvailable()) throw new Error(CORPUS_HINT);

  const icons = readdirSync(DIR)
    .filter((f) => f.endsWith('.svg'))
    .sort()
    .map((f) => ({ name: f.replace(/\.svg$/, ''), svg: readFileSync(join(DIR, f), 'utf8') }));

  if (icons.length !== lock.count) {
    throw new Error(`corpus size ${icons.length} != locked ${lock.count}; re-run corpus:fetch`);
  }
  // Fail loudly if someone repoints this at `lucide-static`, whose dist injects a
  // class attribute -- gating against a different dialect would waste weeks.
  const tainted = icons.find((i) => i.svg.includes('class="lucide'));
  if (tainted) {
    throw new Error(
      `corpus icon "${tainted.name}" carries a class attribute: this is the ` +
        `lucide-static npm dist, not the repo source. Re-run corpus:fetch.`,
    );
  }
  return icons;
}

export { lock as corpusLock };
