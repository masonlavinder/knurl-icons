# library

The published icons, MIT licensed (see [LICENSE](../LICENSE)). Each icon is a pair:

- `<name>.svg`: the editor's serializer output, never a hand-edited file
- `<name>.json`: `{ contributors, tags, categories }`, Lucide's per-icon format

Icons arrive through the editor's **Submit** button. It opens a pre-filled issue,
a maintainer labels it `approved`, and
[accept-icon.yml](../.github/workflows/accept-icon.yml) opens a PR that adds the
pair. The PR is merged by hand, and the merge deploys it. The gallery at
`/icons/` reads this folder at build time, and every icon is also served at
`/icons/<name>.svg`.
