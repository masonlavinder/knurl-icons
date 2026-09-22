import { useEffect } from 'react';

import { Mark } from './brand/Mark.tsx';
import { StudioFooter } from './brand/StudioFooter.tsx';
import { parseSvg } from './core/io/import/parseSvg.ts';
import { useDocStore } from './store/docStore.ts';
import { useSelectionStore } from './store/selectionStore.ts';
import { useViewStore } from './store/viewStore.ts';
import { CanvasRoot } from './ui/canvas/CanvasRoot.tsx';
import { useKeyboard } from './ui/hooks/useKeyboard.ts';
import { CodePanel } from './ui/panels/CodePanel.tsx';
import { ConformancePanel } from './ui/panels/ConformancePanel.tsx';
import { ElementListPanel } from './ui/panels/ElementListPanel.tsx';

/** A stand-in document so the canvas is not empty on first load. */
const SEED = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <circle cx="12" cy="12" r="10" />
  <path d="m16 9-5.5 5.5L8 12" />
</svg>
`;

export default function App(): React.JSX.Element {
  const replace = useDocStore((s) => s.replace);
  useKeyboard();

  useEffect(() => {
    try {
      replace(parseSvg(SEED).value, 'Open');
    } catch {
      // An unparseable seed is not worth blocking startup over.
    }
  }, [replace]);

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <aside className="col col-left">
          <ElementListPanel />
        </aside>
        <main className="col col-canvas">
          <CanvasRoot />
        </main>
        <aside className="col col-right">
          <CodePanel />
          <ConformancePanel />
        </aside>
      </div>
      <StudioFooter />
    </div>
  );
}

function Toolbar(): React.JSX.Element {
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const history = useDocStore((s) => s.history);
  const zoom = useViewStore((s) => s.zoom);
  const showGrid = useViewStore((s) => s.showGrid);
  const showKeylines = useViewStore((s) => s.showKeylines);
  const toggleGrid = useViewStore((s) => s.toggleGrid);
  const toggleKeylines = useViewStore((s) => s.toggleKeylines);
  const reset = useViewStore((s) => s.reset);
  const count = useSelectionStore((s) => s.selection.addrs.length);

  const last = history.past[history.past.length - 1];

  return (
    <header className="toolbar">
      <a className="lockup" href="https://knurled.studio">
        <Mark size={20} />
        <strong className="brand">Knurled Icons</strong>
      </a>

      <div className="group">
        <button type="button" onClick={undo} disabled={history.past.length === 0}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={history.future.length === 0}>
          Redo
        </button>
        <span className="muted">{last ? last.label : '—'}</span>
      </div>

      <div className="group">
        <button type="button" onClick={toggleGrid} aria-pressed={showGrid}>
          Grid
        </button>
        <button type="button" onClick={toggleKeylines} aria-pressed={showKeylines}>
          Keylines
        </button>
        <button type="button" onClick={reset}>
          Fit
        </button>
      </div>

      <div className="group right">
        <span className="muted">{count} selected</span>
        <span className="muted">{zoom.toFixed(1)}×</span>
      </div>
    </header>
  );
}
