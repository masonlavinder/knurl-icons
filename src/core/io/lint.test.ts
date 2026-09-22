import { beforeAll, describe, expect, it } from 'vitest';

import { registerNodeXmlParser } from '../../platform/xmlNode.ts';
import { checkConformance, conformanceScore } from './import/lint.ts';
import { parseSvg } from './import/parseSvg.ts';

beforeAll(() => {
  registerNodeXmlParser();
});

const doc = (body: string) =>
  parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).value;

const rule = (body: string, code: string) =>
  checkConformance(doc(body)).find((r) => r.code === code)!;

describe('Lucide conformance', () => {
  it('passes a clean house-spec icon', () => {
    const rules = checkConformance({ ...doc('<circle cx="12" cy="12" r="10"/>'), name: 'circle-check' });
    const { pass, total } = conformanceScore(rules);
    expect(total).toBe(8);
    expect(pass).toBe(total);
  });

  it('fails padding when the stroked box leaves [1, 23]', () => {
    // r=10 is the largest circle that fits: 12+10+1 = 23 exactly.
    expect(rule('<circle cx="12" cy="12" r="10"/>', 'PADDING').status).toBe('pass');
    // r=11 pushes the stroked edge to 24.
    const bad = rule('<circle cx="12" cy="12" r="11"/>', 'PADDING');
    expect(bad.status).toBe('fail');
    expect(bad.addrs).toHaveLength(1);
  });

  it('measures padding on the stroked box, not the centreline', () => {
    // Centreline at 22.5 is inside [1,23], but the stroke reaches 23.5.
    expect(rule('<line x1="2" y1="12" x2="22.5" y2="12"/>', 'PADDING').status).toBe('fail');
    expect(rule('<line x1="2" y1="12" x2="22" y2="12"/>', 'PADDING').status).toBe('pass');
  });

  it('allows a currentColor dot but not a filled body', () => {
    expect(rule('<circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>', 'FILL_PRESENT').status).toBe('pass');
    expect(rule('<circle cx="12" cy="12" r="8" fill="currentColor"/>', 'FILL_PRESENT').status).toBe('fail');
  });

  it('treats transforms as structurally impossible', () => {
    const r = rule('<circle cx="12" cy="12" r="10"/>', 'TRANSFORM');
    expect(r.status).toBe('pass');
    expect(r.structural).toBe(true);
  });

  it('rejects a name that is not kebab-case', () => {
    const rules = checkConformance({ ...doc('<circle cx="12" cy="12" r="10"/>'), name: 'Circle Check' });
    expect(rules.find((r) => r.code === 'NAME')!.status).toBe('fail');
  });

  it('warns when coordinates exceed the export precision', () => {
    expect(rule('<circle cx="12.0001" cy="12" r="5"/>', 'PRECISION').status).toBe('warn');
    expect(rule('<circle cx="12.25" cy="12" r="5"/>', 'PRECISION').status).toBe('pass');
  });
});
