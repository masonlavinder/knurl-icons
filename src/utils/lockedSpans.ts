/**
 * Which parts of the serialized SVG the editor owns rather than the author.
 *
 * Two different kinds of "locked" live in the root tag, and the distinction is
 * worth keeping:
 *
 *   · `spec`  — house spec. Editable, and the conformance panel checks them:
 *               stroke-width 2, round cap and join, a 24x24 viewBox. Type
 *               something else and the document takes it and reports a fail.
 *   · `fixed` — the model cannot express anything else, so whatever is typed
 *               is discarded on the next round-trip. The namespace, and the
 *               fact that the stroke is one spec for the whole icon rather
 *               than per element.
 *
 * Both are document-wide: they sit on the root, they apply to every element,
 * and there is no per-element override anywhere in the model. That is the part
 * worth showing in the panel, because the markup gives no hint of it.
 *
 * Only the root open tag is considered. Everything after it is geometry, and
 * geometry is the author's.
 */
export type LockKind = 'spec' | 'fixed';

export interface Span {
  start: number;
  end: number;
  kind: LockKind;
  /** Why it is marked, shown on hover. */
  note: string;
}

const ROOT_ATTRS: Record<string, { kind: LockKind; note: string }> = {
  xmlns: { kind: 'fixed', note: 'Fixed. The serializer always emits the SVG namespace.' },
  width: { kind: 'spec', note: 'House spec: 24. Document-wide.' },
  height: { kind: 'spec', note: 'House spec: 24. Document-wide.' },
  viewBox: { kind: 'spec', note: 'House spec: 0 0 24 24. Checked by the conformance panel.' },
  fill: { kind: 'spec', note: 'House spec: none. Per-element fill is allowed only on dots.' },
  stroke: { kind: 'fixed', note: 'Fixed: currentColor, so the icon inherits its color.' },
  'stroke-width': {
    kind: 'spec',
    note: 'House spec: 2, and one width for the whole icon — the model has no per-element override.',
  },
  'stroke-linecap': {
    kind: 'spec',
    note: 'House spec: round, and one cap for the whole icon.',
  },
  'stroke-linejoin': {
    kind: 'spec',
    note: 'House spec: round, and one join for the whole icon.',
  },
};

/** End of the root open tag, or -1 if there is not one to find. */
function rootTagEnd(text: string): number {
  const open = text.indexOf('<svg');
  if (open < 0) return -1;

  // The first '>' outside a quoted value closes the tag. Attribute values can
  // contain '>' — a path `d` easily does — so quotes have to be tracked.
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

/** The locked attribute spans in `text`, in order, non-overlapping. */
export function lockedSpans(text: string): Span[] {
  const end = rootTagEnd(text);
  if (end < 0) return [];

  const head = text.slice(0, end);
  const spans: Span[] = [];
  const attr = /([a-zA-Z-]+)\s*=\s*"[^"]*"/g;

  let m: RegExpExecArray | null;
  while ((m = attr.exec(head)) !== null) {
    const name = m[1];
    const entry = name === undefined ? undefined : ROOT_ATTRS[name];
    if (entry) spans.push({ start: m.index, end: m.index + m[0].length, ...entry });
  }
  return spans;
}
