/**
 * Turns an icon-submission issue into library files.
 *
 * Run by .github/workflows/accept-icon.yml, which passes the issue through the
 * environment — never through the shell — because the body is untrusted text:
 *
 *   ISSUE_TITLE   `Icon: <name>`, where the name comes from
 *   ISSUE_BODY    the filed issue-form body
 *   ISSUE_AUTHOR  the submitter's GitHub login, credited as contributor
 *
 * On success it writes library/icons/<name>.svg and .json and reports
 * `name` on GITHUB_OUTPUT. On refusal it writes the reasons to
 * accept-error.md, for the workflow to post on the issue, and exits 1.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acceptSubmission, parseSubmission } from '../src/utils/submission.ts';
import { registerNodeXmlParser } from '../src/utils/xmlNode.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const library = join(root, 'library');
const icons = join(library, 'icons');
const categories = Object.keys(JSON.parse(readFileSync(join(library, 'categories.json'), 'utf8')));

const title = process.env.ISSUE_TITLE ?? '';
const body = process.env.ISSUE_BODY ?? '';
const author = process.env.ISSUE_AUTHOR ?? '';

registerNodeXmlParser();
const result = acceptSubmission(
  parseSubmission(title, body),
  author,
  (name) => existsSync(join(icons, `${name}.svg`)),
  categories,
);

if (!result.ok) {
  const report = [
    'This submission could not be added to the library:',
    '',
    ...result.problems.map((p) => `- ${p}`),
    '',
    'Edit the issue to fix these and this check runs again.',
  ].join('\n');
  writeFileSync(join(root, 'accept-error.md'), `${report}\n`);
  console.error(report);
  process.exit(1);
}

writeFileSync(join(icons, `${result.name}.svg`), result.svg);
writeFileSync(join(icons, `${result.name}.json`), `${JSON.stringify(result.meta, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `name=${result.name}\n`);
console.log(`library/icons/${result.name}.svg`);
