import { create } from 'zustand';

import { CANVAS } from '../core/constants.ts';

type ViewBox = { x: number; y: number; w: number; h: number };

type ViewState = {
  /** Pan/zoom expressed as a viewBox, so children stay in icon units. */
  viewBox: ViewBox;
  /**
   * Screen pixels per icon unit, measured from the live CTM.
   *
   * Never derived from a stored zoom factor: a stored value drifts on window
   * resize and CSS layout changes, and both the snap tolerance (6/zoom) and the
   * grab radius (10/zoom) would silently go wrong with it.
   */
  zoom: number;
  /**
   * The canvas element's width over its height. The view takes the same shape,
   * so the drawing fills the whole canvas rather than a square inside it.
   */
  aspect: number;
  showGrid: boolean;
  showKeylines: boolean;
  /** The side dock's width in CSS pixels, set by dragging its edge. */
  dockWidth: number;
  /**
   * Which sections of the dock are open. The open ones split the column's
   * height between them; a closed one is just its head.
   */
  sections: Record<SectionId, boolean>;

  setViewBox: (vb: ViewBox) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (factor: number, center: { x: number; y: number }) => void;
  /** Zoom about the middle of the current view — what a toolbar button wants. */
  zoomAtCenter: (factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
  /** Called from a ResizeObserver; keeps the view's centre where it was. */
  setAspect: (aspect: number) => void;
  toggleGrid: () => void;
  toggleKeylines: () => void;
  /** Clamped to what leaves the canvas usable; see clampDock. */
  setDockWidth: (px: number) => void;
  toggleSection: (id: SectionId) => void;
};

export type SectionId = 'elements' | 'code' | 'conformance' | 'shortcuts';

/**
 * How narrow and how wide the dock may be dragged.
 *
 * MIN is about the least the element rows and the code still read at. The
 * canvas keeps at least CANVAS_KEEP whatever the cap says: a dock dragged
 * across the whole window would leave nothing to draw on.
 */
const DOCK_MIN = 220;
const DOCK_MAX = 720;
const CANVAS_KEEP = 360;

/** Where the dock starts: about a quarter of the window, within sane bounds. */
export function defaultDockWidth(): number {
  // SSR and the node test environment have no window; assume it is roomy.
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
  return clampDock(Math.min(340, Math.max(260, vw * 0.28)));
}

function clampDock(px: number): number {
  const vw = typeof window === 'undefined' ? Infinity : window.innerWidth;
  const max = Math.max(DOCK_MIN, Math.min(DOCK_MAX, vw - CANVAS_KEEP));
  return Math.round(Math.min(max, Math.max(DOCK_MIN, px)));
}

export const DOCK_LIMITS = { MIN: DOCK_MIN, MAX: DOCK_MAX, CANVAS_KEEP };

/**
 * Widest and narrowest the view may get, in icon units, measured along its
 * SHORT side. That is the side the artboard has to fit across at Fit, so it is
 * the one that means "zoom" whatever shape the window is.
 */
const MAX_W = CANVAS * 4;
const MIN_W = CANVAS / 64;

/** The view's short side, which is what the zoom limits are measured on. */
export function span(vb: ViewBox): number {
  return Math.min(vb.w, vb.h);
}

/** A view of the given short side, in the given shape. */
function frame(short: number, aspect: number): { w: number; h: number } {
  return aspect >= 1 ? { w: short * aspect, h: short } : { w: short, h: short / aspect };
}

/**
 * Keep the view and the artboard maximally overlapped, on each axis.
 *
 *   · zoomed in on an axis (size < CANVAS) the artboard does not fit, so the
 *     view must sit ENTIRELY inside it: x runs [0, CANVAS - size], every value
 *     of which is nothing but artboard.
 *   · zoomed out on an axis (size >= CANVAS) the artboard fits, so it is
 *     centred. Any position in [CANVAS - size, 0] would keep it whole, but the
 *     view is no longer square: at Fit on a wide window the long axis has room
 *     to spare, and letting the artboard slide about in it would make a drag
 *     at Fit do something, when everything is already on screen and there is
 *     nowhere to go.
 *
 * The two axes are independent, so a wide window zoomed in a little can be
 * zoomed in vertically and out horizontally at once: the icon fills the
 * height, pans up and down, and stays centred across.
 *
 * There used to be half a screen of slack here, which is why the icon could be
 * shoved off the top. There is no slack now.
 *
 * Geometry outside the artboard is still reachable: zoomed out, the view is
 * bigger than the artboard and shows the ground around it.
 */
function clampAxis(v: number, size: number): number {
  const far = CANVAS - size;
  return far <= 0 ? far / 2 : Math.min(far, Math.max(0, v));
}

function clampSpan(short: number): number {
  return Math.min(MAX_W, Math.max(MIN_W, short));
}

/** Place a view of the given short side and shape, then keep it on the art. */
function place(x: number, y: number, short: number, aspect: number): ViewBox {
  const { w, h } = frame(clampSpan(short), aspect);
  return { x: clampAxis(x, w), y: clampAxis(y, h), w, h };
}

function clamp(vb: ViewBox, aspect: number): ViewBox {
  return place(vb.x, vb.y, span(vb), aspect);
}

/** The whole artboard, as large as the canvas allows, centred. */
function fit(aspect: number): ViewBox {
  return place(0, 0, CANVAS, aspect);
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewBox: fit(1),
  zoom: 1,
  aspect: 1,
  showGrid: true,
  showKeylines: false,
  dockWidth: defaultDockWidth(),
  // Conformance starts shut: its score rides in the head, and the per-rule
  // detail only matters once that stops reading N/N. Shortcuts are reference,
  // looked up rather than read, so they start shut too.
  sections: { elements: true, code: true, conformance: false, shortcuts: false },

  setViewBox: (viewBox) => set({ viewBox: clamp(viewBox, get().aspect) }),
  setZoom: (zoom) => {
    if (Math.abs(get().zoom - zoom) < 1e-9) return;
    set({ zoom });
  },

  zoomBy: (factor, center) => {
    const { viewBox: vb, aspect } = get();
    const { w, h } = frame(clampSpan(span(vb) / factor), aspect);
    // Keep the point under the cursor fixed.
    const kx = (center.x - vb.x) / vb.w;
    const ky = (center.y - vb.y) / vb.h;
    set({ viewBox: place(center.x - kx * w, center.y - ky * h, Math.min(w, h), aspect) });
  },

  zoomAtCenter: (factor) => {
    const vb = get().viewBox;
    get().zoomBy(factor, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
  },

  panBy: (dx, dy) => {
    const vb = get().viewBox;
    set({ viewBox: clamp({ ...vb, x: vb.x - dx, y: vb.y - dy }, get().aspect) });
  },

  reset: () => set({ viewBox: fit(get().aspect) }),
  setAspect: (aspect) => {
    if (!(aspect > 0) || Math.abs(aspect - get().aspect) < 1e-6) return;
    // Same zoom, same centre, new shape: a resize should feel like the window
    // opening around the drawing, not like the drawing moving.
    const vb = get().viewBox;
    const short = span(vb);
    const { w, h } = frame(short, aspect);
    const x = vb.x + vb.w / 2 - w / 2;
    const y = vb.y + vb.h / 2 - h / 2;
    set({ aspect, viewBox: place(x, y, short, aspect) });
  },
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleKeylines: () => set({ showKeylines: !get().showKeylines }),
  setDockWidth: (px) => {
    const dockWidth = clampDock(px);
    if (dockWidth !== get().dockWidth) set({ dockWidth });
  },
  toggleSection: (id) => {
    const sections = get().sections;
    set({ sections: { ...sections, [id]: !sections[id] } });
  },
}));

/** Exposed for the toolbar, so a button at the limit can disable itself. */
export const ZOOM_LIMITS = { MIN_W, MAX_W };
