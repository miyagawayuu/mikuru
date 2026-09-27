export type DomRangeInstance = {
  element: ChildNode;
  __mikuru_start?: ChildNode;
  __mikuru_end?: ChildNode;
};

export function findFragmentEnd(start: ChildNode): ChildNode {
  if (start.nodeType !== 8 || start.nodeValue !== "mikuru-fragment") return start;
  let depth = 0;
  for (let node: ChildNode | null = start; node; node = node.nextSibling) {
    if (node.nodeType !== 8) continue;
    if (node.nodeValue === "mikuru-fragment") depth++;
    else if (node.nodeValue === "/mikuru-fragment" && --depth === 0) return node;
  }
  return start;
}

export function getDomRange(instance: DomRangeInstance): { start: ChildNode; end: ChildNode } {
  const start = instance.__mikuru_start ?? instance.element;
  return { start, end: instance.__mikuru_end ?? findFragmentEnd(start) };
}

export function collectDomRange(start: ChildNode, end = findFragmentEnd(start)): ChildNode[] {
  const nodes: ChildNode[] = [];
  for (let node: ChildNode | null = start; node; node = node.nextSibling) {
    nodes.push(node);
    if (node === end) break;
  }
  return nodes;
}

export function removeDomRange(start: ChildNode, end = findFragmentEnd(start)): void {
  for (const node of collectDomRange(start, end)) node.remove();
}

export function moveDomRangeBefore(start: ChildNode, end: ChildNode, parent: Node, before: Node | null): void {
  const fragment = (start.ownerDocument ?? document).createDocumentFragment();
  for (const node of collectDomRange(start, end)) fragment.appendChild(node);
  parent.insertBefore(fragment, before);
}
