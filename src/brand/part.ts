/**
 * What this tool calls itself, and where home is.
 *
 * `packages/catalog/catalog.json` in knurled-studio is the studio's manifest,
 * and these are the two fields of its row that the tool actually renders. The
 * part number and status live in the catalog because that is what indexes the
 * studio's tools — they are not something a tool has to wear, so they are not
 * mirrored here.
 */
export const PART = {
  name: 'knurl-icons',
  url: 'https://icons.knurled.studio',
} as const;

/** The studio itself. Where every app points home. */
export const STUDIO_HOME = 'https://knurled.studio';
