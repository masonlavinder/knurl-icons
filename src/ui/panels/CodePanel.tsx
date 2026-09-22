import { useCallback, useEffect, useRef, useState } from 'react';

import { serialize } from '../../core/io/export/serialize.ts';
import { parseSvg } from '../../core/io/import/parseSvg.ts';
import type { Diagnostic } from '../../core/result.ts';
import { useDocStore } from '../../store/docStore.ts';

/** Quiet period after typing stops before the text is re-imported. */
const SETTLE_MS = 350;

/**
 * Bidirectional code panel: edit or paste SVG here and it becomes geometry.
 *
 * Applying is automatic. A paste applies immediately -- that is the whole point
 * of pasting, and making someone click away first to see anything happen is
 * friction for no benefit. Typing applies once the text stops changing, because
 * partially-typed markup is usually unparseable and re-importing on every
 * keystroke would thrash the document and the history.
 *
 * Either way the import commits as a single history entry, so a bad paste is one
 * undo rather than forty.
 */
export function CodePanel(): React.JSX.Element {
  const doc = useDocStore((s) => s.doc);
  const replace = useDocStore((s) => s.replace);

  const serialized = serialize(doc);
  const [draft, setDraft] = useState(serialized);
  const [dirty, setDirty] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the document unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) setDraft(serialized);
  }, [serialized, dirty]);

  const apply = useCallback(
    (text: string) => {
      if (text.trim().length === 0) return;
      try {
        const { value, diagnostics: ds } = parseSvg(text);
        setDiagnostics(ds);
        setError(null);
        if (ds.some((d) => d.severity === 'error')) return;
        replace({ ...value, name: doc.name }, 'Import SVG');
        setDirty(false);
      } catch (e) {
        // Mid-edit markup is often unparseable; that is not worth shouting
        // about until the text settles.
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [doc.name, replace],
  );

  const schedule = useCallback(
    (text: string, delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => apply(text), delay);
    },
    [apply],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <div className="panel panel-code">
      <div className="panel-head">
        <span>SVG</span>
        {dirty && <span className="dirty">applying…</span>}
      </div>

      <textarea
        className="code"
        spellCheck={false}
        value={draft}
        aria-label="SVG source"
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
          schedule(e.target.value, SETTLE_MS);
        }}
        onPaste={(e) => {
          // Apply a paste at once. The value is read from the event rather than
          // from state, which React has not updated yet at this point.
          const pasted = e.clipboardData.getData('text');
          const el = e.currentTarget;
          const next =
            el.value.slice(0, el.selectionStart) + pasted + el.value.slice(el.selectionEnd);
          e.preventDefault();
          setDraft(next);
          setDirty(true);
          schedule(next, 0);
        }}
        onBlur={() => {
          if (dirty) schedule(draft, 0);
        }}
      />

      {error && <p className="diag diag-error">{error}</p>}
      {diagnostics.map((d, i) => (
        <p className={d.severity === 'error' ? 'diag diag-error' : 'diag diag-warn'} key={i}>
          <code>{d.code}</code> {d.message}
        </p>
      ))}
    </div>
  );
}
