import type { Node, Pt, Subpath } from '../model/types.ts';
import { formatNum, needsSep, round } from './num.ts';

type Form = { letter: string; nums: number[] };
/** Each command has exactly two renderings; `rel` === `abs` for Z. */
type Candidate = { abs: Form; rel: Form };

/**
 * Serialize subpaths to a `d` attribute.
 *
 * THE load-bearing rule: coordinates are rounded to output precision *first*,
 * and relative deltas are then computed from the already-rounded previous
 * absolute point. Emitting deltas from unrounded values and rounding afterwards
 * is the classic bug -- the emitted relative chain then drifts away from the
 * absolute values a parser will reconstruct, and idempotence fails.
 *
 * Absolute-vs-relative selection is an exact search, not a greedy per-command
 * choice, because the choices interact: a repeated command letter may be
 * omitted, and after `M` the implicit continuation is `L` (after `m`, `l`). So a
 * relative moveto can pay for itself by letting following linetos drop their
 * letters. Greedy cannot see that.
 */
export function emitPath(subpaths: readonly Subpath[]): string {
  const cands: Candidate[] = [];
  let cur: Pt = { x: 0, y: 0 };

  for (const sp of subpaths) {
    const nodes = sp.nodes;
    if (nodes.length === 0) continue;

    const first = nodes[0]!;
    const startAbs = roundPt(first.p);
    cands.push(moveTo(startAbs, cur));
    cur = startAbs;

    for (let i = 1; i < nodes.length; i++) {
      const toAbs = roundPt(nodes[i]!.p);
      cands.push(segmentTo(nodes[i - 1]!, nodes[i]!, cur, toAbs));
      cur = toAbs;
    }

    if (sp.closed) {
      // The implicit closing segment runs from the last node back to the first.
      const last = nodes[nodes.length - 1]!;
      if (nodes.length > 1 && isCurved(last, first)) {
        const toAbs = roundPt(first.p);
        cands.push(segmentTo(last, first, cur, toAbs));
        cur = toAbs;
      }
      // Upstream uses both cases with no discernible rule; lowercase is the
      // majority (379 vs 136), so it is the canonical form here.
      const z: Form = { letter: 'z', nums: [] };
      cands.push({ abs: z, rel: z });
      cur = startAbs;
    }
  }

  return solve(cands);
}

/* ------------------------------------------------------------------ */
/* Shortest-encoding search                                            */
/* ------------------------------------------------------------------ */

type State = { letter: string; prevNum: string };

/** A token's trailing state depends only on its own chosen form. */
function stateOf(f: Form): State {
  const last = f.nums.length > 0 ? formatNum(f.nums[f.nums.length - 1]!) : '';
  return { letter: f.letter, prevNum: last };
}

/**
 * The objective is lexicographic: shortest output, then fewest explicit command
 * letters, then a per-command absolute/relative preference. Each weight exceeds
 * the largest achievable sum of the tier below it, so a lower tier can never
 * outvote a higher one.
 *
 * The letter-count tier distinguishes upstream's `m14 12 4 4 4-4` from
 * `M14 12l4 4 4-4`: both are 14 characters, but the relative moveto lets both
 * following linetos inherit their letter, spending one letter instead of two.
 * Where letter counts also tie (`M5 3 2 6` vs `m5 3-3 3`), the moveto
 * preference decides and upstream takes the absolute form.
 */
const LENGTH_WEIGHT = 1024 * 1024;
const LETTER_WEIGHT = 1024;

const isMove = (f: Form): boolean => f.letter === 'M' || f.letter === 'm';

/**
 * Lowest tier: a moveto prefers absolute (`M12 13v7`), every other command
 * prefers relative (`M12 2v2`, not `M12 2V4`).
 */
function penalty(f: Form, isRelative: boolean): number {
  return isMove(f) === isRelative ? 1 : 0;
}

function weigh(f: Form, prev: State, isRelative: boolean): number {
  const text = renderToken(f, prev);
  const emittedLetter = text.length > 0 && /[A-Za-z]/.test(text[0]!) ? 1 : 0;
  return text.length * LENGTH_WEIGHT + emittedLetter * LETTER_WEIGHT + penalty(f, isRelative);
}

/** Exact search by dynamic programming over two states per command. */
function solve(cands: readonly Candidate[]): string {
  if (cands.length === 0) return '';

  const START: State = { letter: '', prevNum: '' };
  const cost: [number, number][] = [];
  const back: [number, number][] = [];

  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]!;
    const forms: [Form, Form] = [c.abs, c.rel];
    const row: [number, number] = [Infinity, Infinity];
    const bk: [number, number] = [0, 0];

    for (let f = 0; f < 2; f++) {
      if (i === 0) {
        row[f] = weigh(forms[f]!, START, f === 1);
        continue;
      }
      const prev = cands[i - 1]!;
      const prevForms: [Form, Form] = [prev.abs, prev.rel];
      for (let g = 0; g < 2; g++) {
        const base = cost[i - 1]![g]!;
        if (!Number.isFinite(base)) continue;
        const total = base + weigh(forms[f]!, stateOf(prevForms[g]!), f === 1);
        if (total < row[f]!) {
          row[f] = total;
          bk[f] = g;
        }
      }
    }
    cost.push(row);
    back.push(bk);
  }

  const lastRow = cost[cost.length - 1]!;
  let choice = lastRow[0]! <= lastRow[1]! ? 0 : 1;

  const picks: number[] = new Array<number>(cands.length).fill(0);
  for (let i = cands.length - 1; i >= 0; i--) {
    picks[i] = choice;
    choice = back[i]![choice]!;
  }

  let out = '';
  let state = START;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]!;
    const form = picks[i] === 0 ? c.abs : c.rel;
    out += renderToken(form, state);
    state = stateOf(form);
  }
  return out;
}

/**
 * Render one command given the trailing state of the previous one.
 *
 * A repeated command letter may be omitted; after `M` the implicit continuation
 * is `L`, and after `m` it is `l`.
 */
function renderToken(f: Form, prev: State): string {
  const implicit = prev.letter === 'M' ? 'L' : prev.letter === 'm' ? 'l' : prev.letter;
  const omit = f.letter === implicit && f.nums.length > 0;

  let out = '';
  let prevNum = '';
  if (omit) {
    prevNum = prev.prevNum;
  } else {
    out += f.letter;
  }

  for (const n of f.nums) {
    const s = formatNum(n);
    if (needsSep(prevNum, s)) out += ' ';
    out += s;
    prevNum = s;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Command construction                                                */
/* ------------------------------------------------------------------ */

function roundPt(p: Pt): Pt {
  return { x: round(p.x), y: round(p.y) };
}

/** A segment is curved if it carries handles or an arc. */
function isCurved(from: Node, to: Node): boolean {
  return to.arc !== undefined || from.out !== undefined || to.in !== undefined;
}

function moveTo(abs: Pt, cur: Pt): Candidate {
  return {
    abs: { letter: 'M', nums: [abs.x, abs.y] },
    rel: { letter: 'm', nums: [round(abs.x - cur.x), round(abs.y - cur.y)] },
  };
}

function segmentTo(from: Node, to: Node, cur: Pt, toAbs: Pt): Candidate {
  const dx = round(toAbs.x - cur.x);
  const dy = round(toAbs.y - cur.y);

  if (to.arc) {
    const a = to.arc;
    const head = [
      round(a.rx),
      round(a.ry),
      round((a.rot * 180) / Math.PI),
      a.largeArc ? 1 : 0,
      a.sweep ? 1 : 0,
    ];
    return {
      abs: { letter: 'A', nums: [...head, toAbs.x, toAbs.y] },
      rel: { letter: 'a', nums: [...head, dx, dy] },
    };
  }

  if (from.out !== undefined || to.in !== undefined) {
    // A cubic with one handle missing degenerates that handle onto its anchor.
    const c1 = roundPt(from.out ?? from.p);
    const c2 = roundPt(to.in ?? to.p);
    return {
      abs: { letter: 'C', nums: [c1.x, c1.y, c2.x, c2.y, toAbs.x, toAbs.y] },
      rel: {
        letter: 'c',
        nums: [
          round(c1.x - cur.x),
          round(c1.y - cur.y),
          round(c2.x - cur.x),
          round(c2.y - cur.y),
          dx,
          dy,
        ],
      },
    };
  }

  if (dy === 0 && dx !== 0) {
    return { abs: { letter: 'H', nums: [toAbs.x] }, rel: { letter: 'h', nums: [dx] } };
  }
  if (dx === 0 && dy !== 0) {
    return { abs: { letter: 'V', nums: [toAbs.y] }, rel: { letter: 'v', nums: [dy] } };
  }
  return {
    abs: { letter: 'L', nums: [toAbs.x, toAbs.y] },
    rel: { letter: 'l', nums: [dx, dy] },
  };
}
