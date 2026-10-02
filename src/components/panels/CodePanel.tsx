import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { serialize } from '../../core/io/export/serialize.ts';
import { parseSvg } from '../../core/io/import/parseSvg.ts';
import type { Diagnostic } from '../../core/result.ts';
import { useDocStore } from '../../stores/docStore.ts';
import { lockedSpans } from '../../utils/lockedSpans.ts';
import { SectionHead, useSectionOpen } from './SectionHead.tsx';

/**
 * Pause in typing before the text is re-imported. Short: the panel applies
 * whatever parses and lets the rest sit as typed, so there is no need to wait
 * for the user to finish a thought — only to skip the keystrokes in between.
 */
const SETTLE_MS = 120;

/** One run of typing is one undo step; blurring the box ends the run. */
const EDIT_MERGE = 'code-edit';

/** How long the copy button admits it worked before going back to normal. */
const COPIED_MS = 1200;

/**
 * Bidirectional code panel: edit or paste SVG here and it becomes geometry.
 *
 * Applying is automatic. A paste applies immediately -- that is the whole point
 * of pasting. Typing applies after a short pause, and whatever parses goes
 * straight to the canvas. Whatever does not is left exactly as typed: the
 * canvas keeps the last version that worked, the head says the two are out of
 * step, and Revert puts the text back to match the canvas.
 *
 * The text is never rewritten under the caret. An apply that succeeds leaves
 * the user's own formatting alone; it is only tidied to the canonical form on
 * blur. A change from anywhere else -- the canvas, undo, Open -- does replace
 * the text, because the document is the source of truth.
 *
 * A paste is one history entry, and so is a run of typing, so a bad edit is
 * one undo rather than forty.
 */
export function CodePanel(): React.JSX.Element {
  const doc = useDocStore((s) => s.doc);
  const sectionOpen = useSectionOpen('code');
  const replace = useDocStore((s) => s.replace);

  const serialized = serialize(doc);
  const [draft, setDraft] = useState(serialized);
  // The text cannot be applied, so the canvas is showing an older version.
  const [stale, setStale] = useState(false);
  // What the document serialized to after this panel's own last apply. When
  // the store echoes that back, the draft is already right and is left alone.
  const echo = useRef<string | null>(null);
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

  // Follow the document when it changes from anywhere but here.
  useEffect(() => {
    if (serialized === echo.current) return;
    echo.current = null;
    // A pending apply of older text would undo whatever just changed.
    if (timer.current) clearTimeout(timer.current);
    setDraft(serialized);
    setStale(false);
    setError(null);
    setDiagnostics([]);
  }, [serialized]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

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

  /**
   * Import the text if it parses, and say whether it did.
   *
   * Read from the store rather than from render: this runs from a timer, and
   * a document captured at render time could be several edits old by then.
   */
  const apply = useCallback(
    (text: string, mergeKey?: string): boolean => {
      if (text.trim().length === 0) {
        setError('Empty. Revert to get the document back.');
        setDiagnostics([]);
        setStale(true);
        return false;
      }
      let parsed: ReturnType<typeof parseSvg>;
      try {
        parsed = parseSvg(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setDiagnostics([]);
        setStale(true);
        return false;
      }
      setError(null);
      setDiagnostics(parsed.diagnostics);
      if (parsed.diagnostics.some((d) => d.severity === 'error')) {
        setStale(true);
        return false;
      }
      setStale(false);

      const current = useDocStore.getState().doc;
      const next = { ...parsed.value, name: current.name };
      const out = serialize(next);
      // Whitespace, attribute order, anything the model does not keep: the
      // text changed but the document would not, so there is nothing to do.
      if (out === serialize(current)) return true;
      echo.current = out;
      replace(next, 'Edit SVG', mergeKey);
      return true;
    },
    [replace],
  );

  const schedule = useCallback(
    (text: string, delay: number, mergeKey?: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        apply(text, mergeKey);
      }, delay);
    },
    [apply],
  );

  /** Throw the edit away and show what the canvas is showing. */
  const revert = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    echo.current = null;
    setDraft(serialize(useDocStore.getState().doc));
    setStale(false);
    setError(null);
    setDiagnostics([]);
  }, []);

  /**
   * Leaving the box ends the edit: apply what is pending, close the run of
   * typing as one undo step, and if it all applied, tidy the text into the
   * form the document serializes to. Broken text is left as it is, to fix or
   * revert.
   */
  const settle = useCallback(() => {
    const pending = timer.current !== null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const ok = pending ? apply(draft, EDIT_MERGE) : !stale;
    useDocStore.getState().sealHistory();
    if (ok) {
      echo.current = null;
      setDraft(serialize(useDocStore.getState().doc));
    }
  }, [apply, draft, stale]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <div className="panel panel-code" data-open={sectionOpen}>
      <SectionHead id="code" title="SVG">
        {stale && (
          <>
            <span className="dirty" title="The canvas is showing the last version that parsed">
              not applied
            </span>
            <button type="button" className="btn-head btn-revert" onClick={revert}>
              Revert
            </button>
          </>
        )}
        <button type="button" className="btn-head btn-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </SectionHead>

      <div className="panel-body" hidden={!sectionOpen}>
        {/* The overlay and the textarea are the same text in the same box. The
          textarea keeps the caret and the editing; the <pre> underneath does
          the marking, because a textarea cannot style a range of its own
          value. They must not drift: identical font, size, line-height,
          padding and wrapping, and the scroll is mirrored on every scroll. */}
        <div className="code-wrap" data-stale={stale}>
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
              schedule(e.target.value, SETTLE_MS, EDIT_MERGE);
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
              // A paste is its own undo step, not part of the typing around it.
              useDocStore.getState().sealHistory();
              schedule(next, 0);
            }}
            onBlur={settle}
          />
        </div>

        {error && <p className="diag diag-error">{error}</p>}
        {diagnostics.map((d, i) => (
          <p className={d.severity === 'error' ? 'diag diag-error' : 'diag diag-warn'} key={i}>
            <code>{d.code}</code> {d.message}
          </p>
        ))}
      </div>
    </div>
  );
}
