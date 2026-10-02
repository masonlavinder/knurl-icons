import { createElement, useMemo, useState } from 'react';

import { StudioFooter } from '../components/brand/StudioFooter.tsx';
import { Toolbar } from '../components/Toolbar.tsx';
import { parseSvg } from '../core/io/import/parseSvg.ts';
import type { IconDoc } from '../core/model/types.ts';
import { toTagAndAttrs } from '../core/render/tagAttrs.ts';
import type { LibraryMeta } from '../utils/submission.ts';

const BASE = import.meta.env.BASE_URL;

/** library/ at build time: the icons are part of the bundle, not fetched. */
const SVGS = import.meta.glob<string>('../../library/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const METAS = import.meta.glob<LibraryMeta>('../../library/*.json', {
  import: 'default',
  eager: true,
});

type Icon = { name: string; svg: string; doc: IconDoc; meta: LibraryMeta };

const stem = (path: string): string => path.replace(/^.*\/|\.\w+$/g, '');

function loadIcons(): Icon[] {
  const metas = new Map(Object.entries(METAS).map(([p, m]) => [stem(p), m]));
  return Object.entries(SVGS)
    .map(([path, svg]) => {
      const name = stem(path);
      const meta = metas.get(name) ?? { contributors: [], tags: [], categories: [] };
      return { name, svg, doc: parseSvg(svg).value, meta };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function Gallery(): React.JSX.Element {
  const icons = useMemo(loadIcons, []);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? icons.filter((i) => i.name.includes(q) || i.meta.tags.some((t) => t.includes(q)))
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
              placeholder="Search names and tags"
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
          ) : (
            <ul className="gallery">
              {shown.map((icon) => (
                <IconCard key={icon.name} icon={icon} />
              ))}
            </ul>
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

  return (
    <li className="icon-card">
      <IconPreview doc={icon.doc} />
      <span className="icon-name">{icon.name}</span>
      <div className="icon-actions">
        <a href={`${BASE}icons/${icon.name}.svg`} download={`${icon.name}.svg`}>
          Download
        </a>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy SVG'}
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
