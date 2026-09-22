import type { CSSProperties } from 'react';

import styles from './Knurl.module.css';

export interface KnurlProps {
  /**
   * Strip height in px. Omit for `--knurl-strip`, the depth every strip in
   * the studio uses. A row of diamonds is `--knurl-pitch` × √2 tall, so a
   * height that is not a whole number of rows cuts the bottom row.
   */
  height?: number;
}

/**
 * The texture strip: 2px lines on a 7px pitch, crossed at 45°.
 *
 * Geometry, not a raster texture, and the grain never rotates. Decorative, so
 * it is hidden from assistive technology.
 */
export function Knurl({ height }: KnurlProps) {
  return (
    <div
      aria-hidden="true"
      className={styles.knurl}
      style={
        height === undefined
          ? undefined
          : ({ '--knurl-height': `${String(height)}px` } as CSSProperties)
      }
    />
  );
}
