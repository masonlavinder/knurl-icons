import type { Id } from '../ids.ts';

export type Pt = { x: number; y: number };

/**
 * Arc parameters for the segment *ending at* the node that carries this field.
 *
 * The spec (section 4.4) calls for keeping `A` commands through the pipeline --
 * arc endpoint parameterization survives affine transforms, and is more compact
 * and more editable than the 2-4 cubics it would otherwise become. 70% of the
 * upstream corpus (1467 / 2102 icons, 6253 arc commands) depends on this.
 *
 * bezier-js cannot represent arcs, so arcs are expanded to cubics at *flatten
 * time only* (hit-testing, bbox, refit) and never written back to the model.
 */
export type ArcParams = {
  rx: number;
  ry: number;
  /** x-axis rotation, radians. */
  rot: number;
  largeArc: boolean;
  sweep: boolean;
};

/**
 * A node. Control points `in`/`out` are ABSOLUTE coordinates, not deltas --
 * relative handles mean every drag touches two numbers and every transform
 * needs a special case.
 *
 * `in` is the handle governing the segment arriving at `p`; `out` governs the
 * segment leaving `p`. A node carries `arc` instead of `in` when the arriving
 * segment is an elliptical arc.
 */
export type Node = {
  id: Id;
  p: Pt;
  in?: Pt;
  out?: Pt;
  type: NodeType;
  arc?: ArcParams;
};

export type NodeType = 'corner' | 'smooth' | 'symmetric';

export type Subpath = {
  id: Id;
  nodes: Node[];
  closed: boolean;
};

/**
 * Fill. The document is a stroke-icon model, so fill is normally absent and the
 * root `fill="none"` applies. The exception is measured, not theoretical: 11
 * upstream icons draw solid dots as `<circle ... fill="currentColor">`.
 */
export type Fill = 'none' | 'currentColor';

type Base = { id: Id; fill?: Fill };

/**
 * Primitives stay primitives. Upstream ships `<circle>`, `<rect>`, `<line>` and
 * `<path>`; flattening everything to `<path>` on import would make round-tripping
 * impossible and turn every diff against the upstream set into noise.
 * Conversion to path is an explicit, lossy user action -- never implicit.
 */
export type Element =
  | (Base & { kind: 'line'; a: Pt; b: Pt })
  | (Base & { kind: 'circle'; c: Pt; r: number })
  | (Base & { kind: 'ellipse'; c: Pt; rx: number; ry: number; rot: number })
  | (Base & { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; ry: number })
  | (Base & { kind: 'polyline'; nodes: Node[]; closed: boolean })
  | (Base & { kind: 'path'; subpaths: Subpath[] });

export type ElementKind = Element['kind'];

export type StrokeSpec = {
  width: number;
  cap: 'round' | 'butt' | 'square';
  join: 'round' | 'miter' | 'bevel';
};

export type IconMeta = {
  contributors: string[];
  tags: string[];
  categories: string[];
  /** Upstream schema spells this `use-cases`; kept camelCase in the model. */
  useCases: string[];
};

export type IconDoc = {
  id: Id;
  /** kebab-case, validated by the NAME lint rule. */
  name: string;
  canvas: { size: number; padding: number };
  strokeSpec: StrokeSpec;
  /** z-order = array order = serialization order. Flat: no groups, no layers. */
  elements: Element[];
  meta: IconMeta;
};

/* ------------------------------------------------------------------ */
/* Addressing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Everything selectable has a stable id, and a selection is a set of addresses.
 * This is what makes "delete the thing I clicked" work at every granularity.
 */
export type Address =
  | { el: Id }
  | { el: Id; sub: Id }
  | { el: Id; sub?: Id; node: Id }
  | { el: Id; sub?: Id; node: Id; handle: 'in' | 'out' }
  /** The segment *ending at* `node`. */
  | { el: Id; sub?: Id; node: Id; segment: true };

export type Selection = { addrs: Address[]; anchor?: Address };

export const EMPTY_SELECTION: Selection = { addrs: [] };
