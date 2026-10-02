import categories from '../../library/categories.json';
import type { LibraryMeta } from './submission.ts';

/**
 * The published library, read at build time. Vite (and vitest) inline these
 * globs, so the gallery ships with every icon and fetches nothing.
 *
 * Bundler-only: node scripts read library/ off disk instead.
 */

export type Category = { title: string; description: string };

/** library/categories.json: the only categories an icon may claim. */
export const CATEGORIES: Readonly<Record<string, Category>> = categories;

const SVGS = import.meta.glob<string>('../../library/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const METAS = import.meta.glob<LibraryMeta>('../../library/icons/*.json', {
  import: 'default',
  eager: true,
});

export type LibraryIcon = { name: string; svg: string; meta: LibraryMeta | undefined };

const stem = (path: string): string => path.replace(/^.*\/|\.\w+$/g, '');

/** Every icon by name, with its metadata — undefined only for a broken pair. */
export function libraryIcons(): LibraryIcon[] {
  const metas = new Map(Object.entries(METAS).map(([p, m]) => [stem(p), m]));
  return Object.entries(SVGS)
    .map(([path, svg]) => ({ name: stem(path), svg, meta: metas.get(stem(path)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Metadata files with no SVG beside them. */
export function orphanMetas(): string[] {
  const names = new Set(Object.keys(SVGS).map(stem));
  return Object.keys(METAS)
    .map(stem)
    .filter((n) => !names.has(n));
}
