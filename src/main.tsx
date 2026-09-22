import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { registerBrowserXmlParser } from './platform/xmlBrowser.ts';
import './index.css';

// core/ never touches the DOM, so the platform parser is injected here.
registerBrowserXmlParser();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
