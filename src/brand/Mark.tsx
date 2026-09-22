import type { CSSProperties } from 'react';

import { cx } from './cx.ts';
import styles from './Mark.module.css';

export interface MarkProps {
  /** Edge length in px. */
  size?: number;
  className?: string;
}

/**
 * The studio mark: a chamfered square, knurled.
 *
 * Both signature elements in one glyph, built from the same patterns the rest
 * of the app uses rather than drawn separately — so it cannot drift from the
 * components it sits next to. Decorative wherever a wordmark accompanies it.
 */
export function Mark({ size = 20, className }: MarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.shell, className)}
      style={{ '--mark-size': `${String(size)}px` } as CSSProperties}
    >
      <span className={styles.face} />
    </span>
  );
}
