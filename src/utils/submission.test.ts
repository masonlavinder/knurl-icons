import { beforeAll, describe, expect, it } from 'vitest';

import { acceptSubmission, parseSubmission, submitLink, type Submission } from './submission.ts';
import { registerNodeXmlParser } from './xmlNode.ts';

beforeAll(() => {
  registerNodeXmlParser();
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <circle cx="12" cy="12" r="10" />\n</svg>';

/** The body GitHub writes for a filed submit-icon.yml form. */
const body = (fields: { name: string; tags: string; svg: string; license: string }): string =>
  [
    '### Name',
    '',
    fields.name,
    '',
    '### Tags',
    '',
    fields.tags,
    '',
    '### SVG',
    '',
    fields.svg,
    '',
    '### License',
    '',
    fields.license,
    '',
  ].join('\n');

describe('parseSubmission', () => {
  it('reads every field of a filed form', () => {
    const s = parseSubmission(
      body({
        name: 'gear-check',
        tags: 'Settings, done ,  cog',
        svg: '```xml\n' + SVG + '\n```',
        license: '- [X] I release this icon under the MIT License.',
      }),
    );
    expect(s).toEqual({
      name: 'gear-check',
      tags: ['settings', 'done', 'cog'],
      svg: SVG,
      licensed: true,
    });
  });

  it('treats empty fields and an unticked box as absent', () => {
    const s = parseSubmission(
      body({
        name: 'x',
        tags: '_No response_',
        svg: '_No response_',
        license: '- [ ] I release this icon under the MIT License.',
      }),
    );
    expect(s.tags).toEqual([]);
    expect(s.svg).toBe('');
    expect(s.licensed).toBe(false);
  });

  it('survives CRLF line endings', () => {
    const s = parseSubmission(
      body({ name: 'a', tags: '', svg: SVG, license: '- [x] yes' }).replace(/\n/g, '\r\n'),
    );
    expect(s.svg).toBe(SVG);
    expect(s.licensed).toBe(true);
  });
});

describe('submitLink', () => {
  it('pre-fills the form, and the SVG reads back intact', () => {
    const { url, svgInUrl } = submitLink('gear-check', SVG);
    expect(svgInUrl).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('template')).toBe('submit-icon.yml');
    expect(q.get('name')).toBe('gear-check');
    expect(q.get('svg')).toBe(SVG);
  });

  it('leaves the SVG out of a URL GitHub would refuse', () => {
    const { url, svgInUrl } = submitLink('big', SVG.repeat(100));
    expect(svgInUrl).toBe(false);
    expect(new URL(url).searchParams.has('svg')).toBe(false);
  });
});

describe('acceptSubmission', () => {
  const house = (body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const sub = (over: Partial<Submission> = {}): Submission => ({
    name: 'ring',
    tags: ['circle'],
    svg: house('<circle cx="12" cy="12" r="10"/>'),
    licensed: true,
    ...over,
  });
  const free = (): boolean => false;

  it('writes serializer output and the contributor', () => {
    const r = acceptSubmission(sub(), 'octocat', free);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.svg).toContain('<circle cx="12" cy="12" r="10" />');
    expect(r.meta).toEqual({ contributors: ['octocat'], tags: ['circle'], categories: [] });
  });

  it('drops anything that is not geometry', () => {
    const r = acceptSubmission(
      sub({ svg: house('<script>alert(1)</script><circle cx="12" cy="12" r="10" onclick="x()"/>') }),
      'octocat',
      free,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.svg).not.toMatch(/script|onclick|alert/);
  });

  it('refuses a bad name, a taken name, no license and no geometry', () => {
    const problems = (s: Submission, taken = free): string[] => {
      const r = acceptSubmission(s, 'octocat', taken);
      return r.ok ? [] : r.problems;
    };
    expect(problems(sub({ name: 'Ring Thing' }))).toHaveLength(1);
    expect(problems(sub(), () => true)[0]).toMatch(/already/);
    expect(problems(sub({ licensed: false }))[0]).toMatch(/License/);
    expect(problems(sub({ svg: house('') })).join()).toMatch(/no geometry/);
    expect(problems(sub({ svg: '<svg' }))[0]).toMatch(/does not parse/);
  });

  it('refuses geometry that breaks the standard', () => {
    const r = acceptSubmission(sub({ svg: house('<circle cx="12" cy="12" r="12"/>') }), 'o', free);
    expect(r.ok).toBe(false);
  });
});
