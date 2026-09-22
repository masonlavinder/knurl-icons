/** Branded id type, so an element id can't be passed where a node id belongs. */
export type Id = string & { readonly __brand: 'Id' };

let counter = 0;

/**
 * Monotonic ids. Deliberately not random: deterministic ids make serializer
 * snapshots and corpus diffs stable across runs.
 */
export function makeId(prefix = 'x'): Id {
  counter += 1;
  return `${prefix}${counter.toString(36)}` as Id;
}

/** Test-only: reset the counter so fixtures are reproducible. */
export function __resetIds(): void {
  counter = 0;
}

export function asId(s: string): Id {
  return s as Id;
}
