import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The cascade order is a source-order invariant, and it fails silently.
 *
 * `@layer` takes its position from wherever its name first appears. The brand
 * components' CSS Modules open `@layer components`; global.css declares the
 * real order. If a module reaches the bundle first, `components` is pinned at
 * position one, the declaration appends the rest after it, and `a` in `base`
 * starts beating `.home` in `components` — which is how every external link in
 * the footer came out accent-purple instead of verdigris. Nothing throws, no
 * build warning, and it is invisible until two rules collide.
 *
 * Imports are hoisted and evaluated in source order, so the guard is that the
 * stylesheets are written above anything that pulls in a component.
 */
const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, '..', 'main.tsx'), 'utf8');

const at = (specifier: string) => main.indexOf(`'${specifier}'`);

describe('cascade order', () => {
  it('imports global.css before any other stylesheet', () => {
    const global = at('../vendor/knurled-kit/global.css');
    expect(global).toBeGreaterThan(-1);

    for (const sheet of [
      '../vendor/knurled-kit/tokens.css',
      '../vendor/knurled-kit/fonts.css',
      './brand/instrument.css',
      './index.css',
    ]) {
      expect(at(sheet), `${sheet} must come after global.css`).toBeGreaterThan(global);
    }
  });

  it('imports every stylesheet before the component tree', () => {
    const app = at('./App.tsx');
    expect(app).toBeGreaterThan(-1);

    // App pulls in src/brand, whose modules open @layer components.
    expect(at('../vendor/knurled-kit/global.css')).toBeLessThan(app);
    expect(at('./index.css')).toBeLessThan(app);
  });
});
