import { useCallback, useEffect, useRef, useState } from 'react';

import { insertNode } from '../../core/commands/ops/nodeOps.ts';
import { deleteAddresses } from '../../core/commands/ops/deleteAddresses.ts';
import { hitWidthUnits, PAN_THRESHOLD_PX } from '../../core/constants.ts';
import { controlsOf, nodeListsOf } from '../../core/model/access.ts';
import { decodeAddr, encodeAddr, promoteToSubpath } from '../../core/model/address.ts';
import type { Address, Element, Node } from '../../core/model/types.ts';
import { elementToPathData, toTagAndAttrs } from '../../core/render/tagAttrs.ts';
import { useDocStore } from '../../store/docStore.ts';
import {
  beginDrag,
  cancelDrag,
  commitDrag,
  dragMoved,
  isDragging,
  updateDrag,
} from '../../store/dragSession.ts';
import { useSelectionStore } from '../../store/selectionStore.ts';
import { useViewStore } from '../../store/viewStore.ts';
import { nodeColor } from '../nodeColor.ts';
import { GridLayer } from './GridLayer.tsx';

/**
 * The single canvas SVG, in four sibling layers.
 *
 * Pan and zoom go through `viewBox`, never a `<g transform>`: children stay in
 * icon units, so `stroke-width="2"` means literally two units, and the browser's
 * own CTM is the authoritative unit-to-screen mapping.
 */
export function CanvasRoot(): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  /**
   * An in-flight pan.
   *
   * `moved` is what separates a drag of the background from a click on it. A
   * click clears the selection; a drag must not, or letting go after shoving
   * the canvas around would also throw away what you had selected. So the
   * clear is deferred to pointerup and only happens if the pointer stayed put.
   */
  const panRef = useRef<{ x: number; y: number; moved: boolean; clearOnUp: boolean } | null>(null);
  /**
   * What the pointer last went down on.
   *
   * setPointerCapture RETARGETS the click and dblclick that follow to the
   * capturing element, so by the time dblclick fires `e.target` is the <svg>
   * and the shape underneath is unrecoverable from the event. Recording it at
   * pointerdown -- before capture is taken -- is the only reliable source.
   */
  const downRef = useRef<{ addr: Address; seg: string | null; wasSelected: boolean } | null>(null);

  /** Cursor feedback only. The pan itself is driven entirely by panRef. */
  const [panning, setPanning] = useState(false);

  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const viewBox = useViewStore((s) => s.viewBox);
  const zoom = useViewStore((s) => s.zoom);
  const setZoom = useViewStore((s) => s.setZoom);
  const zoomBy = useViewStore((s) => s.zoomBy);
  const panBy = useViewStore((s) => s.panBy);

  const keys = useSelectionStore((s) => s.keys);
  const hover = useSelectionStore((s) => s.hover);
  const setHover = useSelectionStore((s) => s.setHover);
  const select = useSelectionStore((s) => s.select);
  const toggle = useSelectionStore((s) => s.toggle);
  const clear = useSelectionStore((s) => s.clear);

  /** Measure zoom from the live CTM rather than tracking it separately. */
  const measureZoom = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (ctm) setZoom(ctm.a);
  }, [setZoom]);

  useEffect(() => {
    measureZoom();
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measureZoom);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [measureZoom, viewBox]);

  const toUnits = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Middle button pans from anywhere, including from on top of geometry.
      if (e.button === 1) {
        panRef.current = { x: e.clientX, y: e.clientY, moved: false, clearOnUp: false };
        setPanning(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;

      const target = (e.target as globalThis.Element).closest('[data-addr]');
      const key = target?.getAttribute('data-addr');
      if (!key) {
        // Empty canvas: drag pans, click clears. Which one it was is not known
        // yet, so take the capture and decide at pointerup.
        downRef.current = null;
        panRef.current = { x: e.clientX, y: e.clientY, moved: false, clearOnUp: true };
        setPanning(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      const addr = decodeAddr(key);
      if (!addr) return;
      const wasSelected = keys.has(encodeAddr(addr));
      downRef.current = { addr, seg: target?.getAttribute('data-seg') ?? null, wasSelected };

      // Alt on a segment inserts a node where the pointer met the curve.
      if (e.altKey && 'segment' in addr) {
        const seg = downRef.current?.seg;
        if (seg) {
          const [, subId, index] = seg.split('|');
          dispatch(
            insertNode(
              { el: addr.el, sub: subId ? (subId as typeof addr.el) : undefined, index: Number(index) },
              toUnits(e),
            ),
          );
          return;
        }
      }

      const resolved: Address = e.altKey && !('node' in addr) ? promoteToSubpath(addr) : addr;
      const already = keys.has(encodeAddr(resolved));

      if (e.metaKey || e.ctrlKey) toggle(resolved);
      else if (!already) select(resolved);
      // If it was already selected, hold the selection for now: a plain click
      // on it lets go, but only once we know the gesture was not a drag.

      // Capture on the SVG itself so the drag survives the pointer leaving the
      // shape. Capture belongs in the handler, never in an effect -- StrictMode
      // double-invokes effects and would leak the capture.
      e.currentTarget.setPointerCapture(e.pointerId);
      const dragging = e.metaKey || e.ctrlKey ? [...useSelectionStore.getState().selection.addrs] : [resolved];
      beginDrag(dragging, toUnits(e), dragLabel(resolved));
    },
    [clear, dispatch, keys, select, toggle, toUnits],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panRef.current) {
        const pan = panRef.current;
        const vb = useViewStore.getState().viewBox;
        const k = vb.w / (svgRef.current?.clientWidth ?? 1);
        const dx = e.clientX - pan.x;
        const dy = e.clientY - pan.y;
        // A couple of pixels of travel is a click with a shaky hand, not a
        // drag. Below the threshold the selection still clears on release.
        if (!pan.moved && Math.hypot(dx, dy) > PAN_THRESHOLD_PX) pan.moved = true;
        panBy(dx * k, dy * k);
        pan.x = e.clientX;
        pan.y = e.clientY;
        return;
      }

      if (isDragging()) {
        // Cmd/Ctrl temporarily disables snapping -- the mandatory escape hatch.
        updateDrag(toUnits(e), { snap: !(e.metaKey || e.ctrlKey), zoom });
        return;
      }

      const target = (e.target as globalThis.Element).closest('[data-addr]');
      setHover(target?.getAttribute('data-addr') ?? null);
    },
    [panBy, setHover, toUnits, zoom],
  );

  const endPointer = useCallback(
    (e: React.PointerEvent) => {
      const pan = panRef.current;
      panRef.current = null;
      if (pan) {
        if (pan.clearOnUp && !pan.moved) clear();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setPanning(false);
        return;
      }
      // A click on something already selected releases it -- but only when the
      // gesture did not move anything, or dragging a selected node would
      // deselect it the instant you let go.
      const down = downRef.current;
      // Segments are insertion targets, not things you hold selected -- and
      // releasing one here unmounts the chrome before the dblclick that follows
      // can reach it, which silently breaks insert-on-double-click.
      const releasable = down && !('segment' in down.addr);
      if (down && releasable && down.wasSelected && !dragMoved() && !e.metaKey && !e.ctrlKey) {
        toggle(down.addr);
      }
      commitDrag();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [clear, toggle],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const down = downRef.current;
      if (!down) return;
      const { addr, seg } = down;

      // Double-click a node to remove it; the neighbours are refitted so the
      // curve keeps its shape instead of developing a kink.
      if ('node' in addr && !('handle' in addr) && !('segment' in addr)) {
        dispatch(deleteAddresses([addr], 'rejoin'));
        return;
      }
      // Double-click a segment to insert one where the pointer met the curve.
      if (seg) {
        const [, subId, index] = seg.split('|');
        dispatch(
          insertNode(
            { el: addr.el, sub: subId ? (subId as typeof addr.el) : undefined, index: Number(index) },
            toUnits(e),
          ),
        );
      }
    },
    [dispatch, toUnits],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isDragging()) cancelDrag();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const centre = toUnits(e);
      if (e.ctrlKey || e.metaKey) {
        zoomBy(Math.exp(-e.deltaY / 200), centre);
      } else {
        const vb = useViewStore.getState().viewBox;
        const k = vb.w / 24;
        panBy(-e.deltaX * k * 0.05, -e.deltaY * k * 0.05);
      }
    },
    [panBy, toUnits, zoomBy],
  );

  const hitWidth = hitWidthUnits(zoom, doc.strokeSpec.width);

  return (
    <svg
      ref={svgRef}
      className={panning ? 'canvas is-panning' : 'canvas'}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onLostPointerCapture={endPointer}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
    >
      <GridLayer />

      {/* Visible geometry. Never hit-tested: the hit layer owns that. */}
      <g className="l-render" pointerEvents="none">
        {doc.elements.map((el) => (
          <RenderedElement key={el.id} el={el} stroke={doc.strokeSpec} />
        ))}
      </g>

      {/* Invisible element-level targets. */}
      <g className="l-hit">
        {doc.elements.map((el) => (
          <HitShape key={el.id} el={el} width={hitWidth} />
        ))}
      </g>

      {/* Chrome, plus fine-grained targets for whatever is selected. */}
      <g className="l-overlay">
        {doc.elements.map((el) => {
          const anySelected = [...keys].some((k) => k === `e:${el.id}` || k.startsWith(`e:${el.id}/`));
          const hovered = hover?.startsWith(`e:${el.id}`) ?? false;
          return (
            <ElementChrome
              key={el.id}
              el={el}
              zoom={zoom}
              hitWidth={hitWidth}
              outlined={anySelected || hovered}
              showNodes={anySelected}
              selectedKeys={keys}
            />
          );
        })}
      </g>
    </svg>
  );
}

function dragLabel(addr: Address): string {
  if ('handle' in addr) return 'Shape curve';
  if ('node' in addr) return 'Move node';
  return 'Move element';
}

function RenderedElement({
  el,
  stroke,
}: {
  el: Element;
  stroke: { width: number; cap: string; join: string };
}): React.JSX.Element | null {
  const { tag, attrs } = toTagAndAttrs(el);
  if (!attrs) return null;
  const Tag = tag as 'path';
  return (
    <Tag
      {...(attrs as Record<string, string>)}
      fill={el.fill ?? 'none'}
      stroke="currentColor"
      strokeWidth={stroke.width}
      strokeLinecap={stroke.cap as 'round'}
      strokeLinejoin={stroke.join as 'round'}
    />
  );
}

/**
 * One invisible target per element, mirroring the visible geometry.
 *
 * `stroke="transparent"` is load-bearing: `stroke="none"` produces no hit region
 * at all, silently. The round cap matters too, or the grab area at a line's
 * endpoint is a zero-width butt cap.
 */
function HitShape({ el, width }: { el: Element; width: number }): React.JSX.Element | null {
  const d = elementToPathData(el);
  if (!d) return null;
  return (
    <path
      d={d}
      fill="none"
      stroke="transparent"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="stroke"
      data-addr={encodeAddr({ el: el.id })}
    />
  );
}

/**
 * Selection outline, plus node and handle targets for the selected element.
 *
 * Fine targets mount only for the selected element, which keeps the DOM small
 * and makes the addressing fall out naturally: the first click selects the
 * element, revealing the finer targets the next click can reach.
 */
function ElementChrome({
  el,
  zoom,
  hitWidth,
  outlined,
  showNodes,
  selectedKeys,
}: {
  el: Element;
  zoom: number;
  hitWidth: number;
  outlined: boolean;
  showNodes: boolean;
  selectedKeys: Set<string>;
}): React.JSX.Element | null {
  if (!outlined && !showNodes) return null;
  const d = elementToPathData(el);
  const r = 4.5 / zoom;
  const hr = 3.5 / zoom;

  return (
    <g>
      {outlined && d && (
        <path
          className="sel-outline"
          d={d}
          fill="none"
          pointerEvents="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Primitives have no node list; their endpoints and centres are drawn
          here so a line is as draggable as a polyline. */}
      {showNodes &&
        controlsOf(el).map((c, i) => {
          const addr: Address = { el: el.id, node: c.id };
          const key = encodeAddr(addr);
          const picked = selectedKeys.has(key);
          const anyPicked = [...selectedKeys].some((k) => k.includes('/n:'));
          return (
            <g key={key}>
              <circle
                className={anyPicked && !picked ? 'node-ring is-dimmed' : 'node-ring'}
                cx={c.p.x}
                cy={c.p.y}
                r={r * 1.5}
                fill="none"
                stroke={nodeColor(i)}
                pointerEvents="none"
              />
              <circle
                className={`node-dot node-straight${picked ? ' is-selected' : ''}`}
                cx={c.p.x}
                cy={c.p.y}
                r={r}
                data-addr={key}
                pointerEvents="all"
              >
                <title>{c.label}</title>
              </circle>
            </g>
          );
        })}

      {showNodes &&
        nodeListsOf(el).map((list, li) => {
          // Once a node is picked, the others recede rather than the picked one
          // changing colour: dimming the context keeps the selected node the
          // brightest thing on the canvas.
          const anyNodePicked = [...selectedKeys].some((k) => k.includes('/n:'));
          const segCount = list.closed ? list.nodes.length : list.nodes.length - 1;
          const addrFor = (n: Node): Address =>
            list.subId === null
              ? { el: el.id, node: n.id }
              : { el: el.id, sub: list.subId, node: n.id };

          return (
            <g key={list.subId ?? li}>
              {/* Segment targets, for inserting a node into this run. */}
              {Array.from({ length: segCount }, (_, i) => {
                const from = list.nodes[i]!;
                const to = list.nodes[(i + 1) % list.nodes.length]!;
                const segAddr: Address =
                  list.subId === null
                    ? { el: el.id, node: to.id, segment: true }
                    : { el: el.id, sub: list.subId, node: to.id, segment: true };
                return (
                  <path
                    key={`s${i}`}
                    className="seg-target"
                    d={segmentPath(from, to)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={hitWidth}
                    strokeLinecap="round"
                    pointerEvents="stroke"
                    data-addr={encodeAddr(segAddr)}
                    data-seg={`${el.id}|${list.subId ?? ''}|${i + 1}`}
                  />
                );
              })}

              {/* Handles, drawn behind their anchors. */}
              {list.nodes.map((n) => {
                const base = addrFor(n);
                return (
                  <g key={`h${n.id}`}>
                    {(['in', 'out'] as const).map((which) => {
                      const h = n[which];
                      if (!h) return null;
                      const hAddr: Address = { ...base, handle: which } as Address;
                      return (
                        <g key={which}>
                          <line
                            className="handle-arm"
                            x1={n.p.x}
                            y1={n.p.y}
                            x2={h.x}
                            y2={h.y}
                            pointerEvents="none"
                            vectorEffect="non-scaling-stroke"
                          />
                          <circle
                            className={
                              selectedKeys.has(encodeAddr(hAddr)) ? 'handle-dot is-selected' : 'handle-dot'
                            }
                            cx={h.x}
                            cy={h.y}
                            r={hr}
                            data-addr={encodeAddr(hAddr)}
                            pointerEvents="all"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Anchors. */}
              {list.nodes.map((n, i) => {
                const addr = addrFor(n);
                const key = encodeAddr(addr);
                const isEnd = !list.closed && (i === 0 || i === list.nodes.length - 1);
                const role = isEnd ? 'node-end' : n.in || n.out ? 'node-curved' : 'node-straight';
                return (
                  <g key={key}>
                    {/* Identity ring. The same hue marks this node's row in the
                        element tree, so the two panels refer to each other
                        without needing labels on the canvas. */}
                    <circle
                      className={
                        anyNodePicked && !selectedKeys.has(key) ? 'node-ring is-dimmed' : 'node-ring'
                      }
                      cx={n.p.x}
                      cy={n.p.y}
                      r={r * 1.5}
                      fill="none"
                      stroke={nodeColor(i)}
                      pointerEvents="none"
                    />
                    <circle
                      className={`node-dot ${role}${selectedKeys.has(key) ? ' is-selected' : ''}`}
                      cx={n.p.x}
                      cy={n.p.y}
                      r={isEnd ? r * 1.1 : r}
                      data-addr={key}
                      pointerEvents="all"
                    >
                      <title>
                        {isEnd ? (i === 0 ? 'Start' : 'End') : n.in || n.out ? 'Curved' : 'Corner'}{' '}
                        node {i}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </g>
          );
        })}
    </g>
  );
}

/** The drawn path of one segment, used as its insertion target. */
function segmentPath(from: Node, to: Node): string {
  const m = `M${from.p.x} ${from.p.y}`;
  if (to.arc) {
    const deg = (to.arc.rot * 180) / Math.PI;
    return `${m}A${to.arc.rx} ${to.arc.ry} ${deg} ${to.arc.largeArc ? 1 : 0} ${to.arc.sweep ? 1 : 0} ${to.p.x} ${to.p.y}`;
  }
  if (from.out || to.in) {
    const c1 = from.out ?? from.p;
    const c2 = to.in ?? to.p;
    return `${m}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.p.x} ${to.p.y}`;
  }
  return `${m}L${to.p.x} ${to.p.y}`;
}
