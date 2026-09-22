import {
  CANVAS,
  GEOMETRIC_MAX,
  GEOMETRIC_MIN,
  VISUAL_MAX,
  VISUAL_MIN,
} from '../../core/constants.ts';
import { useViewStore } from '../../store/viewStore.ts';

/**
 * Grid, padding boxes and keyline shapes.
 *
 * Two padding boxes are drawn, because conflating them is the classic mistake:
 * the outer one at [1, 23] bounds the *visual* (stroked) extent, while the inner
 * one at [2, 22] bounds where centrelines may actually go. Nominal padding is 1;
 * centreline padding is 2.
 */
export function GridLayer(): React.JSX.Element {
  const showGrid = useViewStore((s) => s.showGrid);
  const showKeylines = useViewStore((s) => s.showKeylines);
  const zoom = useViewStore((s) => s.zoom);

  const unit: React.JSX.Element[] = [];
  const half: React.JSX.Element[] = [];

  if (showGrid) {
    for (let i = 0; i <= CANVAS; i++) {
      unit.push(<line key={`vx${i}`} x1={i} y1={0} x2={i} y2={CANVAS} />);
      unit.push(<line key={`hz${i}`} x1={0} y1={i} x2={CANVAS} y2={i} />);
    }
    // Half-unit guides only once they are far enough apart to read.
    if (zoom > 18) {
      for (let i = 0.5; i < CANVAS; i += 1) {
        half.push(<line key={`vx${i}`} x1={i} y1={0} x2={i} y2={CANVAS} />);
        half.push(<line key={`hz${i}`} x1={0} y1={i} x2={CANVAS} y2={i} />);
      }
    }
  }

  return (
    <g className="l-grid" pointerEvents="none">
      <rect className="canvas-bg" x={0} y={0} width={CANVAS} height={CANVAS} />
      {half.length > 0 && (
        <g className="grid-half">
          {half}
        </g>
      )}
      {unit.length > 0 && (
        <g className="grid-unit">
          {unit}
        </g>
      )}

      {showGrid && (
        <>
          <rect
            className="pad-visual"
            x={VISUAL_MIN}
            y={VISUAL_MIN}
            width={VISUAL_MAX - VISUAL_MIN}
            height={VISUAL_MAX - VISUAL_MIN}
          />
          <rect
            className="pad-geometric"
            x={GEOMETRIC_MIN}
            y={GEOMETRIC_MIN}
            width={GEOMETRIC_MAX - GEOMETRIC_MIN}
            height={GEOMETRIC_MAX - GEOMETRIC_MIN}
          />
        </>
      )}

      {showKeylines && (
        <g className="keylines">
          <circle cx={12} cy={12} r={10} />
          <rect x={2} y={2} width={20} height={20} />
          <rect x={4} y={2} width={16} height={20} />
          <rect x={2} y={4} width={20} height={16} />
          {/* Crosshairs through the center: the reference every symmetric icon
              is built against, and the thing you align to when centering. */}
          <g className="keyline-cross">
            <line x1={CANVAS / 2} y1={0} x2={CANVAS / 2} y2={CANVAS} />
            <line x1={0} y1={CANVAS / 2} x2={CANVAS} y2={CANVAS / 2} />
            <line x1={0} y1={0} x2={CANVAS} y2={CANVAS} />
            <line x1={CANVAS} y1={0} x2={0} y2={CANVAS} />
          </g>
        </g>
      )}
    </g>
  );
}
