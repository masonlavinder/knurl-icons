import type { CSSProperties } from 'react';

import { Knurl } from './Knurl.tsx';
import { Mark } from './Mark.tsx';
import { PART, STUDIO_HOME } from './part.ts';
import { cx } from './cx.ts';
import styles from './StudioFooter.module.css';

/**
 * Every ink on the instrument, dark to light within each family.
 *
 * The studio's control strip reads the paper palette; this one reads what the
 * dark substrate actually resolves to, so the strip is a swatch of this tool
 * rather than a picture of a different one.
 */
const INKS = [
  '--stock-1000',
  '--stock-950',
  '--stock-800',
  '--stock-700',
  '--stock-600',
  '--stock-300',
  '--paper',
  '--lavinder-600',
  '--lavinder-400',
  '--verdigris-300',
] as const;

export interface StudioFooterProps {
  className?: string;
  /** Patch edge length in px. */
  inkSize?: number;
}

/**
 * The plate every app carries. One subdomain per tool, one footer across all
 * of them — this is what makes them read as one studio.
 *
 * The studio's version looks the part number up in @knurled/catalog and throws
 * on a miss. There is no catalog to read from here, so the record is mirrored
 * in part.ts and that file carries the obligation instead.
 */
export function StudioFooter({ className, inkSize = 9 }: StudioFooterProps) {
  return (
    <footer className={cx(styles.footer, className)}>
      <Knurl />
      <div className={styles.bar}>
        <div className={styles.identity}>
          <Mark size={16} />
          <span className={styles.partNumber}>{PART.partNumber}</span>
          <span className={styles.name}>{PART.name}</span>
          <span className={styles.chip}>{PART.status}</span>
        </div>

        <div
          aria-hidden="true"
          className={styles.inks}
          style={{ '--patch-size': `${String(inkSize)}px` } as CSSProperties}
        >
          {INKS.map((ink) => (
            <span
              key={ink}
              className={styles.patch}
              title={ink}
              style={{ '--ink': `var(${ink})` } as CSSProperties}
            />
          ))}
        </div>

        <a className={styles.home} href={STUDIO_HOME}>
          knurled.studio
        </a>
      </div>
    </footer>
  );
}
