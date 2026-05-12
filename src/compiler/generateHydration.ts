import { compileTemplateExpression, parseForExpression } from "./parseExpression.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode } from "./types.js";

type HydrationContext = {
  lines: string[];
  index: number;
  teleportIndex: number;
  source?: string;
  filename?: string;
};

type ScriptParts = {
  imports: string[];
  body: string;
};

export function generateHydration(descriptor: SfcDescriptor, root: ElementNode): string {
  const context: HydrationContext = {
    lines: [],
    index: 0,
    teleportIndex: 0,
    source: descriptor.source,
    filename: descriptor.filename
  };
  const script = splitScript(descriptor.script ?? "");

  for (const importLine of script.imports) {
    emit(context, 0, importLine);
  }
  emit(context, 0, "import { effect, setAttribute, unwrap } from \"mikuru/runtime\";");
  emit(context, 0, "");
  if (script.body.trim()) {
    emitRaw(context, script.body.trim());
    emit(context, 0, "");
  }

  emit(context, 0, "export function hydrate(target, props = {}) {");
  emit(context, 1, "const __mikuru_cleanup = [];");
  emit(context, 1, "const __mikuru_warn = (message) => { if (typeof console !== \"undefined\" && console.warn) console.warn(`[Mikuru hydration] ${message}`); };");
  emit(context, 1, "const __mikuru_findComment = (parent, value) => Array.from(parent.childNodes ?? []).find((node) => node.nodeType === 8 && node.nodeValue === value);");
  emit(context, 1, "const __mikuru_findNextComment = (node, value) => { for (let cursor = node.nextSibling; cursor; cursor = cursor.nextSibling) { if (cursor.nodeType === 8 && cursor.nodeValue === value) return cursor; } return undefined; };");
  emit(context, 1, "const __mikuru_root = target.nodeType === 1 && target.tagName?.toLowerCase() === " + quote(root.tag.toLowerCase()) + " ? target : target.firstElementChild;");
  emit(context, 1, `if (!__mikuru_root || __mikuru_root.tagName?.toLowerCase() !== ${quote(root.tag.toLowerCase())}) { __mikuru_warn("Root mismatch; falling back to mount()."); return mount(target, props); }`);
  hydrateElement(context, root, "__mikuru_root", 1);
  emit(context, 1, "return {");
  emit(context, 2, "element: __mikuru_root,");
  emit(context, 2, "unmount() { for (const cleanup of __mikuru_cleanup.splice(0).reverse()) cleanup(); }");
  emit(context, 1, "};");
  emit(context, 0, "}");

  return `${context.lines.join("\n")}\n`;
}

function hydrateNode(context: HydrationContext, node: TemplateNode, nodeVar: string, indent: number): void {
  if (node.type === "text") {
    hydrateText(context, node, nodeVar, indent);
    return;
  }
  hydrateElement(context, node, nodeVar, indent);
}

function hydrateElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  if (node.tag === "Teleport") {
    hydrateTeleport(context, node, elementVar, indent);
    return;
  }

  if (isComponentTag(node.tag)) {
    hydrateComponent(context, node, elementVar, indent);
    return;
  }

  hydrateAttrs(context, node, elementVar, indent);
  hydrateEvents(context, node, elementVar, indent);
  hydrateChildren(context, node.children, elementVar, indent);
}

function hydrateChildren(context: HydrationContext, rawChildren: TemplateNode[], parentVar: string, indent: number): void {
  const children = rawChildren.filter(isHydratableNode);
  const domIndexVar = nextName(context, "domIndex");
  emit(context, indent, `let ${domIndexVar} = 0;`);
  children.forEach((child) => {
    if (child.type === "element" && child.tag === "Teleport") {
      hydrateTeleportAtIndex(context, child, parentVar, domIndexVar, indent);
      return;
    }

    if (child.type === "element" && getAttr(child, "v-if")) {
      hydrateIf(context, child, parentVar, domIndexVar, indent);
      emit(context, indent, `${domIndexVar} += 1;`);
      return;
    }

    if (child.type === "element" && getAttr(child, "v-for")) {
      hydrateFor(context, child, parentVar, domIndexVar, indent, domIndexVar);
      return;
    }

    const childVar = nextName(context, "node");
    emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndexVar}];`);
    if (child.type === "element") {
      const elementCheck = isComponentTag(child.tag)
        ? `!${childVar} || ${childVar}.nodeType !== 1`
        : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(child.tag.toLowerCase())}`;
      emit(context, indent, `if (${elementCheck}) { __mikuru_warn(${quote(`Element mismatch at <${child.tag}>`)}); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    } else {
      emit(context, indent, `if (!${childVar} || ${childVar}.nodeType !== 3) { __mikuru_warn("Text node mismatch."); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    }
    emit(context, indent, `${domIndexVar} += 1;`);
  });
}

function hydrateTeleportAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  const id = `t${context.teleportIndex}`;
  context.teleportIndex += 1;
  const startVar = nextName(context, "teleportStart");
  const endVar = nextName(context, "teleportEnd");
  const disabledVar = nextName(context, "teleportDisabled");
  const targetVar = nextName(context, "teleportTarget");
  const contentStartVar = nextName(context, "teleportContentStart");
  const contentEndVar = nextName(context, "teleportContentEnd");
  const nodesVar = nextName(context, "teleportNodes");
  const cursorVar = nextName(context, "teleportCursor");
  const parentProxyVar = nextName(context, "teleportParent");
  const toExpression = getTeleportToExpression(context, node);
  const disabledExpression = getTeleportDisabledExpression(context, node);

  emit(context, indent, `const ${startVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent, `const ${endVar} = ${startVar} ? __mikuru_findNextComment(${startVar}, ${quote(`/teleport:${id}`)}) : undefined;`);
  emit(context, indent, `if (!${startVar} || ${startVar}.nodeType !== 8 || ${startVar}.nodeValue !== ${quote(`teleport:${id}`)} || !${endVar}) {`);
  emit(context, indent + 1, "__mikuru_warn(\"Teleport marker mismatch.\");");
  emit(context, indent, "} else {");
  emit(context, indent + 1, `const ${disabledVar} = Boolean(unwrap(${disabledExpression}));`);
  emit(context, indent + 1, `const ${targetVar} = ${disabledVar} ? undefined : (typeof unwrap(${toExpression}) === "string" ? document.querySelector(unwrap(${toExpression})) : unwrap(${toExpression}));`);
  emit(context, indent + 1, `if (!${disabledVar} && !${targetVar}) { __mikuru_warn("Teleport target was not found."); } else {`);
  emit(context, indent + 2, `const ${contentStartVar} = ${disabledVar} ? ${startVar} : __mikuru_findComment(${targetVar}, ${quote(`teleport content:${id}`)});`);
  emit(context, indent + 2, `const ${contentEndVar} = ${disabledVar} ? ${endVar} : __mikuru_findComment(${targetVar}, ${quote(`/teleport content:${id}`)});`);
  emit(context, indent + 2, `if (!${contentStartVar} || !${contentEndVar}) { __mikuru_warn("Teleport content marker mismatch."); } else {`);
  emit(context, indent + 3, `const ${nodesVar} = [];`);
  emit(context, indent + 3, `let ${cursorVar} = ${contentStartVar}.nextSibling;`);
  emit(context, indent + 3, `while (${cursorVar} && ${cursorVar} !== ${contentEndVar}) { ${nodesVar}.push(${cursorVar}); ${cursorVar} = ${cursorVar}.nextSibling; }`);
  emit(context, indent + 3, `const ${parentProxyVar} = { childNodes: ${nodesVar} };`);
  hydrateChildren(context, node.children, parentProxyVar, indent + 3);
  emit(context, indent + 3, `if (!${disabledVar}) __mikuru_cleanup.push(() => { ${contentStartVar}.remove(); ${contentEndVar}.remove(); });`);
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${domIndex} = Array.prototype.indexOf.call(${parentVar}.childNodes, ${endVar}) + 1;`);
  emit(context, indent, "}");
}

function hydrateTeleport(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  const domIndexVar = nextName(context, "domIndex");
  emit(context, indent, `let ${domIndexVar} = 0;`);
  hydrateTeleportAtIndex(context, node, "({ childNodes: [undefined, undefined] })", domIndexVar, indent);
}

function hydrateIf(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  const condition = getAttrValue(node, "v-if");
  const childVar = nextName(context, "branch");
  emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent, `if (unwrap(${compileHydrationExpression(context, condition, "v-if")})) {`);
  emit(context, indent + 1, `if (!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(node.tag.toLowerCase())}) { __mikuru_warn("Branch mismatch; dynamic v-if hydration will remount in a future phase."); } else {`);
  hydrateElement(context, withoutAttrs(node, ["v-if"]), childVar, indent + 2);
  emit(context, indent + 1, "}");
  emit(context, indent, `} else if (${childVar}) {`);
  emit(context, indent + 1, "__mikuru_warn(\"Branch mismatch; expected no v-if DOM for initial state.\");");
  emit(context, indent, "}");
}

function hydrateFor(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number, advanceVar?: string): void {
  const attr = getAttr(node, "v-for");
  if (!attr || attr.value === true) {
    return;
  }

  const forExpression = parseForExpression(String(attr.value));
  const listVar = nextName(context, "list");
  const itemVar = nextName(context, "item");
  const childVar = nextName(context, "row");
  emit(context, indent, `const ${listVar} = Array.from(unwrap(${compileHydrationExpression(context, forExpression.source, "v-for source")}) ?? []);`);
  emit(context, indent, `for (const [__mikuru_index, ${itemVar}] of ${listVar}.entries()) {`);
  emit(context, indent + 1, `const ${forExpression.item} = ${itemVar};`);
  if (forExpression.index) {
    emit(context, indent + 1, `const ${forExpression.index} = __mikuru_index;`);
  }
  emit(context, indent + 1, `const ${childVar} = ${parentVar}.childNodes[${domIndex} + __mikuru_index];`);
  emit(context, indent + 1, `if (!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(node.tag.toLowerCase())}) { __mikuru_warn("List mismatch; dynamic v-for hydration will remount in a future phase."); } else {`);
  hydrateElement(context, withoutAttrs(node, ["v-for"]), childVar, indent + 2);
  emit(context, indent + 1, "}");
  emit(context, indent, "}");
  if (advanceVar) {
    emit(context, indent, `${advanceVar} += ${listVar}.length;`);
  }
}

function hydrateAttrs(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  for (const attr of node.attrs) {
    if (shouldSkipAttr(attr)) {
      continue;
    }

    const dynamicName = getDynamicAttrName(attr.name);
    if (dynamicName) {
      emit(context, indent, `__mikuru_cleanup.push(effect(() => setAttribute(${elementVar}, ${quote(dynamicName)}, unwrap(${compileHydrationExpression(context, String(attr.value), attr.name)}))));`);
      continue;
    }

    if (attr.name === "v-bind") {
      emit(context, indent, `__mikuru_cleanup.push(effect(() => { const __mikuru_attrs = unwrap(${compileHydrationExpression(context, String(attr.value), "v-bind")}) ?? {}; for (const [key, value] of Object.entries(__mikuru_attrs)) setAttribute(${elementVar}, key, unwrap(value)); }));`);
      continue;
    }

    emit(context, indent, `setAttribute(${elementVar}, ${quote(attr.name)}, ${attr.value === true ? "true" : quote(attr.value)});`);
  }
}

function hydrateComponent(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  const propsVar = nextName(context, "props");
  emit(context, indent, `const ${propsVar} = {};`);
  hydrateComponentProps(context, node, propsVar, indent);
  emit(context, indent, `if (${node.tag} && typeof ${node.tag}.hydrate === "function") {`);
  emit(context, indent + 1, `const __mikuru_child = ${node.tag}.hydrate(${elementVar}, ${propsVar});`);
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_cleanup.push(() => __mikuru_child.unmount());`);
  emit(context, indent, `} else if (${node.tag} && typeof ${node.tag}.mount === "function") {`);
  emit(context, indent + 1, "__mikuru_warn(\"Component hydration fallback; child component does not expose hydrate().\");");
  emit(context, indent + 1, `const __mikuru_parent = ${elementVar}.parentNode;`);
  emit(context, indent + 1, "const __mikuru_anchor = document.createComment(\"mikuru-hydrate-component\");");
  emit(context, indent + 1, `__mikuru_parent?.insertBefore(__mikuru_anchor, ${elementVar});`);
  emit(context, indent + 1, `${elementVar}.remove();`);
  emit(context, indent + 1, "const __mikuru_fragment = document.createDocumentFragment();");
  emit(context, indent + 1, `const __mikuru_child = ${node.tag}.mount(__mikuru_fragment, ${propsVar});`);
  emit(context, indent + 1, "__mikuru_parent?.insertBefore(__mikuru_fragment, __mikuru_anchor);");
  emit(context, indent + 1, "__mikuru_anchor.remove();");
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_cleanup.push(() => __mikuru_child.unmount());`);
  emit(context, indent, "} else {");
  emit(context, indent + 1, `__mikuru_warn(${quote(`Component mismatch at <${node.tag}>.`)});`);
  emit(context, indent, "}");
}

function hydrateComponentProps(context: HydrationContext, node: ElementNode, propsVar: string, indent: number): void {
  for (const attr of node.attrs) {
    if (shouldSkipAttr(attr)) {
      continue;
    }

    if (attr.name === "v-bind" && attr.value !== true) {
      emit(context, indent, `Object.assign(${propsVar}, unwrap(${compileHydrationExpression(context, String(attr.value), "v-bind")}) ?? {});`);
      continue;
    }

    const dynamicName = getDynamicAttrName(attr.name);
    if (dynamicName && attr.value !== true) {
      emit(context, indent, `${propsVar}[${quote(dynamicName)}] = unwrap(${compileHydrationExpression(context, String(attr.value), attr.name)});`);
      continue;
    }

    emit(context, indent, `${propsVar}[${quote(attr.name)}] = ${attr.value === true ? "true" : quote(attr.value)};`);
  }
}

function hydrateEvents(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  for (const attr of node.attrs) {
    const eventName = getEventName(attr.name);
    if (!eventName || attr.value === true) {
      continue;
    }

    const handlerVar = nextName(context, "handler");
    emit(context, indent, `const ${handlerVar} = ($event) => ${String(attr.value).trim()}($event);`);
    emit(context, indent, `${elementVar}.addEventListener(${quote(eventName)}, ${handlerVar});`);
    emit(context, indent, `__mikuru_cleanup.push(() => ${elementVar}.removeEventListener(${quote(eventName)}, ${handlerVar}));`);
  }
}

function hydrateText(context: HydrationContext, node: TextNode, nodeVar: string, indent: number): void {
  const expression = node.parts.map((part) => {
    if (part.type === "static") {
      return quote(part.value);
    }
    return `String(unwrap(${compileHydrationExpression(context, part.value, "interpolation")}) ?? "")`;
  }).join(" + ");
  emit(context, indent, `__mikuru_cleanup.push(effect(() => { const __mikuru_text = ${expression || "\"\""}; if (${nodeVar}.textContent !== __mikuru_text) ${nodeVar}.textContent = __mikuru_text; }));`);
}

function isHydratableNode(node: TemplateNode): boolean {
  return node.type === "element" || node.parts.some((part) => part.type === "expression" || (part.type === "static" && part.value.length > 0));
}

function shouldSkipAttr(attr: TemplateAttribute): boolean {
  return attr.name === "v-if"
    || attr.name === "v-else-if"
    || attr.name === "v-else"
    || attr.name === "v-for"
    || attr.name === "v-show"
    || attr.name === "v-model"
    || attr.name === "ref"
    || attr.name === "key"
    || attr.name.startsWith("@")
    || attr.name.startsWith("v-on:");
}

function getAttr(node: ElementNode, name: string): TemplateAttribute | undefined {
  return node.attrs.find((attr) => attr.name === name);
}

function getAttrValue(node: ElementNode, name: string): string {
  const attr = getAttr(node, name);
  return attr && attr.value !== true ? attr.value : "false";
}

function withoutAttrs(node: ElementNode, names: string[]): ElementNode {
  return {
    ...node,
    attrs: node.attrs.filter((attr) => !names.includes(attr.name))
  };
}

function isComponentTag(tag: string): boolean {
  return /^[A-Z]/.test(tag);
}

function getDynamicAttrName(name: string): string | undefined {
  if (name.startsWith(":")) return name.slice(1);
  if (name.startsWith("v-bind:")) return name.slice("v-bind:".length);
  return undefined;
}

function getEventName(name: string): string | undefined {
  if (name.startsWith("@")) return name.slice(1).split(".")[0];
  if (name.startsWith("v-on:")) return name.slice("v-on:".length).split(".")[0];
  return undefined;
}

function getTeleportToExpression(context: HydrationContext, node: ElementNode): string {
  const dynamicTarget = getAttr(node, ":to") ?? getAttr(node, "v-bind:to");
  if (dynamicTarget && dynamicTarget.value !== true) {
    return compileHydrationExpression(context, String(dynamicTarget.value), "Teleport to");
  }

  const staticTarget = getAttr(node, "to");
  if (staticTarget && staticTarget.value !== true) {
    return quote(staticTarget.value);
  }

  return "\"\"";
}

function getTeleportDisabledExpression(context: HydrationContext, node: ElementNode): string {
  const dynamicDisabled = getAttr(node, ":disabled") ?? getAttr(node, "v-bind:disabled");
  if (dynamicDisabled && dynamicDisabled.value !== true) {
    return compileHydrationExpression(context, String(dynamicDisabled.value), "Teleport disabled");
  }

  return getAttr(node, "disabled") ? "true" : "false";
}

function compileHydrationExpression(context: HydrationContext, expression: string, usage: string): string {
  return compileTemplateExpression(expression, usage, {
    source: context.source ?? expression,
    offset: 0,
    filename: context.filename
  });
}

function splitScript(script: string): ScriptParts {
  const imports: string[] = [];
  const body: string[] = [];

  for (const line of script.split(/\r?\n/)) {
    if (/^\s*import\s/.test(line)) imports.push(line.trim());
    else body.push(line);
  }

  return { imports, body: body.join("\n") };
}

function emit(context: HydrationContext, indent: number, line: string): void {
  context.lines.push(`${"  ".repeat(indent)}${line}`);
}

function emitRaw(context: HydrationContext, source: string): void {
  for (const line of source.split(/\r?\n/)) {
    context.lines.push(line);
  }
}

function nextName(context: HydrationContext, prefix: string): string {
  const name = `__mikuru_${prefix}_${context.index}`;
  context.index += 1;
  return name;
}

function quote(value: unknown): string {
  return JSON.stringify(String(value));
}
