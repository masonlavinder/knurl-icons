/**
 * This tool's catalog record.
 *
 * `packages/catalog/catalog.json` in knurled-studio is the source of truth for
 * part numbers, and this is a copy of one row of it — the same relationship
 * vendor/knurled-kit has to the kit. The studio's StudioFooter throws on a part
 * number it cannot find in the catalog, and the equivalent check here is that
 * this file and that row have to say the same thing.
 *
 * KS-003 is `max(existing) + 1` as of KS-002. Part numbers are never reused and
 * never renumbered.
 */
export interface CatalogEntry {
  readonly partNumber: string;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly status: 'ACTIVE' | 'MAINTAINED' | 'PROTOTYPE' | 'SHELVED';
  readonly url: string;
}

export const PART: CatalogEntry = {
  partNumber: 'KS-003',
  slug: 'icons',
  name: 'knurl-icons',
  tagline: 'Draws 24×24 stroke icons that pass as Lucide.',
  status: 'PROTOTYPE',
  url: 'https://icons.knurled.studio',
};

/** KS-000. Where every app points home. */
export const STUDIO_HOME = 'https://knurled.studio';
