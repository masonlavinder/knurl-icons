import type { Element, IconDoc } from '../../model/types.ts';
import { formatNum } from '../../path/num.ts';
import { toTagAndAttrs } from '../../render/tagAttrs.ts';
import { ATTR_ORDER, ROOT_ATTR_ORDER, SVG_NS } from './attrOrder.ts';

/**
 * Deterministic serializer.
 *
 * Fixed attribute order, 2-space indent, self-closing tags, LF endings, no XML
 * declaration, elements in document order. This satisfies upstream's lint by
 * construction rather than by checking afterwards -- and, the real payoff, makes
 * git diffs between icon revisions readable.
 *
 * Geometry comes from the same toTagAndAttrs() the canvas renders through, so
 * the file can never disagree with what the editor drew.
 */
export function serialize(doc: IconDoc): string {
  const size = formatNum(doc.canvas.size);
  const root: Record<string, string> = {
    xmlns: SVG_NS,
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': formatNum(doc.strokeSpec.width),
    'stroke-linecap': doc.strokeSpec.cap,
    'stroke-linejoin': doc.strokeSpec.join,
  };

  const lines: string[] = ['<svg'];
  for (const k of ROOT_ATTR_ORDER) lines.push(`  ${k}="${root[k]}"`);
  lines.push('>');

  for (const el of doc.elements) {
    const r = renderElement(el);
    if (r) lines.push(`  ${r}`);
  }

  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}

function renderElement(el: Element): string | null {
  const { tag, attrs } = toTagAndAttrs(el);
  if (attrs === null) return null;

  const parts: string[] = [];
  for (const k of ATTR_ORDER[tag]) {
    const v = attrs[k];
    if (v !== undefined) parts.push(`${k}="${v}"`);
  }
  if (el.fill !== undefined) parts.push(`fill="${el.fill}"`);

  return `<${tag} ${parts.join(' ')} />`;
}
