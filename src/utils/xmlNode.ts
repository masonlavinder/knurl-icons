import { DOMParser } from '@xmldom/xmldom';

import { setXmlParser, type XNode } from '../core/io/xml.ts';

/** Node-side XML parser registration, used by tests and CLI tooling. */
export function registerNodeXmlParser(): void {
  setXmlParser((src) => {
    const doc = new DOMParser({
      onError: (level, msg) => {
        if (level === 'fatalError') throw new Error(`XML parse error: ${msg}`);
      },
    }).parseFromString(src, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root) throw new Error('XML parse error: no document element');
    return convert(root as unknown as MinimalElement);
  });
}

type MinimalElement = {
  nodeType: number;
  nodeName: string;
  localName?: string;
  nodeValue?: string | null;
  attributes?: { length: number; item(i: number): { name: string; value: string } | null } | null;
  childNodes?: { length: number; item(i: number): MinimalElement | null } | null;
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

function convert(el: MinimalElement): XNode {
  const attrs: Record<string, string> = {};
  const list = el.attributes;
  if (list) {
    for (let i = 0; i < list.length; i++) {
      const a = list.item(i);
      if (a) attrs[a.name] = a.value;
    }
  }

  const children: XNode[] = [];
  let text = '';
  const kids = el.childNodes;
  if (kids) {
    for (let i = 0; i < kids.length; i++) {
      const c = kids.item(i);
      if (!c) continue;
      if (c.nodeType === ELEMENT_NODE) children.push(convert(c));
      else if (c.nodeType === TEXT_NODE || c.nodeType === CDATA_NODE) text += c.nodeValue ?? '';
    }
  }

  return { tag: el.localName ?? el.nodeName, attrs, children, text };
}
