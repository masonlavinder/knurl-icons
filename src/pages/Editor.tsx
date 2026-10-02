import { useCallback, useEffect, useRef } from 'react';

import { StudioFooter } from '../components/brand/StudioFooter.tsx';
import { Toolbar } from '../components/Toolbar.tsx';
import { alignSelection, centerSelection } from '../core/commands/ops/centerSelection.ts';
import { checkConformance } from '../core/io/import/lint.ts';
import { parseSvg } from '../core/io/import/parseSvg.ts';
import { serialize } from '../core/io/export/serialize.ts';
import type { IconDoc } from '../core/model/types.ts';
import { useDocStore } from '../stores/docStore.ts';
import { useSelectionStore } from '../stores/selectionStore.ts';
import {
  defaultDockWidth,
  DOCK_LIMITS,
  span,
  useViewStore,
  ZOOM_LIMITS,
} from '../stores/viewStore.ts';
import { CanvasRoot } from '../components/canvas/CanvasRoot.tsx';
import { useKeyboard } from '../hooks/useKeyboard.ts';
import { CodePanel } from '../components/panels/CodePanel.tsx';
import { ConformancePanel } from '../components/panels/ConformancePanel.tsx';
import { ElementListPanel } from '../components/panels/ElementListPanel.tsx';
import { ShortcutsPanel } from '../components/panels/ShortcutsPanel.tsx';
import { submitLink } from '../utils/submission.ts';

/** The platform's command key, as the shortcut hints spell it. */
const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

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

export default function Editor(): React.JSX.Element {
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
      <Toolbar page="editor" />
      <Workspace />
      <StudioFooter />
    </div>
  );
}

/** One arrow-key press of dock width; Shift takes bigger steps. */
const DOCK_STEP = 16;
const DOCK_STEP_BIG = 64;

/**
 * The seam between the dock and the canvas, which drags to resize the dock.
 *
 * A separator in ARIA terms, so it is reachable by Tab and the arrow keys move
 * it — a resize that only a mouse can do is not one everybody can do. A double
 * click puts the width back where it started.
 */
function DockResizer(): React.JSX.Element {
  const width = useViewStore((s) => s.dockWidth);
  const setWidth = useViewStore((s) => s.setDockWidth);
  // Where the drag began, so the edge follows the pointer exactly rather than
  // accumulating rounding from one move event to the next.
  const drag = useRef<{ x: number; w: number } | null>(null);
  const end = (): void => {
    drag.current = null;
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the side panel"
      aria-valuenow={width}
      aria-valuemin={DOCK_LIMITS.MIN}
      aria-valuemax={DOCK_LIMITS.MAX}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className="dock-resizer"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Captured, so the drag survives the pointer outrunning the seam; and
        // no default, so it does not start a text selection on the way.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: width };
      }}
      onPointerMove={(e) => {
        if (drag.current) setWidth(drag.current.w + e.clientX - drag.current.x);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setWidth(defaultDockWidth())}
      onKeyDown={(e) => {
        const step = e.shiftKey ? DOCK_STEP_BIG : DOCK_STEP;
        const delta = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        if (delta === 0) return;
        // The window-level shortcuts nudge the selection on arrows; this
        // press belongs to the seam.
        e.preventDefault();
        e.stopPropagation();
        setWidth(width + delta);
      }}
    />
  );
}

function Workspace(): React.JSX.Element {
  const dockWidth = useViewStore((s) => s.dockWidth);

  return (
    <div className="workspace" style={{ '--dock': `${dockWidth}px` } as React.CSSProperties}>
      {/* One column of sections, each opened and shut on its own; the open
          ones share the height. */}
      <aside className="col col-dock">
        <div className="dock">
          <FileBar />
          <ElementListPanel />
          <CodePanel />
          <ConformancePanel />
          <ShortcutsPanel />
        </div>
        <DockResizer />
      </aside>

      <main className="col col-canvas">
        <CanvasRoot />
        <ViewToggles />
        <HistoryControls />
        <div className="canvas-controls canvas-controls-bottom-left">
          <ZoomControls />
          <AlignControls />
        </div>
      </main>
    </div>
  );
}

/**
 * Grid and keylines, floated in the canvas's top-left corner. They change how
 * the artboard is drawn, so they sit on it — same construction as the zoom
 * controls in the corner below.
 */
function ViewToggles(): React.JSX.Element {
  const showGrid = useViewStore((s) => s.showGrid);
  const showKeylines = useViewStore((s) => s.showKeylines);
  const toggleGrid = useViewStore((s) => s.toggleGrid);
  const toggleKeylines = useViewStore((s) => s.toggleKeylines);

  return (
    <div className="canvas-controls canvas-controls-top-left" role="group" aria-label="View">
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
  );
}

/**
 * Move the selection to a fixed place on the artboard: centred (what Ctrl+E
 * does), or pushed up or down to the padding.
 *
 * Only there while something is selected. Without a selection Ctrl+E centres
 * the whole icon, but a row of buttons that silently act on everything would
 * be a trap the first time someone clicks one meaning a single shape.
 */
function AlignControls(): React.JSX.Element | null {
  const dispatch = useDocStore((s) => s.dispatch);
  const addrs = useSelectionStore((s) => s.selection.addrs);
  if (addrs.length === 0) return null;

  const doc = (): IconDoc => useDocStore.getState().doc;
  return (
    <div className="control-group" role="group" aria-label="Align selection">
      <button
        type="button"
        onClick={() => dispatch(centerSelection(doc(), addrs))}
        title={`Center on the canvas (${MOD} E)`}
      >
        Center
      </button>
      <button
        type="button"
        onClick={() => dispatch(alignSelection(doc(), addrs, 'top'))}
        title="Move up to the top padding"
      >
        Top
      </button>
      <button
        type="button"
        onClick={() => dispatch(alignSelection(doc(), addrs, 'bottom'))}
        title="Move down to the bottom padding"
      >
        Bottom
      </button>
    </div>
  );
}

/**
 * Undo and redo, floated in the canvas's top-right corner: they act on the
 * drawing, so they sit on it, opposite the view toggles. The selection count
 * and the last action's name sit just above them.
 */
function HistoryControls(): React.JSX.Element {
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const canUndo = useDocStore((s) => s.history.past.length > 0);
  const canRedo = useDocStore((s) => s.history.future.length > 0);
  const last = useDocStore((s) => s.history.past[s.history.past.length - 1]?.label);
  const count = useSelectionStore((s) => s.selection.addrs.length);

  return (
    <div className="canvas-controls canvas-controls-top-right">
      {/* Status, not controls. Set as labels so they cannot be read as
          buttons. Above Undo because "Last" is what Undo would take back. */}
      <div className="readouts">
        <span className="readout">{count} selected</span>
        <span className="readout">
          <span className="readout-key">Last</span>
          {last ?? '—'}
        </span>
      </div>
      <div className="control-group" role="group" aria-label="History">
        <button type="button" onClick={undo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={!canRedo}>
          Redo
        </button>
      </div>
    </div>
  );
}

/**
 * Zoom, floated over the canvas it acts on rather than up in the toolbar.
 *
 * In the corner by the dock, where it covers ground rather than artboard at
 * fit, and above the canvas in the stacking order so a drag or a wheel on the
 * artboard never lands on it by accident — and a click on it never reaches the
 * artboard.
 */
function ZoomControls(): React.JSX.Element {
  // The limits are on the view's short side, whatever shape the canvas is.
  const viewW = useViewStore((s) => span(s.viewBox));
  const zoomAtCenter = useViewStore((s) => s.zoomAtCenter);
  const reset = useViewStore((s) => s.reset);

  return (
    <div className="control-group" role="group" aria-label="Zoom">
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
    </div>
  );
}

/**
 * Open, Save and Submit, fixed at the head of the dock above every section.
 *
 * Not a section: there is nothing to fold away, and the two things you do to
 * a file should not move or disappear depending on which sections are open.
 */
function FileBar(): React.JSX.Element {
  const replace = useDocStore((s) => s.replace);
  const fileRef = useRef<HTMLInputElement>(null);

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

  /**
   * Serialize the document back out to a file the user can keep. Read from
   * the store on click, so the bar does not re-render on every edit.
   */
  const saveFile = useCallback(() => {
    const doc = useDocStore.getState().doc;
    const blob = new Blob([serialize(doc)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name || 'icon'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Offer the icon to the public library: a GitHub issue, pre-filled, that a
   * maintainer approves into a pull request. Only offered once the icon passes
   * every conformance rule, since the workflow would refuse it anyway.
   */
  const conforms = useDocStore((s) => checkConformance(s.doc).every((r) => r.status !== 'fail'));
  const submit = useCallback(() => {
    const doc = useDocStore.getState().doc;
    const svg = serialize(doc);
    const { url, svgInUrl } = submitLink(doc.name, svg);
    // Too big for the link: the issue form says to paste it from here.
    if (!svgInUrl) void navigator.clipboard.writeText(svg);
    window.open(url, '_blank', 'noopener');
  }, []);

  return (
    <div className="file-bar">
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
      <button
        type="button"
        onClick={submit}
        disabled={!conforms}
        title={
          conforms
            ? 'Submit to the public icon library (opens GitHub)'
            : 'Fix the failing conformance rules to submit'
        }
      >
        Submit
      </button>
    </div>
  );
}
