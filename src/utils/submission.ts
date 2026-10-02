/**
 * The icon submission round trip, both directions in one place.
 *
 * The editor builds a link that opens a pre-filled GitHub issue form
 * (.github/ISSUE_TEMPLATE/submit-icon.yml); the accept-icon workflow reads the
 * filed issue back. The field ids and headings below must match that template,
 * and keeping the writer and the reader together is what keeps them matching.
 */
import { serialize } from '../core/io/export/serialize.ts';
import { checkConformance, KEBAB } from '../core/io/import/lint.ts';
import { parseSvg } from '../core/io/import/parseSvg.ts';
import type { IconDoc } from '../core/model/types.ts';

export const REPO = 'masonlavinder/knurl-icons';
export const TEMPLATE = 'submit-icon.yml';

/** Issue-form field id -> the `label` GitHub renders as its heading. */
export const FIELDS = {
  name: 'Name',
  tags: 'Tags',
  svg: 'SVG',
  license: 'License',
} as const;

/**
 * GitHub rejects issue URLs much past 8k characters. A typical icon encodes to
 * well under 2k, so this only bites on an unusually dense one, and then the
 * SVG travels by clipboard instead.
 */
const MAX_URL = 8000;

export type SubmitLink = { url: string; svgInUrl: boolean };

export function submitLink(name: string, svg: string): SubmitLink {
  const params = new URLSearchParams({ template: TEMPLATE, title: `Icon: ${name}`, name });
  const base = `https://github.com/${REPO}/issues/new?`;
  const withSvg = `${base}${params.toString()}&svg=${encodeURIComponent(svg)}`;
  if (withSvg.length <= MAX_URL) return { url: withSvg, svgInUrl: true };
  return { url: `${base}${params.toString()}`, svgInUrl: false };
}

export type Submission = { name: string; tags: string[]; svg: string; licensed: boolean };

/** What GitHub writes for a field the submitter left empty. */
const NO_RESPONSE = '_No response_';

/**
 * Read a filed issue-form body back into its fields.
 *
 * GitHub renders each field as `### <label>` followed by the value; a textarea
 * with `render: xml` arrives fenced, and a checkbox as a task-list item.
 */
export function parseSubmission(body: string): Submission {
  const sections = new Map<string, string>();
  let current: string | null = null;
  const lines: string[] = [];
  const flush = (): void => {
    if (current !== null) sections.set(current, lines.join('\n').trim());
    lines.length = 0;
  };
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const head = /^### (.+?)\s*$/.exec(line);
    if (head) {
      flush();
      current = head[1]!;
    } else {
      lines.push(line);
    }
  }
  flush();

  const field = (label: string): string => {
    const v = sections.get(label) ?? '';
    return v === NO_RESPONSE ? '' : v;
  };

  return {
    name: field(FIELDS.name).trim(),
    tags: field(FIELDS.tags)
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    svg: unfence(field(FIELDS.svg)),
    licensed: /^- \[[xX]\]/m.test(field(FIELDS.license)),
  };
}

/** The library's per-icon metadata, Lucide's `<name>.json` minus its $schema. */
export type LibraryMeta = { contributors: string[]; tags: string[]; categories: string[] };

export type Accepted =
  | { ok: true; name: string; svg: string; meta: LibraryMeta }
  | { ok: false; problems: string[] };

/**
 * Decide whether a submission can enter the library, and if so, what is
 * written.
 *
 * What gets committed is this editor's serializer output, never the submitted
 * text. The parser keeps only the geometry tags it understands, so a script,
 * an event handler or anything else off-spec in the issue cannot reach the
 * repo, and every library file has the same attribute order as one saved from
 * the editor.
 */
export function acceptSubmission(
  sub: Submission,
  author: string,
  taken: (name: string) => boolean,
): Accepted {
  const problems: string[] = [];
  if (!KEBAB.test(sub.name)) problems.push(`Name "${sub.name}" is not kebab-case.`);
  else if (taken(sub.name)) problems.push(`An icon named "${sub.name}" is already in the library.`);
  if (!sub.licensed) problems.push('The MIT License box is not ticked.');
  if (!sub.svg) problems.push('The SVG field is empty.');
  if (problems.length > 0 || !sub.svg) return { ok: false, problems };

  let doc: IconDoc;
  try {
    const staged = parseSvg(sub.svg);
    for (const d of staged.diagnostics) {
      if (d.severity === 'error') problems.push(`${d.code}: ${d.message}`);
    }
    doc = { ...staged.value, name: sub.name };
  } catch (error) {
    return { ok: false, problems: [`The SVG does not parse: ${(error as Error).message}`] };
  }
  if (doc.elements.length === 0) problems.push('The SVG has no geometry.');
  for (const r of checkConformance(doc)) {
    if (r.status === 'fail') problems.push(`${r.code}: ${r.title} — ${r.detail}`);
  }
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    name: sub.name,
    svg: serialize(doc),
    meta: { contributors: [author], tags: sub.tags, categories: [] },
  };
}

function unfence(v: string): string {
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(v.trim());
  return (m ? m[1]! : v).trim();
}
