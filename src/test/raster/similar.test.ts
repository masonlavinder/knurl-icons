import { beforeAll, describe, expect, it } from 'vitest';

import { libraryIcons } from '../../utils/library.ts';
import { registerNodeXmlParser } from '../../utils/xmlNode.ts';
import { corpusAvailable, loadCorpus } from '../corpus/loadCorpus.ts';
import { type Candidate, COPY_AT, findMatches, geometryKey, inkMask, isCopy, overlap } from './similar.ts';

beforeAll(() => {
  registerNodeXmlParser();
});

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const CHECK = svg('<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>');

describe('geometryKey', () => {
  it('ignores element order, path encoding and names', () => {
    const shuffled = svg(
      '<path data-name="tick" d="M16 9L10.5 14.5L8 12"/><circle cx="12" cy="12" r="10"/>',
    );
    expect(geometryKey(shuffled)).toBe(geometryKey(CHECK));
  });

  it('tells different drawings apart', () => {
    expect(geometryKey(svg('<circle cx="12" cy="12" r="9"/>'))).not.toBe(geometryKey(CHECK));
  });
});

describe('findMatches', () => {
  const library: Candidate[] = [{ name: 'check', source: 'library', svg: CHECK }];

  it('calls a re-encoded copy a copy', () => {
    // The tick split into two lines: different elements, same picture.
    const split = svg('<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5"/><path d="M10.5 14.5 8 12"/>');
    const [m] = findMatches(split, library);
    expect(m?.exact).toBe(false);
    expect(m && isCopy(m)).toBe(true);
  });

  it('flags a nudged redraw for the reviewer without refusing it', () => {
    const nudged = svg('<circle cx="12" cy="12" r="9.9"/><path d="m16 9.1-5.5 5.5L8 12"/>');
    const [m] = findMatches(nudged, library);
    expect(m?.name).toBe('check');
    expect(m && isCopy(m)).toBe(false);
  });

  it('lets a different icon through', () => {
    expect(findMatches(svg('<path d="M4 4h16v16H4z"/>'), library)).toEqual([]);
  });

  it('measures overlap against combined ink, not the canvas', () => {
    expect(overlap(inkMask(CHECK), inkMask(CHECK))).toBe(1);
    expect(overlap(inkMask(CHECK), inkMask(svg('<path d="M3 3h2"/>')))).toBeLessThan(0.1);
  });
});

/** Not a test of the checker: a test that the library passes it. */
describe('library originality', () => {
  const icons = libraryIcons();

  it('has no two icons that are copies of each other', () => {
    const copies: string[] = [];
    for (const [i, a] of icons.entries()) {
      const rest: Candidate[] = icons
        .slice(i + 1)
        .map((b) => ({ name: b.name, source: 'library', svg: b.svg }));
      for (const m of findMatches(a.svg, rest).filter(isCopy)) copies.push(`${a.name} ~ ${m.name}`);
    }
    expect(copies).toEqual([]);
  });

  describe.skipIf(!corpusAvailable())('against Lucide', () => {
    const lucide = (): Candidate[] => loadCorpus().map((c) => ({ ...c, source: 'lucide' }));

    it(`has no icon at ${COPY_AT} overlap or more with one of Lucide's`, () => {
      const corpus = lucide();
      const copies = icons.flatMap((a) =>
        findMatches(a.svg, corpus)
          .filter(isCopy)
          .map((m) => `${a.name} ~ ${m.name} (${m.overlap.toFixed(3)})`),
      );
      expect(copies).toEqual([]);
    });

    it("catches the editor's old seed, Lucide's circle-check", () => {
      const [m] = findMatches(CHECK, lucide());
      expect(m).toMatchObject({ name: 'circle-check', source: 'lucide', exact: true });
    });
  });
});
