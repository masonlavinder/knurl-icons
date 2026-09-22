import { create } from 'zustand';

import { CANVAS } from '../core/constants.ts';

type ViewState = {
  /** Pan/zoom expressed as a viewBox, so children stay in icon units. */
  viewBox: { x: number; y: number; w: number; h: number };
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

  setViewBox: (vb: ViewState['viewBox']) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (factor: number, centre: { x: number; y: number }) => void;
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
  toggleGrid: () => void;
  toggleKeylines: () => void;
};

const INITIAL = { x: 0, y: 0, w: CANVAS, h: CANVAS };

export const useViewStore = create<ViewState>((set, get) => ({
  viewBox: INITIAL,
  zoom: 1,
  showGrid: true,
  showKeylines: false,

  setViewBox: (viewBox) => set({ viewBox }),
  setZoom: (zoom) => {
    if (Math.abs(get().zoom - zoom) < 1e-9) return;
    set({ zoom });
  },

  zoomBy: (factor, centre) => {
    const vb = get().viewBox;
    // Clamp so the canvas can neither invert nor shrink past a useful range.
    const w = Math.min(CANVAS * 4, Math.max(CANVAS / 64, vb.w / factor));
    const h = w;
    // Keep the point under the cursor fixed.
    const kx = (centre.x - vb.x) / vb.w;
    const ky = (centre.y - vb.y) / vb.h;
    set({ viewBox: { x: centre.x - kx * w, y: centre.y - ky * h, w, h } });
  },

  panBy: (dx, dy) => {
    const vb = get().viewBox;
    set({ viewBox: { ...vb, x: vb.x - dx, y: vb.y - dy } });
  },

  reset: () => set({ viewBox: INITIAL }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleKeylines: () => set({ showKeylines: !get().showKeylines }),
}));
