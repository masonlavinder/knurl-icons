import { useState } from 'react';

import { deleteAddresses } from '../../core/commands/ops/deleteAddresses.ts';
import { addElement, reorderElement } from '../../core/commands/ops/editElement.ts';
import { describeElement } from '../../core/model/access.ts';
import { encodeAddr } from '../../core/model/address.ts';
import { ADDABLE } from '../../core/model/factory.ts';
import type { Address, Element } from '../../core/model/types.ts';
import { useDocStore } from '../../store/docStore.ts';
import { useSelectionStore } from '../../store/selectionStore.ts';
import { ElementInspector } from './ElementInspector.tsx';

/**
 * Flat element list -- flat because the model has no groups and no layers.
 *
 * This panel is the answer to "I can't delete this thing" and "I can't nudge
 * this number": everything on the canvas has a row here, every row expands to
 * its own numeric fields, and every row can be deleted regardless of how small
 * or crowded the geometry is on screen.
 */
export function ElementListPanel(): React.JSX.Element {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const keys = useSelectionStore((s) => s.keys);
  const select = useSelectionStore((s) => s.select);
  const toggle = useSelectionStore((s) => s.toggle);
  const clear = useSelectionStore((s) => s.clear);
  const setHover = useSelectionStore((s) => s.setHover);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  // Which row the last click landed on. "Click again to deselect" has to mean a
  // genuine second click on the same row -- keying off "is it selected?" alone
  // would deselect a row the moment you clicked it after selecting on canvas,
  // which silently empties the selection and makes Del look broken.
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  const toggleOpen = (id: string): void => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <div className="panel panel-elements">
      <div className="panel-head">
        <span>Elements</span>
        <span className="count">{doc.elements.length}</span>
      </div>

      <div className="add-bar">
        <button type="button" className="add-toggle" onClick={() => setAdding(!adding)}>
          {adding ? '×' : '+'} Add element
        </button>
        {adding && (
          <ul className="add-menu">
            {ADDABLE.map((item) => (
              <li key={item.kind}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch(addElement(item.kind));
                    setAdding(false);
                  }}
                >
                  <span className="add-label">{item.label}</span>
                  <span className="add-hint">{item.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {doc.elements.length === 0 ? (
        <p className="empty">Nothing here yet. Add an element, or paste an SVG on the right.</p>
      ) : (
        <ul className="element-list">
          {doc.elements.map((el, i) => {
            const addr: Address = { el: el.id };
            const key = encodeAddr(addr);
            const selected = keys.has(key);
            // Selecting a node on the canvas opens its element here, so the
            // highlighted row is actually on screen rather than hidden inside a
            // collapsed section.
            const hasNodeSelection = [...keys].some((k) => k.startsWith(`e:${el.id}/`));
            const expanded = open.has(el.id) || hasNodeSelection;
            return (
              <li key={el.id} className={selected ? 'row-wrap is-selected' : 'row-wrap'}>
                <div
                  className="row"
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                >
                  <button
                    type="button"
                    className="row-twist"
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Hide fields' : 'Show fields'}
                    onClick={() => toggleOpen(el.id)}
                  >
                    {expanded ? '▾' : '▸'}
                  </button>
                  <button
                    type="button"
                    className="row-main"
                    aria-pressed={selected}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        toggle(addr);
                        setLastClicked(el.id);
                      } else if (selected && lastClicked === el.id) {
                        clear();
                        setLastClicked(null);
                      } else {
                        select(addr);
                        setLastClicked(el.id);
                      }
                    }}
                  >
                    <span className="thumb" aria-hidden="true">
                      {glyph(el)}
                    </span>
                    <span className="label">{describeElement(el)}</span>
                  </button>
                  <div className="row-actions">
                    <button
                      type="button"
                      aria-label="Move backward"
                      disabled={i === 0}
                      onClick={() => dispatch(reorderElement(el.id, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move forward"
                      disabled={i === doc.elements.length - 1}
                      onClick={() => dispatch(reorderElement(el.id, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="row-del"
                      aria-label={`Delete ${describeElement(el)}`}
                      onClick={() => dispatch(deleteAddresses([addr]))}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {expanded && <ElementInspector el={el} />}
              </li>
            );
          })}
        </ul>
      )}

      <dl className="hint">
        <div>
          <dt>Click</dt>
          <dd>select · click again to deselect · {mod()}-click to add</dd>
        </div>
        <div>
          <dt>Del</dt>
          <dd>delete what is selected</dd>
        </div>
        <div>
          <dt>Drag</dt>
          <dd>move nodes, handles or a whole shape</dd>
        </div>
        <div>
          <dt>{mod()} E</dt>
          <dd>centre the selection on the canvas</dd>
        </div>
        <div>
          <dt>Tab</dt>
          <dd>step through elements</dd>
        </div>
        <div>
          <dt>Scroll</dt>
          <dd>pan · {mod()}-scroll to zoom · 0 to fit</dd>
        </div>
      </dl>
    </div>
  );
}

const mod = (): string =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

function glyph(el: Element): string {
  switch (el.kind) {
    case 'path':
      return '∿';
    case 'line':
      return '╱';
    case 'circle':
      return '○';
    case 'ellipse':
      return '⬭';
    case 'rect':
      return '▢';
    case 'polyline':
      return el.closed ? '△' : '∧';
  }
}
