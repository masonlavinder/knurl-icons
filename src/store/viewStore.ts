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
  showGrid: boolean;
  showKeylines: boolean;
  /** Side panels. Collapsed to a rail rather than unmounted. */
  leftOpen: boolean;
  rightOpen: boolean;

  setViewBox: (vb: ViewBox) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (factor: number, center: { x: number; y: number }) => void;
  /** Zoom about the middle of the current view — what a toolbar button wants. */
  zoomAtCenter: (factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
  toggleGrid: () => void;
  toggleKeylines: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
};

/**
 * Narrower than this and the two side panels plus a usable artboard do not fit
 * across the window at once.
 *
 * 300 + 340 of chrome leaves 460 for the canvas at 1100, which is about the
 * least that is worth drawing on. Below it both panels start collapsed — a
 * portrait window opened to three full columns is the thing this rail exists
 * to prevent, and it should not need a click to fix on arrival.
 */
const NARROW_PX = 1100;

/** SSR and the node test environment have no window; assume it is roomy. */
function roomy(): boolean {
  return typeof window === 'undefined' || window.innerWidth >= NARROW_PX;
}

/** Widest and narrowest the view may get, in icon units. */
const MAX_W = CANVAS * 4;
const MIN_W = CANVAS / 64;

/**
 * How far past the artboard the view may travel, as a fraction of its own
 * width.
 *
 * Half a screen of slack is what makes the artboard unlosable. The bound is
 * the viewBox's own size rather than a fixed number of icon units, so it means
 * the same thing at every zoom: you can always push the artboard to the far
 * edge and no further, and at least half the screen is showing artboard.
 *
 * Two consequences fall out of the half, and both are worth knowing. The
 * pannable range is `CANVAS - w + 2·(w/2)` = exactly CANVAS wide at every
 * zoom, so panning always feels the same distance end to end. And at either
 * extreme the visible artboard is exactly `w/2` — half the viewport — so the
 * icon is never a sliver in a corner.
 *
 * It needs no special case at either end. Zoomed in the range is still wide
 * enough to reach every edge of the icon: at w = 6 it runs [-3, 21] and the
 * right edge needs only x >= 18. Zoomed out past the artboard the same bound
 * keeps it whole on screen: at w = 96 it runs [-48, -24], and every value in
 * that range contains 0..24 entire.
 */
const PAN_SLACK = 0.5;

function clampAxis(v: number, size: number): number {
  const slack = size * PAN_SLACK;
  return Math.min(CANVAS - size + slack, Math.max(-slack, v));
}

/**
 * Keep the artboard on screen.
 *
 * Every write to viewBox goes through here — there is no path that sets one
 * directly — so no gesture, however fast or however combined, can strand the
 * icon outside the viewport. Clamping at the store rather than in each handler
 * is what makes that true of the wheel, the drag and the buttons at once.
 */
function clamp(vb: ViewBox): ViewBox {
  const w = Math.min(MAX_W, Math.max(MIN_W, vb.w));
  const h = w;
  return { x: clampAxis(vb.x, w), y: clampAxis(vb.y, h), w, h };
}

const INITIAL = clamp({ x: 0, y: 0, w: CANVAS, h: CANVAS });

export const useViewStore = create<ViewState>((set, get) => ({
  viewBox: INITIAL,
  zoom: 1,
  showGrid: true,
  showKeylines: false,
  leftOpen: roomy(),
  rightOpen: roomy(),

  setViewBox: (viewBox) => set({ viewBox: clamp(viewBox) }),
  setZoom: (zoom) => {
    if (Math.abs(get().zoom - zoom) < 1e-9) return;
    set({ zoom });
  },

  zoomBy: (factor, center) => {
    const vb = get().viewBox;
    const w = Math.min(MAX_W, Math.max(MIN_W, vb.w / factor));
    // Keep the point under the cursor fixed.
    const kx = (center.x - vb.x) / vb.w;
    const ky = (center.y - vb.y) / vb.h;
    set({ viewBox: clamp({ x: center.x - kx * w, y: center.y - ky * w, w, h: w }) });
  },

  zoomAtCenter: (factor) => {
    const vb = get().viewBox;
    get().zoomBy(factor, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
  },

  panBy: (dx, dy) => {
    const vb = get().viewBox;
    set({ viewBox: clamp({ ...vb, x: vb.x - dx, y: vb.y - dy }) });
  },

  reset: () => set({ viewBox: INITIAL }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleKeylines: () => set({ showKeylines: !get().showKeylines }),
  toggleLeft: () => set({ leftOpen: !get().leftOpen }),
  toggleRight: () => set({ rightOpen: !get().rightOpen }),
}));

/** Exposed for the toolbar, so a button at the limit can disable itself. */
export const ZOOM_LIMITS = { MIN_W, MAX_W };
