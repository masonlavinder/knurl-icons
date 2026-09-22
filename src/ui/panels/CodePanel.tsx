import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { serialize } from '../../core/io/export/serialize.ts';
import { parseSvg } from '../../core/io/import/parseSvg.ts';
import type { Diagnostic } from '../../core/result.ts';
import { useDocStore } from '../../store/docStore.ts';
import { CollapseButton, type CollapseProps } from '../Chevron.tsx';
import { lockedSpans } from './lockedSpans.ts';

/** Quiet period after typing stops before the text is re-imported. */
const SETTLE_MS = 350;

/** How long the copy button admits it worked before going back to normal. */
const COPIED_MS = 1200;

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
export function CodePanel({ onCollapse }: CollapseProps): React.JSX.Element {
  const doc = useDocStore((s) => s.doc);
  const replace = useDocStore((s) => s.replace);

  const serialized = serialize(doc);
  const [draft, setDraft] = useState(serialized);
  const [dirty, setDirty] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marksRef = useRef<HTMLPreElement>(null);

  /**
   * The draft, cut into plain text and marked runs.
   *
   * Rebuilt from the draft rather than the document so the marks track what is
   * on screen while an edit is still settling.
   */
  const marks = useMemo(() => {
    const spans = lockedSpans(draft);
    const out: React.ReactNode[] = [];
    let at = 0;
    spans.forEach((span, i) => {
      if (span.start > at) out.push(draft.slice(at, span.start));
      out.push(
        <mark className="locked" data-kind={span.kind} title={span.note} key={i}>
          {draft.slice(span.start, span.end)}
        </mark>,
      );
      at = span.end;
    });
    out.push(draft.slice(at));
    return out;
  }, [draft]);

  // Follow the document unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) setDraft(serialized);
  }, [serialized, dirty]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  /**
   * Copy what is in the box, not what the document would serialize to.
   *
   * Those differ while an edit is settling, and copying the document behind the
   * user's back would hand them markup they cannot see on screen.
   */
  const copy = useCallback(() => {
    const done = (): void => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    };
    navigator.clipboard.writeText(draft).then(done, () => {
      // Clipboard permission can be refused, and over plain http the API is not
      // there at all. Selecting the text is the fallback that always works:
      // the user finishes the job with their own copy shortcut.
      const box = document.querySelector<HTMLTextAreaElement>('.panel-code .code');
      box?.focus();
      box?.select();
    });
  }, [draft]);

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
        <div className="panel-head-actions">
          {dirty && <span className="dirty">applying…</span>}
          <button type="button" className="btn-head btn-copy" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <CollapseButton onCollapse={onCollapse} side="right" />
        </div>
      </div>

      {/* The overlay and the textarea are the same text in the same box. The
          textarea keeps the caret and the editing; the <pre> underneath does
          the marking, because a textarea cannot style a range of its own
          value. They must not drift: identical font, size, line-height,
          padding and wrapping, and the scroll is mirrored on every scroll. */}
      <div className="code-wrap">
        <pre className="code code-marks" aria-hidden="true" ref={marksRef}>
          {marks}
        </pre>
        <textarea
          className="code code-input"
        spellCheck={false}
        value={draft}
        aria-label="SVG source"
        onScroll={(e) => {
          const el = marksRef.current;
          if (!el) return;
          el.scrollTop = e.currentTarget.scrollTop;
          el.scrollLeft = e.currentTarget.scrollLeft;
        }}
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
      </div>

      {/* Says what the marking means. Without it a tinted run is decoration. */}
      <dl className="lock-legend">
        <div>
          <dt>
            <span className="locked-key" data-kind="spec" />
          </dt>
          <dd>house spec, document-wide — checked, not enforced</dd>
        </div>
        <div>
          <dt>
            <span className="locked-key" data-kind="fixed" />
          </dt>
          <dd>fixed by the model — retyped on every round-trip</dd>
        </div>
      </dl>

      {error && <p className="diag diag-error">{error}</p>}
      {diagnostics.map((d, i) => (
        <p className={d.severity === 'error' ? 'diag diag-error' : 'diag diag-warn'} key={i}>
          <code>{d.code}</code> {d.message}
        </p>
      ))}
    </div>
  );
}
