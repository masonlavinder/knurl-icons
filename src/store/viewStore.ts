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
 * Keep the view and the artboard maximally overlapped, on each axis.
 *
 * One expression covers both regimes, because they are the same rule seen
 * from either side of the zoom:
 *
 *   · zoomed out (w >= CANVAS) the artboard fits, so it must sit ENTIRELY
 *     inside the view: x runs [CANVAS - w, 0], every value of which contains
 *     0..CANVAS whole.
 *   · zoomed in (w < CANVAS) it does not fit, so the view must sit ENTIRELY
 *     inside the artboard: x runs [0, CANVAS - w], every value of which is
 *     nothing but artboard.
 *
 * `CANVAS - size` is the far bound in both, and 0 is the near one — they just
 * swap ends as the sign flips, so min/max sorts them and no branch is needed.
 *
 * There used to be half a screen of slack here, which is why the icon could be
 * shoved off the top: at fit the range was [-12, 12] and half the artboard
 * could be pushed out of frame with nothing behind it. There is no slack now.
 * Panning at fit does nothing, which is correct — everything is already on
 * screen and there is nowhere to go.
 *
 * Geometry outside the artboard is still reachable: past CANVAS the view is
 * wider than the artboard, so zooming out shows the ground around it.
 */
function clampAxis(v: number, size: number): number {
  const far = CANVAS - size;
  return Math.min(Math.max(far, 0), Math.max(Math.min(far, 0), v));
}

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
