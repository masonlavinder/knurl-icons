import type { Draft } from 'immer';

import type { IconDoc, Selection } from '../model/types.ts';

/** Commands sharing a merge key coalesce into one history entry. */
export type MergeKey = string;

export type Command = {
  /** Human label, shown in the history panel. */
  label: string;
  mergeKey?: MergeKey;
  mutate: (draft: Draft<IconDoc>) => void;
  /** Where selection should land afterwards; defaults to repairing the old one. */
  selectionAfter?: (doc: IconDoc, prev: Selection) => Selection;
};

export function command(
  label: string,
  mutate: Command['mutate'],
  extra: Omit<Command, 'label' | 'mutate'> = {},
): Command {
  return { label, mutate, ...extra };
}
