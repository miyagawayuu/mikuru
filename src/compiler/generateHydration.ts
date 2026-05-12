import { compileTemplateExpression } from "./parseExpression.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode } from "./types.js";

type HydrationContext = {
  lines: string[];
  index: number;
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
  hydrateAttrs(context, node, elementVar, indent);
  hydrateEvents(context, node, elementVar, indent);

  const children = node.children.filter(isHydratableNode);
  children.forEach((child, index) => {
    const childVar = nextName(context, "node");
    emit(context, indent, `const ${childVar} = ${elementVar}.childNodes[${index}];`);
    if (child.type === "element") {
      emit(context, indent, `if (!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(child.tag.toLowerCase())}) { __mikuru_warn(${quote(`Element mismatch at <${child.tag}>`)}); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    } else {
      emit(context, indent, `if (!${childVar} || ${childVar}.nodeType !== 3) { __mikuru_warn("Text node mismatch."); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    }
  });
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
