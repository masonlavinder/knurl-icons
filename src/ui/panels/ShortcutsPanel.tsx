import { SectionHead, useSectionOpen } from './SectionHead.tsx';

/**
 * Every gesture and key the editor answers to, in one place.
 *
 * Its own section rather than a footer under the element list: it is looked up
 * rather than read, so it can sit shut until wanted and give its height to the
 * sections that are worked in. Kept in step with useKeyboard by hand — a key
 * the editor handles but this list omits is a key nobody finds.
 */
export function ShortcutsPanel(): React.JSX.Element {
  const open = useSectionOpen('shortcuts');
  const m = mod();

  return (
    <div className="panel panel-shortcuts" data-open={open}>
      <SectionHead id="shortcuts" title="Shortcuts" />

      <div className="panel-body" hidden={!open}>
        <dl className="hint">
          <div>
            <dt>Click</dt>
            <dd>select · click again to deselect · {m}-click to add</dd>
          </div>
          <div>
            <dt>Drag</dt>
            <dd>move nodes, handles or a whole shape · empty canvas pans</dd>
          </div>
          <div>
            <dt>Arrows</dt>
            <dd>nudge half a unit · Shift for a whole unit</dd>
          </div>
          <div>
            <dt>Del</dt>
            <dd>delete what is selected · Alt-Del splits a path at the node</dd>
          </div>
          <div>
            <dt>Esc</dt>
            <dd>clear the selection</dd>
          </div>
          <div>
            <dt>Tab</dt>
            <dd>step through elements</dd>
          </div>
          <div>
            <dt>{m} E</dt>
            <dd>center the selection on the canvas</dd>
          </div>
          <div>
            <dt>{m} Z</dt>
            <dd>undo · Shift to redo</dd>
          </div>
          <div>
            <dt>Scroll</dt>
            <dd>pan · {m}-scroll to zoom · 0 to fit</dd>
          </div>
          <div>
            <dt>G · K</dt>
            <dd>toggle the grid · toggle the keylines</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

const mod = (): string =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
