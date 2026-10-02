import { beforeAll, describe, expect, it } from 'vitest';

import { registerNodeXmlParser } from '../../utils/xmlNode.ts';
import { serialize } from './export/serialize.ts';
import { checkConformance } from './import/lint.ts';
import { parseSvg } from './import/parseSvg.ts';

beforeAll(() => {
  registerNodeXmlParser();
});

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const roundTrip = (body: string): string => serialize(parseSvg(svg(body)).value);

/**
 * Element names travel in the file as data-name, so they survive Save, Open
 * and every edit made in the SVG panel — each of which is a parse.
 */
describe('element names', () => {
  it('round-trip, leading the element they label', () => {
    const out = roundTrip('<circle data-name="face" cx="12" cy="12" r="10"/>');
    expect(out).toContain('<circle data-name="face" cx="12" cy="12" r="10" />');
    expect(serialize(parseSvg(out).value)).toBe(out);
  });

  it('leave an unnamed element exactly as upstream writes it', () => {
    expect(roundTrip('<circle cx="12" cy="12" r="10"/>')).toContain(
      '<circle cx="12" cy="12" r="10" />',
    );
  });

  it('escape what an attribute cannot hold, and read it back as typed', () => {
    const name = 'a "quoted" <b> & c';
    const doc = parseSvg(svg('<circle cx="12" cy="12" r="10"/>')).value;
    const out = serialize({ ...doc, elements: [{ ...doc.elements[0]!, name }] });
    expect(out).toContain('data-name="a &quot;quoted&quot; &lt;b&gt; &amp; c"');
    expect(parseSvg(out).value.elements[0]!.name).toBe(name);
  });

  it('treat a blank name as no name', () => {
    expect(roundTrip('<circle data-name="   " cx="12" cy="12" r="10"/>')).toContain(
      '<circle cx="12" cy="12" r="10" />',
    );
  });

  it('trim stray spaces on the way out', () => {
    const doc = parseSvg(svg('<circle cx="12" cy="12" r="10"/>')).value;
    const out = serialize({ ...doc, elements: [{ ...doc.elements[0]!, name: ' face ' }] });
    expect(out).toContain('data-name="face"');
  });

  it('are flagged by conformance as metadata to strip, not failed', () => {
    const named = parseSvg(svg('<circle data-name="face" cx="12" cy="12" r="10"/>')).value;
    const rule = checkConformance(named).find((r) => r.code === 'ELEMENT_NAMES')!;
    expect(rule.status).toBe('warn');
    expect(rule.addrs).toEqual([{ el: named.elements[0]!.id }]);

    const plain = parseSvg(svg('<circle cx="12" cy="12" r="10"/>')).value;
    expect(checkConformance(plain).find((r) => r.code === 'ELEMENT_NAMES')!.status).toBe('pass');
  });
});
