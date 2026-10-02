// The studio layer, in the order KNURLED.md fixes it, and ahead of every
// module that might emit CSS of its own.
//
// A layer takes its position from wherever its name first appears. Editor.tsx
// pulls in the brand components, whose CSS Modules open `@layer components`;
// if that import sits above these, `components` is pinned at position one and
// the declaration below appends reset, tokens, base and patterns AFTER it —
// so `a` in base beat `.home` in components and every external link in the
// footer came out accent-purple instead of verdigris. Nothing errors. The
// order just stops applying.
import '../styles/global.css';
import '../styles/tokens.css';
import '../styles/fonts.css';
import './instrument.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import Editor from './pages/Editor.tsx';
import { registerBrowserXmlParser } from './utils/xmlBrowser.ts';

// core/ never touches the DOM, so the platform parser is injected here.
registerBrowserXmlParser();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
);
