/**
 * Turns an icon-submission issue into library files.
 *
 * Run by .github/workflows/accept-icon.yml, which passes the issue through the
 * environment — never through the shell — because the body is untrusted text:
 *
 *   ISSUE_TITLE   `Icon: <name>`, where the name comes from
 *   ISSUE_BODY    the filed issue-form body
 *   ISSUE_AUTHOR  the submitter's GitHub login, credited as contributor
 *   CLAIMED       names other open submissions already hold, as
 *                 `name:#pr` pairs separated by commas
 *
 * Besides the rules in acceptSubmission, the icon is cross-checked against
 * the library and the pinned Lucide corpus (src/test/raster/similar.ts): a
 * copy of either is refused, and a near match is noted for the reviewer.
 *
 * On success it writes library/icons/<name>.svg and .json, reports `name` on
 * GITHUB_OUTPUT, and writes any near matches to similar.md for the PR body.
 * On refusal it writes the reasons to accept-error.md, for the workflow to
 * post on the issue, and exits 1.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { corpusAvailable, CORPUS_HINT, loadCorpus } from '../src/test/corpus/loadCorpus.ts';
import {
  type Candidate,
  describeMatch,
  findMatches,
  isCopy,
} from '../src/test/raster/similar.ts';
import { acceptSubmission, parseSubmission } from '../src/utils/submission.ts';
import { registerNodeXmlParser } from '../src/utils/xmlNode.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const library = join(root, 'library');
const icons = join(library, 'icons');
const categories = Object.keys(JSON.parse(readFileSync(join(library, 'categories.json'), 'utf8')));

const title = process.env.ISSUE_TITLE ?? '';
const body = process.env.ISSUE_BODY ?? '';
const author = process.env.ISSUE_AUTHOR ?? '';
const claimed = new Map(
  (process.env.CLAIMED ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => pair.split(':') as [string, string]),
);

function refuse(problems: string[]): never {
  const report = [
    'This submission could not be added to the library:',
    '',
    ...problems.map((p) => `- ${p}`),
    '',
    'Edit the issue to fix these and this check runs again.',
  ].join('\n');
  writeFileSync(join(root, 'accept-error.md'), `${report}\n`);
  console.error(report);
  process.exit(1);
}

registerNodeXmlParser();
const result = acceptSubmission(
  parseSubmission(title, body),
  author,
  (name) => existsSync(join(icons, `${name}.svg`)),
  categories,
);
if (!result.ok) refuse(result.problems);

const pr = claimed.get(result.name);
if (pr) refuse([`An open submission already uses the name "${result.name}" (${pr}).`]);

// The corpus is fetched by the workflow. Without it the Lucide half of the
// check would silently pass everything, so its absence is an error.
if (!corpusAvailable()) throw new Error(CORPUS_HINT);
const candidates: Candidate[] = [
  ...readdirSync(icons)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => ({
      name: f.replace(/\.svg$/, ''),
      source: 'library' as const,
      svg: readFileSync(join(icons, f), 'utf8'),
    })),
  ...loadCorpus().map((c) => ({ ...c, source: 'lucide' as const })),
];
const matches = findMatches(result.svg, candidates);
const copies = matches.filter(isCopy);
if (copies.length > 0) {
  refuse([
    `This is already drawn: it matches ${copies.map(describeMatch).join(', ')}. ` +
      "Lucide's icons are ISC licensed and ours are already published, so neither can be submitted as new.",
  ]);
}
if (matches.length > 0) {
  writeFileSync(
    join(root, 'similar.md'),
    `**Close to:** ${matches.slice(0, 3).map(describeMatch).join(', ')}. Worth a look before merging.\n`,
  );
}

writeFileSync(join(icons, `${result.name}.svg`), result.svg);
writeFileSync(join(icons, `${result.name}.json`), `${JSON.stringify(result.meta, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `name=${result.name}\n`);
console.log(`library/icons/${result.name}.svg`);
