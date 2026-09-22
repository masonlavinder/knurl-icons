import { describe, expect, it } from 'vitest';

import { CANVAS } from '../core/constants.ts';
import { useViewStore } from './viewStore.ts';

/**
 * The artboard is unlosable.
 *
 * This is the property the clamp exists for, and it is not something you can
 * eyeball: a drag is hundreds of pan calls, a pinch interleaves pans and zooms,
 * and any one of them could walk the view off the edge. Every write goes
 * through one clamp, so the invariant is checkable here rather than in a
 * browser.
 */
const overlap = (a: number, len: number): number => Math.min(a + len, CANVAS) - Math.max(a, 0);

function assertVisible(): void {
  const { x, y, w, h } = useViewStore.getState().viewBox;
  // At either extreme of the pan range, exactly half the viewport is artboard.
  // Anywhere in between it is more. Allow a float epsilon at the boundary.
  expect(overlap(x, w)).toBeGreaterThanOrEqual(Math.min(w, CANVAS) / 2 - 1e-9);
  expect(overlap(y, h)).toBeGreaterThanOrEqual(Math.min(h, CANVAS) / 2 - 1e-9);
}

describe('view clamping', () => {
  it('survives a hard pan in every direction', () => {
    const far: [number, number][] = [
      [1e6, 0],
      [-1e6, 0],
      [0, 1e6],
      [0, -1e6],
      [1e6, 1e6],
      [-1e6, -1e6],
    ];
    for (const [dx, dy] of far) {
      useViewStore.getState().reset();
      useViewStore.getState().panBy(dx, dy);
      assertVisible();
    }
  });

  it('survives a pan at full zoom in and full zoom out', () => {
    for (const factor of [1 / 1000, 1000]) {
      useViewStore.getState().reset();
      useViewStore.getState().zoomAtCenter(factor);
      useViewStore.getState().panBy(1e6, 1e6);
      assertVisible();
      useViewStore.getState().panBy(-1e6, -1e6);
      assertVisible();
    }
  });

  it('survives zooming about a point far outside the artboard', () => {
    useViewStore.getState().reset();
    for (let i = 0; i < 50; i += 1) {
      useViewStore.getState().zoomBy(1.4, { x: 9000, y: -9000 });
      assertVisible();
    }
  });

  it('survives a long interleaved drag-and-zoom', () => {
    useViewStore.getState().reset();
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 2000; i += 1) {
      if (i % 5 === 0) useViewStore.getState().zoomAtCenter(rand() < 0.5 ? 0.8 : 1.25);
      else useViewStore.getState().panBy((rand() - 0.5) * 200, (rand() - 0.5) * 200);
      assertVisible();
    }
  });

  it('can still reach every edge of the icon when zoomed in', () => {
    useViewStore.getState().reset();
    // Down to a quarter of the artboard in view.
    useViewStore.getState().zoomAtCenter(4);
    const w = useViewStore.getState().viewBox.w;
    expect(w).toBeCloseTo(CANVAS / 4);

    useViewStore.getState().panBy(-1e6, -1e6);
    const far = useViewStore.getState().viewBox;
    // The far corner of the artboard is on screen.
    expect(far.x + far.w).toBeGreaterThanOrEqual(CANVAS);
    expect(far.y + far.h).toBeGreaterThanOrEqual(CANVAS);

    useViewStore.getState().panBy(1e6, 1e6);
    const near = useViewStore.getState().viewBox;
    expect(near.x).toBeLessThanOrEqual(0);
    expect(near.y).toBeLessThanOrEqual(0);
  });

  it('keeps the whole artboard on screen once zoomed out past it', () => {
    useViewStore.getState().reset();
    useViewStore.getState().zoomAtCenter(1 / 4);
    const corners: [number, number][] = [
      [1e6, 1e6],
      [-1e6, -1e6],
    ];
    for (const [dx, dy] of corners) {
      useViewStore.getState().panBy(dx, dy);
      const { x, y, w, h } = useViewStore.getState().viewBox;
      expect(x).toBeLessThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(0);
      expect(x + w).toBeGreaterThanOrEqual(CANVAS);
      expect(y + h).toBeGreaterThanOrEqual(CANVAS);
    }
  });

  it('never lets the view invert or escape the zoom range', () => {
    useViewStore.getState().reset();
    for (const factor of [1e9, 1e-9]) {
      useViewStore.getState().zoomAtCenter(factor);
      const { w, h } = useViewStore.getState().viewBox;
      expect(w).toBeGreaterThan(0);
      expect(w).toBe(h);
      expect(w).toBeGreaterThanOrEqual(CANVAS / 64 - 1e-9);
      expect(w).toBeLessThanOrEqual(CANVAS * 4 + 1e-9);
    }
  });
});
