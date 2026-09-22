import { deleteAddresses } from '../../core/commands/ops/deleteAddresses.ts';
import { setClosed, setElementField, setElementFill } from '../../core/commands/ops/editElement.ts';
import { appendNode, insertNode, isCurvedNode, setNodeCurved } from '../../core/commands/ops/nodeOps.ts';
import { nodeListsOf } from '../../core/model/access.ts';
import { encodeAddr } from '../../core/model/address.ts';
import type { Address, Element } from '../../core/model/types.ts';
import { round } from '../../core/path/num.ts';
import { useDocStore } from '../../store/docStore.ts';
import { useSelectionStore } from '../../store/selectionStore.ts';
import { nodeColor } from '../nodeColor.ts';

type Field = { label: string; path: string; value: number };

/**
 * Numeric fields for one element.
 *
 * Bézier handles are deliberately absent here. Handle coordinates are four more
 * numbers per node that nobody reasons about numerically -- they are dragged on
 * the canvas instead. What remains is the part typing is actually good for:
 * exact anchor positions.
 */
export function ElementInspector({ el }: { el: Element }): React.JSX.Element {
  const dispatch = useDocStore((s) => s.dispatch);

  const set = (path: string, value: number): void => {
    if (!Number.isFinite(value)) return;
    dispatch(setElementField(el.id, path, value));
  };

  return (
    <div className="inspector">
      {shapeFields(el).map((group) => (
        <div className="insp-group" key={group.title}>
          <span className="insp-title">{group.title}</span>
          <div className="insp-fields">
            {group.fields.map((f) => (
              <label className="insp-field" key={f.path}>
                <span>{f.label}</span>
                <input
                  type="number"
                  step={0.5}
                  value={round(f.value)}
                  onChange={(e) => set(f.path, e.target.valueAsNumber)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      {hasNodes(el) && <NodeRows el={el} />}
      <StyleRow el={el} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NodeRows({ el }: { el: Element }): React.JSX.Element {
  const dispatch = useDocStore((s) => s.dispatch);
  const select = useSelectionStore((s) => s.select);
  const clear = useSelectionStore((s) => s.clear);
  const keys = useSelectionStore((s) => s.keys);
  const setHover = useSelectionStore((s) => s.setHover);
  const lists = nodeListsOf(el);
  const total = lists.reduce((n, l) => n + l.nodes.length, 0);
  // Mirrors the canvas: with a node picked, the rest of the rows recede.
  const anyNodePicked = [...keys].some((k) => k.startsWith(`e:${el.id}/`) && k.includes('/n:'));

  return (
    <div className="insp-group">
      <span className="insp-title">Nodes</span>
      {lists.map((list, li) => (
        <div key={list.subId ?? li}>
          {lists.length > 1 && <span className="insp-sub">Subpath {li + 1}</span>}
          {list.nodes.map((n, ni) => {
            const prefix = el.kind === 'polyline' ? 'nodes' : `subpaths.${li}.nodes`;
            const addr: Address =
              list.subId === null
                ? { el: el.id, node: n.id }
                : { el: el.id, sub: list.subId, node: n.id };
            const curved = isCurvedNode(n);
            const rowSelected = keys.has(encodeAddr(addr));
            return (
              <div
                className={
                  rowSelected
                    ? 'node-row is-selected'
                    : anyNodePicked
                      ? 'node-row is-dimmed'
                      : 'node-row'
                }
                key={n.id}
                onMouseEnter={() => setHover(encodeAddr(addr))}
                onMouseLeave={() => setHover(null)}
                onPointerDown={(ev) => {
                  // Clicking anywhere in the row that is not a control selects
                  // the node. Picking a node out of a dense list was otherwise
                  // a hunt for a target the size of a number field's label.
                  if ((ev.target as HTMLElement).closest('button, input')) return;
                  if (rowSelected) clear();
                  else select(addr);
                }}
              >
                <button
                  type="button"
                  className="node-grab"
                  aria-label={`Select node ${ni}`}
                  style={{ ['--node-hue' as string]: nodeColor(ni) }}
                  onClick={() => (rowSelected ? clear() : select(addr))}
                >
                  <span className="node-swatch" />
                  <span className="node-index">{ni}</span>
                </button>
                <button
                  type="button"
                  className={curved ? 'node-kind is-curved' : 'node-kind'}
                  title={curved ? 'Straighten this node' : 'Curve this node'}
                  aria-pressed={curved}
                  onClick={() => dispatch(setNodeCurved({ ...addr, node: n.id } as never, !curved))}
                >
                  {curved ? 'Curved' : 'Straight'}
                </button>
                <label className="insp-field">
                  <span>x</span>
                  <input
                    type="number"
                    step={0.5}
                    value={round(n.p.x)}
                    onFocus={() => select(addr)}
                    onChange={(e) =>
                      dispatch(setElementField(el.id, `${prefix}.${ni}.p.x`, e.target.valueAsNumber))
                    }
                  />
                </label>
                <label className="insp-field">
                  <span>y</span>
                  <input
                    type="number"
                    step={0.5}
                    value={round(n.p.y)}
                    onFocus={() => select(addr)}
                    onChange={(e) =>
                      dispatch(setElementField(el.id, `${prefix}.${ni}.p.y`, e.target.valueAsNumber))
                    }
                  />
                </label>
                <div className="node-ops">
                  <button
                    type="button"
                    aria-label={`Insert a node after node ${ni}`}
                    disabled={!list.closed && ni === list.nodes.length - 1}
                    onClick={() =>
                      dispatch(
                        insertNode(
                          { el: el.id, sub: list.subId ?? undefined, index: ni + 1 },
                          midpointAfter(list.nodes, ni, list.closed),
                        ),
                      )
                    }
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="node-remove"
                    aria-label={`Remove node ${ni}`}
                    disabled={total <= 2}
                    onClick={() => dispatch(deleteAddresses([addr], 'rejoin'))}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="node-add"
            onClick={() => dispatch(appendNode(el.id, list.subId ?? undefined))}
          >
            + Add node
          </button>
        </div>
      ))}
      <p className="insp-note">
        Drag on the canvas to move · double-click a segment to insert a node ·
        Curved gives a node bézier handles to drag
      </p>
    </div>
  );
}

function StyleRow({ el }: { el: Element }): React.JSX.Element | null {
  const dispatch = useDocStore((s) => s.dispatch);
  const fillable = fillMode(el);
  if (!fillable) return null;

  const closed = isClosed(el);
  // An open run has no interior, so filling it is meaningless -- the control is
  // shown but disabled, with the reason, rather than quietly missing.
  const needsClosing = fillable === 'area' && hasNodes(el) && !closed;

  return (
    <div className="insp-group">
      <span className="insp-title">Style</span>
      <div className="insp-row">
        {hasNodes(el) && (
          <label className="insp-check">
            <input
              type="checkbox"
              checked={closed}
              onChange={(e) => dispatch(setClosed(el.id, e.target.checked))}
            />
            <span>Closed</span>
          </label>
        )}
        <label className={needsClosing ? 'insp-check is-disabled' : 'insp-check'}>
          <input
            type="checkbox"
            disabled={needsClosing}
            checked={el.fill === 'currentColor'}
            onChange={(e) =>
              dispatch(setElementFill(el.id, e.target.checked ? 'currentColor' : undefined))
            }
          />
          <span>Filled</span>
        </label>
      </div>
      {needsClosing && <p className="insp-note">Close the shape to fill it.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** A line has no interior; a small circle is the Lucide "dot" convention. */
function fillMode(el: Element): 'dot' | 'area' | null {
  if (el.kind === 'line') return null;
  if (el.kind === 'circle') return 'dot';
  return 'area';
}

const hasNodes = (el: Element): boolean => el.kind === 'polyline' || el.kind === 'path';

function isClosed(el: Element): boolean {
  if (el.kind === 'polyline') return el.closed;
  if (el.kind === 'path') return el.subpaths.length > 0 && el.subpaths.every((s) => s.closed);
  return true;
}

function midpointAfter(
  nodes: readonly { p: { x: number; y: number } }[],
  i: number,
  closed: boolean,
): { x: number; y: number } {
  const a = nodes[i]!;
  const b = nodes[(i + 1) % nodes.length];
  if (!b || (!closed && i === nodes.length - 1)) return a.p;
  return { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2 };
}

function shapeFields(el: Element): { title: string; fields: Field[] }[] {
  switch (el.kind) {
    case 'circle':
      return [
        {
          title: 'Geometry',
          fields: [
            { label: 'cx', path: 'c.x', value: el.c.x },
            { label: 'cy', path: 'c.y', value: el.c.y },
            { label: 'r', path: 'r', value: el.r },
          ],
        },
      ];
    case 'ellipse':
      return [
        {
          title: 'Geometry',
          fields: [
            { label: 'cx', path: 'c.x', value: el.c.x },
            { label: 'cy', path: 'c.y', value: el.c.y },
            { label: 'rx', path: 'rx', value: el.rx },
            { label: 'ry', path: 'ry', value: el.ry },
          ],
        },
      ];
    case 'rect':
      return [
        {
          title: 'Geometry',
          fields: [
            { label: 'x', path: 'x', value: el.x },
            { label: 'y', path: 'y', value: el.y },
            { label: 'w', path: 'w', value: el.w },
            { label: 'h', path: 'h', value: el.h },
            { label: 'rx', path: 'rx', value: el.rx },
            { label: 'ry', path: 'ry', value: el.ry },
          ],
        },
      ];
    case 'line':
      return [
        {
          title: 'Geometry',
          fields: [
            { label: 'x1', path: 'a.x', value: el.a.x },
            { label: 'y1', path: 'a.y', value: el.a.y },
            { label: 'x2', path: 'b.x', value: el.b.x },
            { label: 'y2', path: 'b.y', value: el.b.y },
          ],
        },
      ];
    default:
      return [];
  }
}
