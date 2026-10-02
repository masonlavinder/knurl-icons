import { StudioFooter } from '../components/brand/StudioFooter.tsx';
import { Toolbar } from '../components/Toolbar.tsx';

const BASE = import.meta.env.BASE_URL;

export default function Home(): React.JSX.Element {
  return (
    <div className="app">
      <Toolbar page="home" />
      <main className="page">
        <div className="page-body">
          <h1 className="page-title">Knurled Icons</h1>
          <p className="page-lede">Free 24×24 stroke icons, compatible with Lucide.</p>
          <nav className="home-links" aria-label="Start">
            <a href={`${BASE}icons/`}>Browse the icons</a>
            <a href={`${BASE}editor/`}>Open the editor</a>
          </nav>
        </div>
      </main>
      <StudioFooter />
    </div>
  );
}
