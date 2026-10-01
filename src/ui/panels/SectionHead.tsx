import { useViewStore, type SectionId } from '../../store/viewStore.ts';
import { Chevron } from '../Chevron.tsx';

/**
 * The head of one section of the dock: the title is the disclosure, and
 * anything else passed in sits at the far end of the band.
 *
 * The controls are siblings of the toggle, not children of it — a Copy button
 * inside a button is invalid markup and would fold the section on every copy.
 * Keeping them in the head means a shut section still offers them: the SVG
 * can be copied, and the conformance score read, without opening either.
 */
export function SectionHead({
  id,
  title,
  children,
}: {
  id: SectionId;
  title: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const open = useViewStore((s) => s.sections[id]);
  const toggle = useViewStore((s) => s.toggleSection);

  return (
    <div className="panel-head section-head">
      <button
        type="button"
        className="section-toggle"
        aria-expanded={open}
        onClick={() => toggle(id)}
      >
        <Chevron direction={open ? 'down' : 'right'} />
        <span>{title}</span>
      </button>
      {children && <div className="panel-head-actions">{children}</div>}
    </div>
  );
}

/** Whether a section is open — for the panel that owns the body. */
export function useSectionOpen(id: SectionId): boolean {
  return useViewStore((s) => s.sections[id]);
}
