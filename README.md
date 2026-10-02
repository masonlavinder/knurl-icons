# Knurled Icons

A library of free 24×24 stroke icons that conform to the Lucide / `lucide-react`
standard, and the browser editor they are made in. Built by Knurled Studio.

| URL | Page |
|---|---|
| `/` | home |
| `/icons/` | the public library, every icon downloadable at `/icons/<name>.svg` |
| `/editor/` | the editor |

## Running it

```bash
pnpm install
pnpm dev              # http://localhost:5173 (editor at /editor/)
```

```bash
pnpm typecheck        # tsc --noEmit, strict
pnpm lint             # eslint
pnpm lint:css         # the studio design rules — chamfers, tokens, no faked light
pnpm test             # unit tests (fast, no corpus needed)
pnpm corpus:fetch     # download the pinned upstream corpus into .cache/
pnpm test:all         # unit + corpus gates (~18s)
pnpm corpus:drift     # byte-identity report against upstream
pnpm kit:check        # verify the mirrored studio kit matches upstream
node scripts/check-m0.mjs   # M0 gate, in a real browser (dev server must be up)
pnpm check:view       # view gate: the icon cannot be panned or zoomed off screen
pnpm library:format   # rewrite library icons as serializer output (library:check to verify)
```

## Layout

```
src/core/        pure. no react, no zustand, no DOM. node-testable, worker-movable.
  model/         document types, addressing, element access
  geom/          points, boxes, arcs, node-deletion refit
  path/          `d` parsing, number formatting, shortest-encoding emitter
  io/            SVG import + deterministic serializer
  render/        element -> tag/attrs, shared by the serializer AND the canvas
  commands/      command + history types, delete semantics
src/pages/       Home, Gallery (/icons/), Editor — one per HTML entry
src/components/  brand (mark, footer), canvas layers, dock panels
src/hooks/       keyboard
src/stores/      zustand stores: document, selection, view, drag
src/utils/       small helpers + DOM/XML adapters injected into core (browser + node)
src/test/        corpus loader and comparison helpers shared by tests and scripts
src/instrument.css  the one substrate deviation from the studio kit
library/         the published icons: icons/<name>.svg + .json, categories.json
```

`src/core/**` must never import React, zustand, or touch `window`/`document`.
That constraint is what makes moving the pipeline into a worker later a
`postMessage` wrapper rather than a rewrite.

## Submitting icons

The editor's **Submit** button (enabled once every conformance rule passes)
opens a pre-filled GitHub issue. Labelling it `approved` runs
[accept-icon.yml](.github/workflows/accept-icon.yml), which re-parses and
re-lints the SVG, writes the editor's own serializer output to `library/icons/`, and
opens a PR with a preview. Merging the PR deploys the icon. Icons are MIT
licensed; see [LICENSE](LICENSE) and [library/README.md](library/README.md).

## Brand

The design system comes from `@knurled/kit` in
the [knurled-studio][studio] monorepo, mirrored into `styles`
because a GitHub repository can publish only one Pages site and that repo
already publishes `knurled.studio` — see [styles/README.md] for
what that costs and how to stay current. `styles/stylelint-config.js`
is mirrored along with it, so a banned `border-radius` fails the build here for
the same reason it does there.

The tokens, type, chamfer, knurl and 4px grid are the studio's, unmodified.
There is exactly one deviation and it lives in `src/instrument.css`: the
studio is light — "one theme, and it is light" — and this is not. An icon is
judged against the ground it will sit on, so the editor keeps a dark work
surface. What that file does is repoint the *semantic aliases* at the dark end
of the same ink ramp, which is why `patterns.css` is consumed verbatim and every
fragment in it comes out correct without an override.

[studio]: https://github.com/masonlavinder/knurled-studio
[styles/README.md]: styles/README.md

## Document model

Three commitments, each load-bearing:

- **Primitives stay primitives.** `<circle>`, `<rect>`, `<line>`, `<ellipse>` and
  `<polyline>` survive import as themselves. Flattening everything to `<path>`
  would make round-tripping impossible and turn every diff against upstream into
  noise. Conversion to path is an explicit, lossy user action.
- **Control points are absolute**, not deltas. Relative handles mean every drag
  touches two numbers and every transform needs a special case.
- **No groups, no layers, no transforms — ever.** A flat element list in world
  coordinates. `transform` lets geometry lie about where it is, breaks snapping,
  and makes stroke width context-dependent. Import reports one; the editor can
  never create one.

The model never contains an SVG string. Strings exist only at the import and
export boundaries.

## Corpus gates

The serializer is tested against 1847 real upstream Lucide icons, pinned by
commit in `src/test/corpus/corpus.lock.json`.

Byte-identical round-tripping of that corpus is **impossible by construction**:
it contains at least two incompatible SVGO dialects (leading-zero elision, arc
flag packing, hand-spaced commands, both `Z` and `z`), so it is not the output of
any single deterministic serializer. The gates are therefore:

1. **Idempotence** — `serialize(parse(x))` is a byte-level fixed point, and
   geometry is preserved to within half an output ulp.
2. **Pixel identity** — upstream and our output rasterize identically through the
   same renderer, at 24/96/384px. 1840 of 1847 icons meet this at hard zero; the
   rest are an explicit allowlist in `roundtrip.test.ts`, each with a reason.

Byte-identity is reported as a non-gating drift metric (currently ~67%), broken
down by cause so dialect drift shows up as a number before it becomes a problem.

### Deliberate deviations from upstream

| Choice | Cost | Why |
|---|---|---|
| 3 decimal places | 4 icons round | Covers all but 23 values corpus-wide; error 0.0013px at 64px |
| Arc flags spaced (`0 0 1`) | ~507 icons differ | Packing (`001`) is unreadable and §9 ranks readable diffs above minification |
| `Q`/`T` elevated to `C` | 9 icons | One curve type in the model is worth the extra control point |
| Lowercase `z` | 91 icons | Majority form upstream (379 vs 136); upstream itself is inconsistent |
| `rect` as `width height x y` | 136 icons | Majority form upstream (271 vs 136) |

## Editing

Direct manipulation on the canvas, with the panels for exact numbers:

- **Drag** a node, a bézier handle, or a whole shape. Everything snaps to the
  half grid; hold Cmd/Ctrl to override it. A whole gesture is one undo step.
- **Double-click a segment** to insert a node where the pointer met the curve —
  split by de Casteljau, so the shape does not move. Arcs are split in arc space
  and stay arcs.
- **Double-click a node** to remove it. The neighbouring segments are refitted
  into one, so the join keeps its shape instead of developing a kink.
- **Arrow keys** nudge by 0.5 (Shift for 1), **Ctrl/Cmd+E** centres the
  selection, **Tab** steps through elements, **Del** removes the selection.
- **Drag empty canvas** to pan; middle-drag pans from anywhere. Scroll pans,
  Ctrl/Cmd-scroll zooms, the toolbar has −/+/Fit, and `0` fits.
- The view and the artboard are always **maximally overlapped**. Zoomed out
  that means the whole icon is on screen; zoomed in it means the screen is
  nothing but artboard. So the icon can never be cut off by panning, and at
  fit a drag does nothing because there is nowhere to go. Geometry that has
  been dragged outside the artboard is still reachable — past 24 units the
  view is wider than the artboard, so zooming out shows the ground around it.
  `pnpm check:view` proves this against the running app and
  `src/stores/viewStore.test.ts` against the store, over 2000 interleaved pans
  and zooms.
- Each node carries a stable hue, shown as a ring on the canvas and a matching
  swatch in the element tree, so the two panels identify each other without
  labels on the drawing.

Curvature is a two-state toggle per node rather than a corner/smooth/symmetric
cycle: a cycle cannot be undone by clicking again, which is exactly what people
expect from a control that just added something visible.

## Status

**M0, the parser/serializer core, and a working editor** — 38/38 browser checks
against the running app, 27 unit tests, strict typecheck and design-rule lint
clean. Deployed to [icons.knurled.studio](https://icons.knurled.studio) from
`main` on every push.

Still to come, in plan order: the full import normalizer with transform
flattening and `<use>`/CSS resolution (M1), the remaining authoring tools — pen,
fillet, mirror/repeat (M2), the preview matrix (M3), the export targets (M4),
and fill→stroke centreline recovery (M5).
