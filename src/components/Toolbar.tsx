import { Mark } from './brand/Mark.tsx';

const BASE = import.meta.env.BASE_URL;

export type PageKey = 'home' | 'icons' | 'editor';

const NAV: { key: PageKey; label: string; href: string }[] = [
  { key: 'editor', label: 'Editor', href: `${BASE}editor/` },
  { key: 'icons', label: 'Icons', href: `${BASE}icons/` },
];

/**
 * The band across the top of every page: the lockup, which goes home, and the
 * other pages. The studio itself is linked from the footer.
 */
export function Toolbar({ page }: { page: PageKey }): React.JSX.Element {
  return (
    <header className="toolbar">
      <a className="lockup" href={BASE} aria-current={page === 'home' ? 'page' : undefined}>
        <Mark size={24} />
        <strong className="brand">Knurled Icons</strong>
      </a>
      <nav className="site-nav" aria-label="Pages">
        {NAV.map((n) => (
          <a key={n.key} href={n.href} aria-current={page === n.key ? 'page' : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
