import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { serialize } from './core/io/export/serialize.ts';
import { checkConformance, KEBAB } from './core/io/import/lint.ts';
import { parseSvg } from './core/io/import/parseSvg.ts';
import { CATEGORIES, libraryIcons, orphanMetas } from './utils/library.ts';
import { registerNodeXmlParser } from './utils/xmlNode.ts';

beforeAll(() => {
  registerNodeXmlParser();
});

/**
 * The library's house rules, so a hand-added icon or a bad merge fails the
 * build rather than ships. library/README.md is the prose version of these.
 */
const icons = libraryIcons();
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('library', () => {
  it('has icons, each with its metadata', () => {
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.filter((i) => !i.meta).map((i) => i.name), 'svg without json').toEqual([]);
    expect(orphanMetas(), 'json without svg').toEqual([]);
  });

  describe.each(icons)('$name', ({ name, svg, meta }) => {
    it('is named in kebab-case', () => {
      expect(name).toMatch(KEBAB);
    });

    it('is byte-identical to serializer output (run pnpm library:format)', () => {
      expect(svg).toBe(serialize({ ...parseSvg(svg).value, name }));
    });

    it('passes every conformance rule, warnings included', () => {
      const off = checkConformance({ ...parseSvg(svg).value, name }).filter(
        (r) => r.status !== 'pass',
      );
      expect(off.map((r) => `${r.code}: ${r.detail}`)).toEqual([]);
    });

    it('has well-formed metadata', () => {
      expect(Object.keys(meta ?? {}).sort()).toEqual(['categories', 'contributors', 'tags']);
      if (!meta) return;
      expect(meta.contributors.length, 'contributors').toBeGreaterThan(0);
      for (const c of meta.categories) expect(Object.keys(CATEGORIES)).toContain(c);
      expect(meta.tags.length, 'tags').toBeGreaterThan(0);
      for (const t of meta.tags) expect(t).toMatch(TAG);
      expect(new Set(meta.tags).size, 'duplicate tags').toBe(meta.tags.length);
    });
  });
});

describe('submit-icon issue form', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const form = readFileSync(join(here, '..', '.github/ISSUE_TEMPLATE/submit-icon.yml'), 'utf8');

  it('offers exactly the categories in library/categories.json', () => {
    const block = /id: categories[\s\S]*?options:\n((?: {8}- .+\n)+)/.exec(form);
    const options = block![1]!.trim().split('\n').map((l) => l.trim().replace(/^- /, ''));
    expect(options).toEqual(Object.keys(CATEGORIES));
  });
});
