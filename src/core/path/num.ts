import { DECIMALS } from '../constants.ts';

/**
 * Round to the serialized precision. Every geometry value must pass through
 * this *before* relative deltas are computed -- see emit.ts. Rounding after
 * differencing is the classic bug: the emitted relative chain then no longer
 * reproduces the absolute values the parser will compute.
 */
export function round(n: number): number {
  const f = 10 ** DECIMALS;
  // +0 normalizes -0 to 0, so "-0" never reaches the output.
  return Math.round(n * f) / f + 0;
}

/**
 * Format a number the way the upstream corpus does: rounded, trailing zeros
 * stripped, leading zero elided.
 *
 * Measured across 2102 icons: 2314 occurrences elide the leading zero and 2 do
 * not (both inside the single hand-written icon), so elision is the convention.
 *
 *   3.50  -> "3.5"      4.00 -> "4"
 *   0.5   -> ".5"      -0.5  -> "-.5"
 */
export function formatNum(n: number): string {
  const r = round(n);
  if (!Number.isFinite(r)) return '0';

  let s = r.toFixed(DECIMALS);
  // strip trailing zeros, then a trailing dot
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  // elide the leading zero
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = `-${s.slice(2)}`;
  if (s === '-0') s = '0';
  return s;
}

/**
 * Whether a separator is required between two already-formatted numbers.
 *
 * A minus sign self-delimits. A leading '.' self-delimits *only* when the
 * previous token already contains a '.', because the previous number's decimal
 * point is then already spent: "1.5" + ".5" reads as two numbers, but
 * "1" + ".5" would read as the single number 1.5.
 */
export function needsSep(prev: string, next: string): boolean {
  if (prev === '') return false;
  if (next.startsWith('-')) return false;
  if (next.startsWith('.') && prev.includes('.')) return false;
  return true;
}

/** Join formatted numbers with the minimum necessary separators. */
export function joinNums(nums: readonly string[]): string {
  let out = '';
  let prev = '';
  for (const n of nums) {
    if (needsSep(prev, n)) out += ' ';
    out += n;
    prev = n;
  }
  return out;
}
