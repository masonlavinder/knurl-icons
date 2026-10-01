/**
 * The collapse chevron, drawn to the house icon spec — 24x24, stroke 2, round
 * cap and join. A hand-rolled glyph in an icon editor would be embarrassing.
 *
 * On a section head it points right when shut and down when open, the usual
 * disclosure reading.
 */
export function Chevron({ direction }: { direction: 'right' | 'down' }): React.JSX.Element {
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
