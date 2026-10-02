import { describe, expect, it } from 'vitest';

import { lockedSpans } from './lockedSpans.ts';

const DOC = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <circle cx="12" cy="12" r="10" />
  <path d="m16 9-5.5 5.5L8 12" />
</svg>
`;

const marked = (text: string): string[] =>
  lockedSpans(text).map((s) => text.slice(s.start, s.end));

describe('locked spans', () => {
  it('marks every root attribute', () => {
    expect(marked(DOC)).toEqual([
      'xmlns="http://www.w3.org/2000/svg"',
      'width="24"',
      'height="24"',
      'viewBox="0 0 24 24"',
      'fill="none"',
      'stroke="currentColor"',
      'stroke-width="2"',
      'stroke-linecap="round"',
      'stroke-linejoin="round"',
    ]);
  });

  it('marks nothing on the geometry below', () => {
    // cx/cy/r and d are the author's, and `stroke-width` on a child is not a
    // thing the model can hold, so it is not claimed here either.
    for (const span of lockedSpans(DOC)) expect(span.start).toBeLessThan(DOC.indexOf('<circle'));
  });

  it('separates house spec from what the model fixes', () => {
    const byName = Object.fromEntries(
      lockedSpans(DOC).map((s) => [DOC.slice(s.start, s.end).split('=')[0], s.kind]),
    );
    expect(byName['stroke-width']).toBe('spec');
    expect(byName['viewBox']).toBe('spec');
    expect(byName['stroke']).toBe('fixed');
    expect(byName['xmlns']).toBe('fixed');
  });

  it('is not fooled by a > inside an attribute value', () => {
    const tricky = '<svg data-x="a > b" stroke-width="2"><path d="M0 0"/></svg>';
    expect(marked(tricky)).toEqual(['stroke-width="2"']);
  });

  it('survives text that is not an svg yet', () => {
    expect(lockedSpans('')).toEqual([]);
    expect(lockedSpans('<sv')).toEqual([]);
    expect(lockedSpans('<svg xmlns="a"')).toEqual([]);
  });
});
