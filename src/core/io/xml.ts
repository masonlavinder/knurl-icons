/**
 * A minimal XML tree, and an injected parser.
 *
 * core/ must not touch `document` or `window`, so the concrete parser is
 * registered from the outside: the browser build registers DOMParser, the node
 * test setup registers @xmldom/xmldom. Everything downstream works on XNode.
 */
export type XNode = {
  tag: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Concatenated text content, for <style> and <text>. */
  text: string;
};

export type XmlParser = (src: string) => XNode;

let impl: XmlParser | null = null;

export function setXmlParser(fn: XmlParser): void {
  impl = fn;
}

export function parseXml(src: string): XNode {
  if (!impl) {
    throw new Error(
      'no XML parser registered: call setXmlParser() from the platform entry point',
    );
  }
  return impl(src);
}

/** Depth-first walk, root first. */
export function walk(n: XNode, visit: (n: XNode, parent: XNode | null) => void): void {
  const rec = (node: XNode, parent: XNode | null): void => {
    visit(node, parent);
    for (const c of node.children) rec(c, node);
  };
  rec(n, null);
}

export function findFirst(n: XNode, tag: string): XNode | null {
  let found: XNode | null = null;
  walk(n, (x) => {
    if (found === null && x.tag === tag) found = x;
  });
  return found;
}
