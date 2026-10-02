# library

The published icons, MIT licensed (see [LICENSE](../LICENSE)). The gallery at
`/icons/` reads this folder at build time, and every icon is also served at
`/icons/<name>.svg`.

```
library/
  categories.json        the only categories an icon may claim
  icons/
    <name>.svg           the drawing, always in serializer output form
    <name>.json          its metadata
```

`icons/` is flat on purpose. The name is the identity: it is the file name,
the download URL and the `<PascalCase />` component name. Categories are
metadata, so filing an icon in a second category, or renaming a category,
never moves a file or breaks a link.

## Naming

- kebab-case: `spirit-level`, not `spiritLevel` or `Spirit Level`
- name the thing, not what it is for: `hex-nut`, not `assemble`
- a variant of a base shape puts the base first: `square-chamfer`, like
  Lucide's `circle-check`, so variants sort together. A thing with its own
  name keeps it: `hex-nut`, `set-square`
- no style or size suffixes (`-outline`, `-24`): every icon is one stroke
  style at one size

## Categories

Optional, and an icon may have several, from [categories.json](categories.json).
An icon with none is shelved under **Other** in the gallery until someone files
it.

| id | for |
|---|---|
| `editor` | drawing and construction: nodes, guides, the artboard |
| `hardware` | fasteners, springs, plates and other parts |
| `measure` | tools that measure, mark out or level |
| `shapes` | primitive forms and surface finishes |

Adding a category means adding it to `categories.json` **and** to the
`category` dropdown in
[submit-icon.yml](../.github/ISSUE_TEMPLATE/submit-icon.yml), in the same
order. A test fails if the two disagree.

## Tags

The search terms for an icon, and only that:

- lowercase, kebab-case, one concept per tag: `fastener`, `bolt`
- leave out words already in the name, since search matches the name anyway
- prefer what someone would type over what the thing is called in a catalogue
- three to five is plenty

## Metadata

```json
{
  "contributors": ["github-login"],
  "tags": ["fastener", "bolt", "hexagon", "thread"],
  "categories": ["hardware"]
}
```

This is Lucide's per-icon format without `$schema`, so an icon can move
upstream with its metadata intact. `contributors` are GitHub logins, the
original author first.

## Adding an icon

**From the editor** (the usual way): draw it, get every conformance rule to
pass, and press **Submit**. That opens a pre-filled issue titled
`Icon: <name>`, and the title is where the name comes from. Filing the issue
runs [accept-icon.yml](../.github/workflows/accept-icon.yml), which opens a PR
that adds the pair, with a preview. Editing the issue updates the PR. Merging
the PR deploys the icon, and that merge is the only review step.

**By hand** (maintainers): add the `.svg` and `.json` to `icons/`, then run

```sh
pnpm library:format   # rewrite every SVG as serializer output
pnpm test             # src/library.test.ts checks the whole library
```

The test fails on anything that would not survive a Submit: a file not in
serializer form, a conformance rule that does not pass (warnings included), a
missing or orphaned `.json`, an unknown category, or malformed tags.
