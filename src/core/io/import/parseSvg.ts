import { CANVAS, PADDING, STROKE_WIDTH } from '../../constants.ts';
import { makeId } from '../../ids.ts';
import type { Element, Fill, IconDoc, Node, StrokeSpec } from '../../model/types.ts';
import { parsePath } from '../../path/parse.ts';
import { diag, type Diagnostic, type Staged } from '../../result.ts';
import { parseXml, type XNode } from '../xml.ts';

/** Geometry tags this pass understands. */
const GEOMETRY = new Set(['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon']);

/**
 * Parse a house-spec SVG into an IconDoc.
 *
 * This is deliberately NOT the full import normalizer (spec section 4): there is
 * no transform flattening, no <use> expansion, no CSS cascade resolution, and no
 * fill-to-stroke recovery. Those arrive with M1. What this handles is the shape
 * upstream icons actually take -- and the corpus confirms it, with zero icons
 * carrying a transform attribute.
 */
export function parseSvg(src: string): Staged<IconDoc> {
  const diagnostics: Diagnostic[] = [];
  const root = parseXml(src);

  if (root.tag !== 'svg') {
    diagnostics.push(diag('NOT_SVG', 'error', `root element is <${root.tag}>, expected <svg>`));
  }

  const elements: Element[] = [];
  collect(root, elements, diagnostics, true);

  return {
    value: {
      id: makeId('doc'),
      name: 'untitled',
      canvas: { size: readViewBoxSize(root, diagnostics), padding: PADDING },
      strokeSpec: readStrokeSpec(root),
      elements,
      meta: { contributors: [], tags: [], categories: [], useCases: [] },
    },
    diagnostics,
  };
}

function collect(
  node: XNode,
  out: Element[],
  ds: Diagnostic[],
  isRoot: boolean,
): void {
  for (const child of node.children) {
    const tag = child.tag;

    if (GEOMETRY.has(tag)) {
      const el = convert(child, ds);
      if (el) out.push(el);
      continue;
    }

    switch (tag) {
      case 'g':
        // No groups in the model. Flattening a transform-bearing group is M1's
        // job; here a group is transparent and a transform is a hard error.
        if (child.attrs['transform']) {
          ds.push(diag('TRANSFORM', 'error', `<g transform> requires the import normalizer (M1)`));
        }
        collect(child, out, ds, false);
        break;
      case 'title':
      case 'desc':
      case 'metadata':
        break;
      case 'defs':
      case 'style':
      case 'use':
      case 'symbol':
      case 'clipPath':
      case 'mask':
      case 'filter':
      case 'pattern':
      case 'text':
        ds.push(
          diag('UNSUPPORTED', 'error', `<${tag}> requires the import normalizer (M1)`),
        );
        break;
      default:
        ds.push(diag('UNKNOWN_TAG', 'warn', `ignored <${tag}>`));
        break;
    }
  }
  if (isRoot && out.length === 0) {
    ds.push(diag('EMPTY', 'warn', 'no geometry found'));
  }
}

function convert(x: XNode, ds: Diagnostic[]): Element | null {
  if (x.attrs['transform']) {
    ds.push(diag('TRANSFORM', 'error', `<${x.tag} transform> requires the import normalizer (M1)`));
    return null;
  }
  const id = makeId('e');
  const fill = readFill(x, ds);

  switch (x.tag) {
    case 'path': {
      const d = x.attrs['d'];
      if (!d) {
        ds.push(diag('EMPTY_PATH', 'warn', '<path> without a d attribute'));
        return null;
      }
      const subpaths = parsePath(d);
      if (subpaths.length === 0) {
        ds.push(diag('EMPTY_PATH', 'warn', `<path> with unparseable d: ${d.slice(0, 40)}`));
        return null;
      }
      return { kind: 'path', id, subpaths, ...(fill ? { fill } : {}) };
    }
    case 'circle':
      return {
        kind: 'circle',
        id,
        c: { x: n(x, 'cx'), y: n(x, 'cy') },
        r: n(x, 'r'),
        ...(fill ? { fill } : {}),
      };
    case 'ellipse':
      return {
        kind: 'ellipse',
        id,
        c: { x: n(x, 'cx'), y: n(x, 'cy') },
        rx: n(x, 'rx'),
        ry: n(x, 'ry'),
        rot: 0,
        ...(fill ? { fill } : {}),
      };
    case 'rect': {
      const w = n(x, 'width');
      const h = n(x, 'height');
      // SVG's corner-radius defaulting: a lone rx or ry supplies the other.
      // Defaulting the missing one to 0 would turn 4 upstream icons' rounded
      // corners square -- a real geometry change, not a formatting one.
      const rawRx = x.attrs['rx'];
      const rawRy = x.attrs['ry'];
      const hasRx = rawRx !== undefined && rawRx !== 'auto';
      const hasRy = rawRy !== undefined && rawRy !== 'auto';
      let rx = hasRx ? n(x, 'rx') : hasRy ? n(x, 'ry') : 0;
      let ry = hasRy ? n(x, 'ry') : hasRx ? n(x, 'rx') : 0;
      rx = Math.min(Math.max(rx, 0), w / 2);
      ry = Math.min(Math.max(ry, 0), h / 2);
      return { kind: 'rect', id, x: n(x, 'x'), y: n(x, 'y'), w, h, rx, ry, ...(fill ? { fill } : {}) };
    }
    case 'line':
      return {
        kind: 'line',
        id,
        a: { x: n(x, 'x1'), y: n(x, 'y1') },
        b: { x: n(x, 'x2'), y: n(x, 'y2') },
        ...(fill ? { fill } : {}),
      };
    case 'polyline':
    case 'polygon': {
      const nodes = parsePoints(x.attrs['points'] ?? '');
      if (nodes.length === 0) {
        ds.push(diag('EMPTY_POINTS', 'warn', `<${x.tag}> without usable points`));
        return null;
      }
      // <polygon> has no model kind; it round-trips as a *closed* polyline and
      // is re-serialized as <polygon>, because closure changes stroking.
      return {
        kind: 'polyline',
        id,
        nodes,
        closed: x.tag === 'polygon',
        ...(fill ? { fill } : {}),
      };
    }
    default:
      return null;
  }
}

function parsePoints(s: string): Node[] {
  const nums = s
    .trim()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0)
    .map(Number);
  const nodes: Node[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const px = nums[i]!;
    const py = nums[i + 1]!;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    nodes.push({ id: makeId('n'), p: { x: px, y: py }, type: 'corner' });
  }
  return nodes;
}

function readFill(x: XNode, ds: Diagnostic[]): Fill | undefined {
  const raw = x.attrs['fill'];
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'none') return 'none';
  if (v === 'currentcolor') return 'currentColor';
  ds.push(
    diag('FILL_PRESENT', 'error', `<${x.tag} fill="${raw}"> is not a stroke-icon fill`),
  );
  return undefined;
}

function n(x: XNode, name: string): number {
  const v = Number(x.attrs[name] ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function readViewBoxSize(root: XNode, ds: Diagnostic[]): number {
  const vb = root.attrs['viewBox'];
  if (!vb) return CANVAS;
  const parts = vb.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
    ds.push(diag('VIEWBOX', 'warn', `unreadable viewBox "${vb}"`));
    return CANVAS;
  }
  const [minX, minY, w, h] = parts as [number, number, number, number];
  if (minX !== 0 || minY !== 0) {
    ds.push(diag('VIEWBOX', 'warn', `viewBox origin is (${minX},${minY}), expected (0,0)`));
  }
  if (w !== h) ds.push(diag('VIEWBOX', 'warn', `non-square viewBox ${w}x${h}`));
  return w || CANVAS;
}

function readStrokeSpec(root: XNode): StrokeSpec {
  const width = Number(root.attrs['stroke-width'] ?? STROKE_WIDTH);
  const cap = root.attrs['stroke-linecap'];
  const join = root.attrs['stroke-linejoin'];
  return {
    width: Number.isFinite(width) ? width : STROKE_WIDTH,
    cap: cap === 'butt' || cap === 'square' ? cap : 'round',
    join: join === 'miter' || join === 'bevel' ? join : 'round',
  };
}
