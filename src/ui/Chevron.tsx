/**
 * The collapse chevron, drawn to the house icon spec — 24x24, stroke 2, round
 * cap and join. A hand-rolled glyph in an icon editor would be embarrassing.
 *
 * It always points the way the panel will move, which is the only reading that
 * survives being on both sides of the screen at once.
 */
export function Chevron({ direction }: { direction: 'left' | 'right' }): React.JSX.Element {
  return (
    <svg
      className="chev"
      data-point={direction}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export interface CollapseProps {
  /**
   * Omitted where the panel is not collapsible.
   *
   * `| undefined` is not noise: exactOptionalPropertyTypes is on, so an
   * optional property and one that may be passed as undefined are different
   * types, and every call site forwards a value that may be undefined.
   */
  onCollapse?: (() => void) | undefined;
  /** Which way the panel folds away. */
  side?: 'left' | 'right' | undefined;
}

/** The button that lives in a panel head and folds the panel away. */
export function CollapseButton({ onCollapse, side = 'left' }: CollapseProps): React.JSX.Element | null {
  if (!onCollapse) return null;
  const label = `Collapse the ${side} panel`;
  return (
    <button type="button" className="btn-head btn-collapse" title={label} aria-label={label} onClick={onCollapse}>
      <Chevron direction={side} />
    </button>
  );
}
