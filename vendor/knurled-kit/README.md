# vendor/knurled-kit

A mirror of `@knurled/kit` from the [knurled-studio][studio] monorepo. **Do not
edit these files.** Change them upstream and run `pnpm kit:sync`.

## Why a mirror and not a dependency

A GitHub repository can publish exactly one Pages site, and `knurled-studio`
already publishes `knurled.studio`. So this app cannot live in that workspace
as `apps/icons` without giving up `icons.knurled.studio`, and a pnpm workspace
dependency is not available across repositories. Until the kit is published to
a registry, a checked-in mirror is the honest version of the coupling.

## What is here

| File | Upstream |
|---|---|
| `global.css` | `packages/kit/src/global.css` |
| `tokens.css` | `packages/kit/src/tokens.css` |
| `patterns.css` | `packages/kit/src/patterns.css` |
| `fonts.css` | `packages/kit/src/fonts.css` |
| `stylelint-config.js` | `packages/stylelint-config/index.js` |

Components are **not** mirrored. `src/brand` reimplements `Mark`, `Knurl` and
`StudioFooter` against the dark work surface, so copying them over would
overwrite a deliberate adaptation. They compose from `patterns.css` here, which
is what keeps their geometry from drifting.

## Staying current

```sh
pnpm kit:check   # verify the mirror matches upstream — non-zero on drift
pnpm kit:sync    # pull upstream over the mirror
```

Both resolve upstream at `../knurled-studio`; set `KNURLED_STUDIO` to override.
`kit:check` is deliberately not in the deploy workflow — CI has no copy of the
studio repo to compare against, and a mirror that is merely *behind* is not a
broken build. Run it when you touch the kit.

## Deviations

There are none in these files, by construction. Everything this app does
differently lives in [`src/brand/instrument.css`](../../src/brand/instrument.css),
which repoints the semantic aliases at the dark end of the same ramp, and in
[`stylelint.config.js`](../../stylelint.config.js), which extends the mirrored
config rather than editing it.

[studio]: https://github.com/masonlavinder/knurled-studio
