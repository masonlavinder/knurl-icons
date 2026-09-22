import { useCallback, useEffect, useRef } from 'react';

import { Mark } from './brand/Mark.tsx';
import { StudioFooter } from './brand/StudioFooter.tsx';
import { parseSvg } from './core/io/import/parseSvg.ts';
import { serialize } from './core/io/export/serialize.ts';
import { useDocStore } from './store/docStore.ts';
import { useSelectionStore } from './store/selectionStore.ts';
import { useViewStore, ZOOM_LIMITS } from './store/viewStore.ts';
import { CanvasRoot } from './ui/canvas/CanvasRoot.tsx';
import { useKeyboard } from './ui/hooks/useKeyboard.ts';
import { CodePanel } from './ui/panels/CodePanel.tsx';
import { ConformancePanel } from './ui/panels/ConformancePanel.tsx';
import { ElementListPanel } from './ui/panels/ElementListPanel.tsx';
import { Chevron } from './ui/Chevron.tsx';

/** One toolbar click of zoom. Matches roughly two wheel notches. */
const ZOOM_STEP = 1.4;

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
      <Workspace />
      <StudioFooter />
    </div>
  );
}

/**
 * The handle that opens and closes a panel, sitting on the panel's inner edge.
 *
 * On the seam rather than inside the head: the edge is what moves, so that is
 * where the grip belongs, and it stays in the same place whether the panel is
 * open or shut. Half-height-centred so it is findable without hunting along a
 * full-height rail.
 */
function EdgeToggle({
  side,
  open,
  onToggle,
}: {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const label = `${open ? 'Collapse' : 'Expand'} the ${side} panel`;
  // Open, it points outward to fold the panel away; closed, back toward the
  // canvas to bring it out.
  const pointsLeft = side === 'left' ? open : !open;

  return (
    <button
      type="button"
      className="edge-toggle"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Chevron direction={pointsLeft ? 'left' : 'right'} />
    </button>
  );
}

/**
 * A collapsed panel: the panel, narrowed — not a rail bolted to the side of
 * the workspace. It keeps the surface, the head band and the rule under it,
 * and sets the panel's own name down the strip, so the closed state reads as
 * the same object as the open one.
 */
function CollapsedPanel({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="panel panel-collapsed" aria-hidden="true">
      <div className="panel-head" />
      <span className="panel-collapsed-label">{label}</span>
    </div>
  );
}

function Workspace(): React.JSX.Element {
  const leftOpen = useViewStore((s) => s.leftOpen);
  const rightOpen = useViewStore((s) => s.rightOpen);
  const toggleLeft = useViewStore((s) => s.toggleLeft);
  const toggleRight = useViewStore((s) => s.toggleRight);

  return (
    <div
      className="workspace"
      data-left={leftOpen ? 'open' : 'closed'}
      data-right={rightOpen ? 'open' : 'closed'}
    >
      {/* Unmounted rather than hidden: the panels subscribe to the document,
          and a collapsed one has no business re-rendering on every drag. */}
      <aside className="col col-left">
        {leftOpen ? <ElementListPanel /> : <CollapsedPanel label="Elements" />}
        <EdgeToggle side="left" open={leftOpen} onToggle={toggleLeft} />
      </aside>

      <main className="col col-canvas">
        <CanvasRoot />
      </main>

      <aside className="col col-right">
        <EdgeToggle side="right" open={rightOpen} onToggle={toggleRight} />
        {rightOpen ? (
          <div className="col-stack">
            <CodePanel />
            <ConformancePanel />
          </div>
        ) : (
          <CollapsedPanel label="SVG" />
        )}
      </aside>
    </div>
  );
}

function Toolbar(): React.JSX.Element {
  const replace = useDocStore((s) => s.replace);
  const doc = useDocStore((s) => s.doc);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const history = useDocStore((s) => s.history);
  const zoom = useViewStore((s) => s.zoom);
  const viewW = useViewStore((s) => s.viewBox.w);
  const showGrid = useViewStore((s) => s.showGrid);
  const showKeylines = useViewStore((s) => s.showKeylines);
  const toggleGrid = useViewStore((s) => s.toggleGrid);
  const toggleKeylines = useViewStore((s) => s.toggleKeylines);
  const zoomAtCenter = useViewStore((s) => s.zoomAtCenter);
  const reset = useViewStore((s) => s.reset);
  const count = useSelectionStore((s) => s.selection.addrs.length);

  const fileRef = useRef<HTMLInputElement>(null);
  const last = history.past[history.past.length - 1];

  /**
   * Read an .svg off disk and make it the document.
   *
   * The file input stays hidden and is driven by the button, because a styled
   * <input type="file"> is a fight with the browser that nobody wins. Resetting
   * `value` afterwards is what lets the same file be opened twice in a row —
   * without it the second change event never fires.
   */
  const openFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { value } = parseSvg(await file.text());
        replace({ ...value, name: file.name.replace(/\.svg$/i, '') }, 'Open');
      } catch {
        // A file that will not parse is not worth tearing the document down
        // over. The code panel is where an import reports what went wrong.
      }
    },
    [replace],
  );

  /** Serialize the document back out to a file the user can keep. */
  const saveFile = useCallback(() => {
    const blob = new Blob([serialize(doc)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name || 'icon'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  return (
    <header className="toolbar">
      <a className="lockup" href="https://knurled.studio">
        <Mark size={20} />
        <strong className="brand">Knurled Icons</strong>
      </a>

      <div className="group">
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="sr-only"
          onChange={(e) => void openFile(e)}
        />
        <button type="button" onClick={() => fileRef.current?.click()}>
          Open
        </button>
        <button type="button" onClick={saveFile}>
          Save
        </button>
      </div>

      <div className="group">
        <button type="button" onClick={undo} disabled={history.past.length === 0}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={history.future.length === 0}>
          Redo
        </button>
      </div>

      <div className="group">
        <button type="button" className="btn-toggle" onClick={toggleGrid} aria-pressed={showGrid}>
          Grid
        </button>
        <button
          type="button"
          className="btn-toggle"
          onClick={toggleKeylines}
          aria-pressed={showKeylines}
        >
          Keylines
        </button>
      </div>

      <div className="group">
        <button
          type="button"
          className="btn-icon"
          onClick={() => zoomAtCenter(1 / ZOOM_STEP)}
          disabled={viewW >= ZOOM_LIMITS.MAX_W - 1e-9}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={() => zoomAtCenter(ZOOM_STEP)}
          disabled={viewW <= ZOOM_LIMITS.MIN_W + 1e-9}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button type="button" onClick={reset}>
          Fit
        </button>
        {/* data-zoom, not a positional selector: scripts/check-m0.mjs reads
            this readout, and "the last .muted in the toolbar" broke the moment
            another status field was added beside it. */}
        <span className="readout" data-zoom>
          {zoom.toFixed(1)}×
        </span>
      </div>

      <div className="group right">
        {/* Status, not controls. Set as labels so they cannot be read as
            buttons the way the last-action readout was. */}
        <span className="readout">{count} selected</span>
        <span className="readout">
          <span className="readout-key">Last</span>
          {last ? last.label : '—'}
        </span>
      </div>
    </header>
  );
}
