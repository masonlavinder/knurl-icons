import { makeId } from '../ids.ts';
import type { Element, Node, Subpath } from '../model/types.ts';
import { emitPath } from '../path/emit.ts';
import { formatNum } from '../path/num.ts';
import type { TagName } from '../io/export/attrOrder.ts';

/**
 * The single mapping from a model element to the SVG tag and attributes that
 * draw it.
 *
 * Both the serializer and the canvas renderer go through here, so what you see
 * on screen is built from the same description that gets written to disk. If
 * these diverged, the editor could show geometry the export does not produce.
 */
export type TagAndAttrs = { tag: TagName; attrs: Record<string, string> | null };

export function toTagAndAttrs(el: Element): TagAndAttrs {
  switch (el.kind) {
    case 'circle':
      return {
        tag: 'circle',
        attrs: { cx: formatNum(el.c.x), cy: formatNum(el.c.y), r: formatNum(el.r) },
      };

    case 'ellipse':
      // A rotated ellipse can only be expressed with a transform, which the
      // model forbids outright, so it degrades to a two-arc path. The corpus has
      // zero rotated ellipses, so this never fires on upstream content.
      if (Math.abs(el.rot) > 1e-12) {
        return { tag: 'path', attrs: { d: emitPath(ellipseToSubpath(el)) } };
      }
      return {
        tag: 'ellipse',
        attrs: {
          cx: formatNum(el.c.x),
          cy: formatNum(el.c.y),
          rx: formatNum(el.rx),
          ry: formatNum(el.ry),
        },
      };

    case 'rect': {
      const attrs: Record<string, string> = {
        width: formatNum(el.w),
        height: formatNum(el.h),
        x: formatNum(el.x),
        y: formatNum(el.y),
      };
      // Equal radii need only rx; ry is emitted solely when it actually differs.
      if (el.rx !== 0 || el.ry !== 0) attrs['rx'] = formatNum(el.rx);
      if (el.ry !== el.rx) attrs['ry'] = formatNum(el.ry);
      return { tag: 'rect', attrs };
    }

    case 'line':
      return {
        tag: 'line',
        attrs: {
          x1: formatNum(el.a.x),
          y1: formatNum(el.a.y),
          x2: formatNum(el.b.x),
          y2: formatNum(el.b.y),
        },
      };

    case 'polyline': {
      if (el.nodes.length === 0) return { tag: 'polyline', attrs: null };
      const points = el.nodes.map((nd) => `${formatNum(nd.p.x)} ${formatNum(nd.p.y)}`).join(' ');
      // A closed polyline must serialize as <polygon>. The two are NOT
      // interchangeable under stroking: <polygon> closes the path, producing a
      // line *join* at the start vertex, where <polyline> leaves the ends open
      // and produces two *caps*. Round join and round cap render differently.
      return { tag: el.closed ? 'polygon' : 'polyline', attrs: { points } };
    }

    case 'path': {
      if (el.subpaths.length === 0) return { tag: 'path', attrs: null };
      const d = emitPath(el.subpaths);
      return { tag: 'path', attrs: d.length > 0 ? { d } : null };
    }
  }
}

/**
 * The `d` that draws an element, whatever its kind.
 *
 * Hit targets need a single path shape mirroring the visible geometry, so
 * primitives are expressed as path data here. This is a rendering convenience
 * and never touches the document -- primitives stay primitives in the model.
 */
export function elementToPathData(el: Element): string {
  const { tag, attrs } = toTagAndAttrs(el);
  if (!attrs) return '';

  switch (tag) {
    case 'path':
      return attrs['d'] ?? '';
    case 'circle':
    case 'ellipse': {
      const cx = Number(attrs['cx']);
      const cy = Number(attrs['cy']);
      const rx = Number(attrs['rx'] ?? attrs['r']);
      const ry = Number(attrs['ry'] ?? attrs['r']);
      // Two half-arcs, which is the only transform-free way to draw an ellipse.
      return (
        `M${f(cx - rx)} ${f(cy)}` +
        `A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}` +
        `A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}z`
      );
    }
    case 'rect': {
      const x = Number(attrs['x']);
      const y = Number(attrs['y']);
      const w = Number(attrs['width']);
      const h = Number(attrs['height']);
      const rx = Math.min(Number(attrs['rx'] ?? 0), w / 2);
      const ry = Math.min(Number(attrs['ry'] ?? attrs['rx'] ?? 0), h / 2);
      if (rx <= 0 || ry <= 0) {
        return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
      }
      return (
        `M${f(x + rx)} ${f(y)}` +
        `h${f(w - 2 * rx)}a${f(rx)} ${f(ry)} 0 0 1 ${f(rx)} ${f(ry)}` +
        `v${f(h - 2 * ry)}a${f(rx)} ${f(ry)} 0 0 1 ${f(-rx)} ${f(ry)}` +
        `h${f(-(w - 2 * rx))}a${f(rx)} ${f(ry)} 0 0 1 ${f(-rx)} ${f(-ry)}` +
        `v${f(-(h - 2 * ry))}a${f(rx)} ${f(ry)} 0 0 1 ${f(rx)} ${f(-ry)}z`
      );
    }
    case 'line':
      return `M${attrs['x1']} ${attrs['y1']}L${attrs['x2']} ${attrs['y2']}`;
    case 'polyline':
    case 'polygon': {
      const pts = (attrs['points'] ?? '').trim();
      if (pts.length === 0) return '';
      const nums = pts.split(/[\s,]+/);
      let d = `M${nums[0]} ${nums[1]}`;
      for (let i = 2; i + 1 < nums.length; i += 2) d += `L${nums[i]} ${nums[i + 1]}`;
      return tag === 'polygon' ? `${d}z` : d;
    }
  }
}

const f = (n: number): string => formatNum(n);

/** Two 180-degree arcs, which is how a rotated ellipse survives without a transform. */
export function ellipseToSubpath(el: Extract<Element, { kind: 'ellipse' }>): Subpath[] {
  const cos = Math.cos(el.rot);
  const sin = Math.sin(el.rot);
  const arc = { rx: el.rx, ry: el.ry, rot: el.rot, largeArc: false, sweep: true };
  const nodes: Node[] = [
    {
      id: makeId('n'),
      p: { x: el.c.x + el.rx * cos, y: el.c.y + el.rx * sin },
      type: 'corner',
      arc,
    },
    {
      id: makeId('n'),
      p: { x: el.c.x - el.rx * cos, y: el.c.y - el.rx * sin },
      type: 'corner',
      arc,
    },
  ];
  return [{ id: makeId('s'), nodes, closed: true }];
}
