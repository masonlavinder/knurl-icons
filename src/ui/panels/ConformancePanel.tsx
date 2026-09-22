import { useState } from 'react';

import { checkConformance, conformanceScore, toPascal } from '../../core/io/import/lint.ts';
import { useDocStore } from '../../store/docStore.ts';
import { useSelectionStore } from '../../store/selectionStore.ts';

/**
 * Live conformance with the Lucide icon standard.
 *
 * Collapsed by default: the score is the part you need at a glance, and the
 * per-rule detail only matters once it stops reading N/N. The header keeps the
 * count visible either way, and opens red when something actually fails.
 *
 * Rules marked "by construction" can never fail -- the document model cannot
 * express a transform or a per-element stroke override, and the serializer emits
 * a fixed attribute set in a fixed order. Showing them anyway is the point: it
 * says *why* the output is lint-clean, rather than just asserting that it is.
 */
export function ConformancePanel(): React.JSX.Element {
  const doc = useDocStore((s) => s.doc);
  const select = useSelectionStore((s) => s.set);
  const [open, setOpen] = useState(false);

  const rules = checkConformance(doc);
  const { pass, total } = conformanceScore(rules);
  const clean = pass === total;

  return (
    <div className={open ? 'panel panel-conformance is-open' : 'panel panel-conformance'}>
      <button
        type="button"
        className="panel-head conformance-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="twist" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="conformance-label">Lucide conformance</span>
        <span className={clean ? 'score is-clean' : 'score'}>
          {pass}/{total}
        </span>
      </button>

      {open && (
        <>
          <ul className="rules">
            {rules.map((r) => (
              <li key={r.code} className={`rule rule-${r.status}`}>
                <button
                  type="button"
                  disabled={r.addrs.length === 0}
                  onClick={() => select({ addrs: r.addrs })}
                  title={r.addrs.length > 0 ? 'Select the offending geometry' : undefined}
                >
                  <span className="mark" aria-hidden="true">
                    {r.status === 'pass' ? '✓' : r.status === 'warn' ? '!' : '✕'}
                  </span>
                  <span className="rule-body">
                    <span className="rule-title">
                      {r.title}
                      {r.structural && <em className="by-construction">by construction</em>}
                    </span>
                    <span className="rule-detail">{r.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="usage">
            Exports as <code>&lt;{toPascal(doc.name)} /&gt;</code> from{' '}
            <code>lucide-react</code>, inheriting <code>size</code>, <code>color</code> and{' '}
            <code>strokeWidth</code> from the consumer.
          </p>
        </>
      )}
    </div>
  );
}
