import { CANVAS, DECIMALS, STROKE_WIDTH, VISUAL_MAX, VISUAL_MIN } from '../../constants.ts';
import { elementVisualBox, visualBox } from '../../geom/bbox.ts';
import { countNodes, describeElement, nodeListsOf } from '../../model/access.ts';
import type { Address, IconDoc } from '../../model/types.ts';
import { round } from '../../path/num.ts';

export type RuleStatus = 'pass' | 'fail' | 'warn';

export type RuleResult = {
  code: string;
  /** What the rule guarantees, phrased as the passing state. */
  title: string;
  status: RuleStatus;
  detail: string;
  addrs: Address[];
  /**
   * True when the serializer guarantees this by construction rather than by
   * checking after the fact -- which is the real reason the output is always
   * lint-clean upstream.
   */
  structural?: boolean;
};

/**
 * Conformance with the Lucide icon standard, as consumed by `lucide-react`.
 *
 * Several of these can never fail: the document model has no way to express a
 * transform or a per-element stroke override, and the serializer emits a fixed
 * attribute set in a fixed order. Those are reported as structural guarantees
 * rather than as checks, because that distinction is the point -- upstream's
 * lint rules are satisfied by construction, not by inspection.
 */
export function checkConformance(doc: IconDoc): RuleResult[] {
  return [
    viewBoxRule(doc),
    strokeRule(doc),
    fillRule(doc),
    transformRule(),
    paddingRule(doc),
    nameRule(doc),
    precisionRule(doc),
    nodeBudgetRule(doc),
  ];
}

export const conformanceScore = (rules: readonly RuleResult[]): { pass: number; total: number } => ({
  pass: rules.filter((r) => r.status === 'pass').length,
  total: rules.length,
});

/* ------------------------------------------------------------------ */

function viewBoxRule(doc: IconDoc): RuleResult {
  const ok = doc.canvas.size === CANVAS;
  return {
    code: 'VIEWBOX',
    title: 'viewBox is 0 0 24 24',
    status: ok ? 'pass' : 'fail',
    detail: ok ? '24×24, square, origin at 0 0' : `canvas is ${doc.canvas.size}×${doc.canvas.size}`,
    addrs: [],
  };
}

function strokeRule(doc: IconDoc): RuleResult {
  const { width, cap, join } = doc.strokeSpec;
  const ok = width === STROKE_WIDTH && cap === 'round' && join === 'round';
  return {
    code: 'STROKE_SPEC',
    title: 'stroke-width 2, round cap and join',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? 'currentColor at width 2, round/round'
      : `width ${width}, cap ${cap}, join ${join}`,
    addrs: [],
    structural: true,
  };
}

function fillRule(doc: IconDoc): RuleResult {
  // Upstream forbids fills, with one measured exception: 10 icons draw solid
  // dots as a small <circle fill="currentColor">. Anything else is a fail.
  const offenders = doc.elements.filter(
    (el) => el.fill === 'currentColor' && !(el.kind === 'circle' && el.r <= 1),
  );
  const dots = doc.elements.filter((el) => el.fill === 'currentColor').length - offenders.length;

  return {
    code: 'FILL_PRESENT',
    title: 'fill is none',
    status: offenders.length === 0 ? 'pass' : 'fail',
    detail:
      offenders.length > 0
        ? `${offenders.length} filled ${offenders.length === 1 ? 'element' : 'elements'} that are not dots`
        : dots > 0
          ? `fill="none", with ${dots} currentColor dot${dots === 1 ? '' : 's'}`
          : 'fill="none" throughout',
    addrs: offenders.map((el) => ({ el: el.id })),
  };
}

function transformRule(): RuleResult {
  return {
    code: 'TRANSFORM',
    title: 'no transform attributes',
    status: 'pass',
    detail: 'unrepresentable: the model is flat, in world coordinates',
    addrs: [],
    structural: true,
  };
}

function paddingRule(doc: IconDoc): RuleResult {
  if (doc.elements.length === 0) {
    return {
      code: 'PADDING',
      title: 'visual bounds inside [1, 23]',
      status: 'pass',
      detail: 'no geometry',
      addrs: [],
    };
  }

  const box = visualBox(doc);
  const over = Math.max(
    VISUAL_MIN - box.minX,
    VISUAL_MIN - box.minY,
    box.maxX - VISUAL_MAX,
    box.maxY - VISUAL_MAX,
  );

  const offenders = doc.elements.filter((el) => {
    const b = elementVisualBox(el, doc.strokeSpec.width);
    return (
      b.minX < VISUAL_MIN - 1e-6 ||
      b.minY < VISUAL_MIN - 1e-6 ||
      b.maxX > VISUAL_MAX + 1e-6 ||
      b.maxY > VISUAL_MAX + 1e-6
    );
  });

  const ok = over <= 1e-6;
  return {
    code: 'PADDING',
    title: 'visual bounds inside [1, 23]',
    status: ok ? 'pass' : 'fail',
    // Nominal padding is 1, but it is measured on the *stroked* box, so
    // centrelines must stay inside [2, 22]. Conflating the two trips everyone up.
    detail: ok
      ? `stroked box ${fmt(box.minX)}–${fmt(box.maxX)}, centrelines inside [2, 22]`
      : `exceeds by ${fmt(over)} (measured on the stroked box, not the centreline)`,
    addrs: offenders.map((el) => ({ el: el.id })),
  };
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function nameRule(doc: IconDoc): RuleResult {
  const ok = KEBAB.test(doc.name);
  return {
    code: 'NAME',
    title: 'name is kebab-case',
    status: ok ? 'pass' : 'fail',
    detail: ok ? `"${doc.name}" → <${toPascal(doc.name)} />` : `"${doc.name}" is not kebab-case`,
    addrs: [],
  };
}

function precisionRule(doc: IconDoc): RuleResult {
  let worst = 0;
  const offenders: Address[] = [];

  for (const el of doc.elements) {
    let bad = false;
    for (const v of coordsOf(doc, el)) {
      const needed = decimalsNeeded(v);
      if (needed > worst) worst = needed;
      if (needed > DECIMALS) bad = true;
    }
    if (bad) offenders.push({ el: el.id });
  }

  const ok = offenders.length === 0;
  return {
    code: 'PRECISION',
    title: `coordinates within ${DECIMALS} decimals`,
    status: ok ? 'pass' : 'warn',
    detail: ok
      ? worst === 0
        ? 'all integers'
        : `at most ${worst} decimal${worst === 1 ? '' : 's'}`
      : `${offenders.length} element(s) round on export`,
    addrs: offenders,
  };
}

function nodeBudgetRule(doc: IconDoc): RuleResult {
  const offenders = doc.elements.filter((el) => countNodes(el) > 24);
  const ok = offenders.length === 0;
  const max = doc.elements.reduce((n, el) => Math.max(n, countNodes(el)), 0);
  return {
    code: 'NODE_COUNT',
    title: '24 nodes or fewer per element',
    status: ok ? 'pass' : 'warn',
    detail: ok
      ? `busiest element has ${max}`
      : `${describeElement(offenders[0]!)} has ${countNodes(offenders[0]!)} — usually an un-simplified import`,
    addrs: offenders.map((el) => ({ el: el.id })),
  };
}

/* ------------------------------------------------------------------ */

function* coordsOf(doc: IconDoc, el: (typeof doc.elements)[number]): Generator<number> {
  switch (el.kind) {
    case 'circle':
      yield el.c.x;
      yield el.c.y;
      yield el.r;
      return;
    case 'ellipse':
      yield el.c.x;
      yield el.c.y;
      yield el.rx;
      yield el.ry;
      return;
    case 'rect':
      yield el.x;
      yield el.y;
      yield el.w;
      yield el.h;
      yield el.rx;
      yield el.ry;
      return;
    case 'line':
      yield el.a.x;
      yield el.a.y;
      yield el.b.x;
      yield el.b.y;
      return;
    default:
      for (const list of nodeListsOf(el)) {
        for (const n of list.nodes) {
          yield n.p.x;
          yield n.p.y;
          if (n.in) {
            yield n.in.x;
            yield n.in.y;
          }
          if (n.out) {
            yield n.out.x;
            yield n.out.y;
          }
        }
      }
  }
}

function decimalsNeeded(v: number): number {
  for (let d = 0; d <= 6; d++) {
    const f = 10 ** d;
    if (Math.abs(Math.round(v * f) / f - v) < 1e-9) return d;
  }
  return 7;
}

const fmt = (n: number): string => String(round(n));

export function toPascal(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}
