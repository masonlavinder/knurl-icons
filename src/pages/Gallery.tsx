import { createElement, useMemo, useState } from 'react';

import { StudioFooter } from '../components/brand/StudioFooter.tsx';
import { Toolbar } from '../components/Toolbar.tsx';
import { parseSvg } from '../core/io/import/parseSvg.ts';
import type { IconDoc } from '../core/model/types.ts';
import { toTagAndAttrs } from '../core/render/tagAttrs.ts';
import { CATEGORIES, libraryIcons } from '../utils/library.ts';
import type { LibraryMeta } from '../utils/submission.ts';

const BASE = import.meta.env.BASE_URL;

type Icon = { name: string; svg: string; doc: IconDoc; meta: LibraryMeta };

const NO_META: LibraryMeta = { contributors: [], tags: [], categories: [] };

function loadIcons(): Icon[] {
  return libraryIcons().map(({ name, svg, meta }) => ({
    name,
    svg,
    doc: parseSvg(svg).value,
    meta: meta ?? NO_META,
  }));
}

/**
 * Shelved by category, in categories.json order, with uncategorised icons
 * last under Other. An icon in two categories appears on both shelves; that
 * is the point of filing it twice.
 */
const shelve = (icons: Icon[]): { id: string; title: string; icons: Icon[] }[] =>
  [
    ...Object.entries(CATEGORIES).map(([id, c]) => ({
      id,
      title: c.title,
      icons: icons.filter((i) => i.meta.categories.includes(id)),
    })),
    { id: 'other', title: 'Other', icons: icons.filter((i) => i.meta.categories.length === 0) },
  ].filter((s) => s.icons.length > 0);

export default function Gallery(): React.JSX.Element {
  const icons = useMemo(loadIcons, []);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? icons.filter(
        (i) =>
          i.name.includes(q) ||
          i.meta.tags.some((t) => t.includes(q)) ||
          i.meta.categories.some((c) => c.includes(q)),
      )
    : icons;

  return (
    <div className="app">
      <Toolbar page="icons" />
      <main className="page">
        <div className="page-body">
          <div className="gallery-head">
            <h1 className="page-title">Icons</h1>
            <span className="readout">
              {shown.length} of {icons.length}
            </span>
            <input
              type="search"
              className="gallery-search"
              placeholder="Search names, tags, categories"
              aria-label="Search icons"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <p className="page-lede">
            MIT licensed, free to use anywhere. Made one in the{' '}
            <a href={`${BASE}editor/`}>editor</a>? Submit it from there.
          </p>
          {icons.length === 0 ? (
            <p className="gallery-empty">No icons have been published yet.</p>
          ) : shown.length === 0 ? (
            <p className="gallery-empty">Nothing matches “{query.trim()}”.</p>
          ) : (
            shelve(shown).map((shelf) => (
              <section key={shelf.id} className="shelf" aria-labelledby={`shelf-${shelf.id}`}>
                <h2 id={`shelf-${shelf.id}`} className="shelf-title">
                  {shelf.title}
                  <span className="readout">{shelf.icons.length}</span>
                </h2>
                <ul className="gallery">
                  {shelf.icons.map((icon) => (
                    <IconCard key={icon.name} icon={icon} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </main>
      <StudioFooter />
    </div>
  );
}

function IconCard({ icon }: { icon: Icon }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(icon.svg).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  // From the bundled text, the same bytes /icons/<name>.svg serves.
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([icon.svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${icon.name}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <li className="icon-card">
      <IconPreview doc={icon.doc} />
      <span className="icon-name" title={icon.meta.tags.join(', ')}>
        {icon.name}
      </span>
      <div className="icon-actions">
        <button type="button" onClick={download}>
          Download
        </button>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </li>
  );
}

/**
 * Drawn from the model through the same toTagAndAttrs the canvas and the
 * serializer use, rather than by injecting the file's markup.
 */
function IconPreview({ doc }: { doc: IconDoc }): React.JSX.Element {
  const size = doc.canvas.size;
  return (
    <svg
      className="icon-preview"
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={doc.strokeSpec.width}
      strokeLinecap={doc.strokeSpec.cap}
      strokeLinejoin={doc.strokeSpec.join}
      aria-hidden="true"
    >
      {doc.elements.map((el) => {
        const { tag, attrs } = toTagAndAttrs(el);
        if (attrs === null) return null;
        return createElement(tag, { key: el.id, ...attrs, fill: el.fill });
      })}
    </svg>
  );
}
