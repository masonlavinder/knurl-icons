import { setXmlParser, type XNode } from '../core/io/xml.ts';

/** Browser-side XML parser registration. core/ never touches `document` itself. */
export function registerBrowserXmlParser(): void {
  setXmlParser((src) => {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error(`XML parse error: ${err.textContent ?? 'malformed document'}`);
    const root = doc.documentElement;
    if (!root) throw new Error('XML parse error: no document element');
    return convert(root);
  });
}

function convert(el: globalThis.Element): XNode {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;

  const children: XNode[] = [];
  let text = '';
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === Node.ELEMENT_NODE) children.push(convert(c as globalThis.Element));
    else if (c.nodeType === Node.TEXT_NODE || c.nodeType === Node.CDATA_SECTION_NODE) {
      text += c.nodeValue ?? '';
    }
  }

  return { tag: el.localName || el.nodeName, attrs, children, text };
}
