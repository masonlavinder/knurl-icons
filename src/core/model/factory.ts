import { makeId } from '../ids.ts';
import type { Element, ElementKind, Node, Pt } from './types.ts';

const node = (x: number, y: number): Node => ({
  id: makeId('n'),
  p: { x, y },
  type: 'corner',
});

/**
 * New elements are created on the crisp grid and well inside the padding box,
 * so a freshly added shape is conformant the moment it appears.
 */
export function createElement(kind: ElementKind | 'polygon'): Element {
  const id = makeId('e');
  switch (kind) {
    case 'circle':
      return { kind: 'circle', id, c: { x: 12, y: 12 }, r: 8 };
    case 'ellipse':
      return { kind: 'ellipse', id, c: { x: 12, y: 12 }, rx: 9, ry: 5, rot: 0 };
    case 'rect':
      return { kind: 'rect', id, x: 4, y: 4, w: 16, h: 16, rx: 2, ry: 2 };
    case 'line':
      return { kind: 'line', id, a: { x: 4, y: 12 }, b: { x: 20, y: 12 } };
    case 'polyline':
      return { kind: 'polyline', id, nodes: [node(4, 16), node(12, 8), node(20, 16)], closed: false };
    case 'polygon':
      return { kind: 'polyline', id, nodes: [node(12, 4), node(20, 20), node(4, 20)], closed: true };
    case 'path':
      return {
        kind: 'path',
        id,
        subpaths: [
          {
            id: makeId('s'),
            nodes: [
              { id: makeId('n'), p: { x: 4, y: 16 }, type: 'smooth', out: { x: 9, y: 6 } },
              { id: makeId('n'), p: { x: 20, y: 16 }, type: 'smooth', in: { x: 15, y: 6 } },
            ],
            closed: false,
          },
        ],
      };
  }
}

export const ADDABLE: { kind: ElementKind | 'polygon'; label: string; hint: string }[] = [
  { kind: 'path', label: 'Path', hint: 'Bézier curve' },
  { kind: 'line', label: 'Line', hint: 'Two points' },
  { kind: 'circle', label: 'Circle', hint: 'Center and radius' },
  { kind: 'ellipse', label: 'Ellipse', hint: 'Two radii' },
  { kind: 'rect', label: 'Rectangle', hint: 'Optional corner radius' },
  { kind: 'polyline', label: 'Polyline', hint: 'Open run of points' },
  { kind: 'polygon', label: 'Polygon', hint: 'Closed run of points' },
];

export const pt = (x: number, y: number): Pt => ({ x, y });
