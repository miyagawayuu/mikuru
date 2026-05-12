import { createCompileError } from "./errors.js";
import { compileTemplateExpression, parseForExpression } from "./parseExpression.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode } from "./types.js";

type SsrGenerateContext = {
  lines: string[];
  index: number;
  source?: string;
  filename?: string;
  scopeAttr?: string;
};

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

type IfBranch = {
  node: ElementNode;
  condition?: string;
  directive: "v-if" | "v-else-if" | "v-else";
};

type ScriptParts = {
  imports: string[];
  body: string;
};

export function generateSsr(descriptor: SfcDescriptor, root: ElementNode): string {
  const context: SsrGenerateContext = {
    lines: [],
    index: 0,
    source: descriptor.source,
    filename: descriptor.filename,
    scopeAttr: descriptor.styleScoped ? createScopeAttr(descriptor) : undefined
  };
  const script = splitScript(descriptor.script ?? "");

  for (const importLine of script.imports) {
    emit(context, 0, importLine);
  }
  emit(context, 0, "import { escapeHtml as __mikuru_escape, renderAttr as __mikuru_renderAttr, renderAttrs as __mikuru_renderAttrs, renderComponentToString as __mikuru_renderComponent } from \"mikuru/server\";");
  emit(context, 0, "import { unwrap as __mikuru_unwrap } from \"mikuru/runtime\";");
  emit(context, 0, "");
  if (script.body.trim()) {
    emitRaw(context, script.body.trim());
    emit(context, 0, "");
  }

  emit(context, 0, "export async function renderToString(props = {}) {");
  emit(context, 1, "let __mikuru_html = \"\";");
  emitNode(context, root, 1);
  emit(context, 1, "return __mikuru_html;");
  emit(context, 0, "}");

  return `${context.lines.join("\n")}\n`;
}

function emitNode(context: SsrGenerateContext, node: TemplateNode, indent: number): void {
  if (node.type === "text") {
    emitText(context, node, indent);
    return;
  }

  emitElement(context, node, indent);
}

function emitChildren(context: SsrGenerateContext, children: TemplateNode[], indent: number): void {
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type === "element" && getAttr(child, "v-if")) {
      const branches: IfBranch[] = [{ node: child, condition: getAttrValue(child, "v-if"), directive: "v-if" }];
      let cursor = index + 1;
      while (cursor < children.length && children[cursor]?.type === "element") {
        const branchNode = children[cursor] as ElementNode;
        if (getAttr(branchNode, "v-else-if")) {
          branches.push({ node: branchNode, condition: getAttrValue(branchNode, "v-else-if"), directive: "v-else-if" });
          cursor += 1;
          continue;
        }
        if (getAttr(branchNode, "v-else")) {
          branches.push({ node: branchNode, directive: "v-else" });
          cursor += 1;
        }
        break;
      }
      emitIfBranches(context, branches, indent);
      index = cursor - 1;
      continue;
    }

    if (child.type === "element" && (getAttr(child, "v-else-if") || getAttr(child, "v-else"))) {
      continue;
    }

    emitNode(context, child, indent);
  }
}

function emitIfBranches(context: SsrGenerateContext, branches: IfBranch[], indent: number): void {
  branches.forEach((branch, index) => {
    const expression = branch.condition ? compileSsrExpression(context, branch.condition, branch.directive) : undefined;
    if (index === 0) {
      emit(context, indent, `if (__mikuru_unwrap(${expression})) {`);
    } else if (branch.directive === "v-else-if") {
      emit(context, indent, `else if (__mikuru_unwrap(${expression})) {`);
    } else {
      emit(context, indent, "else {");
    }
    emitElement(context, branch.node, indent + 1, new Set(["v-if", "v-else-if", "v-else"]));
    emit(context, indent, "}");
  });
}

function emitElement(context: SsrGenerateContext, node: ElementNode, indent: number, skippedAttrs: Set<string> = new Set()): void {
  const forAttr = getAttr(node, "v-for");
  if (forAttr && !skippedAttrs.has("v-for")) {
    const forExpression = parseForExpression(String(forAttr.value), expressionContext(context, forAttr, "v-for"));
    const source = compileSsrExpression(context, forExpression.source, "v-for source");
    const listVar = nextName(context, "list");
    const entryVar = nextName(context, "entry");
    emit(context, indent, `const ${listVar} = Array.from(__mikuru_unwrap(${source}) ?? []);`);
    emit(context, indent, `for (const [__mikuru_index, ${entryVar}] of ${listVar}.entries()) {`);
    emit(context, indent + 1, `const ${forExpression.item} = ${entryVar};`);
    if (forExpression.index) {
      emit(context, indent + 1, `const ${forExpression.index} = __mikuru_index;`);
    }
    emitElement(context, node, indent + 1, new Set([...skippedAttrs, "v-for"]));
    emit(context, indent, "}");
    return;
  }

  if (node.tag === "template") {
    emitChildren(context, node.children, indent);
    return;
  }

  if (node.tag === "slot") {
    emitSlot(context, node, indent);
    return;
  }

  if (isComponentTag(node.tag)) {
    emitComponent(context, node, indent);
    return;
  }

  emit(context, indent, `__mikuru_html += ${quote(`<${node.tag}`)};`);
  emitAttrs(context, node, indent);
  if (voidElements.has(node.tag.toLowerCase())) {
    emit(context, indent, "__mikuru_html += \">\";");
    return;
  }
  emit(context, indent, "__mikuru_html += \">\";");
  emitChildren(context, node.children, indent);
  emit(context, indent, `__mikuru_html += ${quote(`</${node.tag}>`)};`);
}

function emitComponent(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const propsVar = nextName(context, "props");
  emit(context, indent, `const ${propsVar} = {};`);
  emitComponentProps(context, node, propsVar, indent);

  if (node.children.length > 0) {
    emitComponentSlots(context, node, propsVar, indent);
  }

  emit(context, indent, `__mikuru_html += await __mikuru_renderComponent(${node.tag}, ${propsVar});`);
}

function emitComponentSlots(context: SsrGenerateContext, node: ElementNode, propsVar: string, indent: number): void {
  const defaultChildren: TemplateNode[] = [];
  const namedSlots: Array<{ name: string; children: TemplateNode[]; scope?: string }> = [];

  for (const child of node.children) {
    if (child.type === "element" && child.tag === "template") {
      const slot = getSlotTemplate(child);
      if (slot) {
        namedSlots.push({ ...slot, children: child.children });
        continue;
      }
    }
    defaultChildren.push(child);
  }

  const slotEntries: string[] = [];
  if (defaultChildren.length > 0) {
    const slotVar = emitSlotFunction(context, defaultChildren, indent, undefined);
    emit(context, indent, `${propsVar}.children = ${slotVar};`);
    slotEntries.push(`default: ${slotVar}`);
  }

  for (const slot of namedSlots) {
    const slotVar = emitSlotFunction(context, slot.children, indent, slot.scope);
    slotEntries.push(`${quote(slot.name)}: ${slotVar}`);
  }

  if (slotEntries.length > 0) {
    emit(context, indent, `${propsVar}.slots = { ${slotEntries.join(", ")} };`);
  }
}

function emitSlotFunction(context: SsrGenerateContext, children: TemplateNode[], indent: number, scope: string | undefined): string {
  const slotVar = nextName(context, "slot");
  const propsVar = nextName(context, "slotProps");
  emit(context, indent, `const ${slotVar} = async (${propsVar} = {}) => {`);
  if (scope) {
    emit(context, indent + 1, `const ${scope} = ${propsVar};`);
  }
  emit(context, indent + 1, "let __mikuru_html = \"\";");
  emitChildren(context, children, indent + 1);
  emit(context, indent + 1, "return __mikuru_html;");
  emit(context, indent, "};");
  return slotVar;
}

function emitComponentProps(context: SsrGenerateContext, node: ElementNode, propsVar: string, indent: number): void {
  for (const attr of node.attrs) {
    if (shouldSkipAttr(attr)) {
      continue;
    }

    if (attr.name === "v-bind") {
      emit(context, indent, `Object.assign(${propsVar}, __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), "v-bind")}) ?? {});`);
      continue;
    }

    const dynamicName = getDynamicAttrName(attr.name);
    if (dynamicName) {
      emit(context, indent, `${propsVar}[${quote(dynamicName)}] = __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), attr.name)});`);
      continue;
    }

    emit(context, indent, `${propsVar}[${quote(attr.name)}] = ${attr.value === true ? "true" : quote(attr.value)};`);
  }
}

function emitSlot(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const slotVar = nextName(context, "slotValue");
  const slotName = getSlotName(context, node);
  const slotPropsVar = nextName(context, "slotProps");
  emit(context, indent, `const ${slotVar} = props.slots?.[${slotName}] ?? ${slotName === "\"default\"" ? "props.children" : "undefined"};`);
  emit(context, indent, `const ${slotPropsVar} = {};`);
  emitSlotProps(context, node, slotPropsVar, indent);
  emit(context, indent, `if (typeof ${slotVar} === "function") {`);
  emit(context, indent + 1, `__mikuru_html += await ${slotVar}(${slotPropsVar});`);
  emit(context, indent, `} else if (${slotVar} !== undefined && ${slotVar} !== null) {`);
  emit(context, indent + 1, `__mikuru_html += __mikuru_escape(${slotVar});`);
  if (node.children.length > 0) {
    emit(context, indent, "} else {");
    emitChildren(context, node.children, indent + 1);
  }
  emit(context, indent, "}");
}

function emitSlotProps(context: SsrGenerateContext, node: ElementNode, propsVar: string, indent: number): void {
  for (const attr of node.attrs) {
    if (attr.name === "name" || attr.name === ":name" || attr.name === "v-bind:name" || shouldSkipAttr(attr)) {
      continue;
    }

    if (attr.name === "v-bind") {
      emit(context, indent, `Object.assign(${propsVar}, __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), "slot v-bind")}) ?? {});`);
      continue;
    }

    const dynamicName = getDynamicAttrName(attr.name);
    if (dynamicName) {
      emit(context, indent, `${propsVar}[${quote(dynamicName)}] = __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), attr.name)});`);
      continue;
    }

    emit(context, indent, `${propsVar}[${quote(attr.name)}] = ${attr.value === true ? "true" : quote(attr.value)};`);
  }
}

function emitAttrs(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  for (const attr of node.attrs) {
    if (shouldSkipAttr(attr)) {
      continue;
    }

    if (attr.name === "v-bind") {
      const value = String(attr.value);
      emit(context, indent, `__mikuru_html += __mikuru_renderAttrs(__mikuru_unwrap(${compileSsrExpression(context, value, "v-bind")}));`);
      continue;
    }

    const dynamicName = getDynamicAttrName(attr.name);
    if (dynamicName) {
      const value = String(attr.value);
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${quote(dynamicName)}, __mikuru_unwrap(${compileSsrExpression(context, value, attr.name)}));`);
      continue;
    }

    emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${quote(attr.name)}, ${attr.value === true ? "true" : quote(attr.value)});`);
  }

  if (context.scopeAttr) {
    emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${quote(context.scopeAttr)}, true);`);
  }
}

function emitText(context: SsrGenerateContext, node: TextNode, indent: number): void {
  for (const part of node.parts) {
    if (part.type === "static") {
      emit(context, indent, `__mikuru_html += __mikuru_escape(${quote(part.value)});`);
      continue;
    }

    emit(context, indent, `__mikuru_html += __mikuru_escape(__mikuru_unwrap(${compileSsrExpression(context, part.value, "interpolation")}));`);
  }
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
    || attr.name.startsWith("v-on:")
    || attr.name.startsWith("#")
    || attr.name.startsWith("v-slot");
}

function getDynamicAttrName(name: string): string | undefined {
  if (name.startsWith(":")) {
    return name.slice(1);
  }
  if (name.startsWith("v-bind:")) {
    return name.slice("v-bind:".length);
  }
  return undefined;
}

function getSlotTemplate(node: ElementNode): { name: string; scope?: string } | undefined {
  for (const attr of node.attrs) {
    if (attr.name === "v-slot") {
      return { name: "default", scope: attr.value === true ? undefined : String(attr.value) };
    }
    if (attr.name.startsWith("#") && !attr.name.startsWith("#[")) {
      return { name: attr.name.slice(1) || "default", scope: attr.value === true ? undefined : String(attr.value) };
    }
    if (attr.name.startsWith("v-slot:")) {
      return { name: attr.name.slice("v-slot:".length) || "default", scope: attr.value === true ? undefined : String(attr.value) };
    }
  }
  return undefined;
}

function getSlotName(context: SsrGenerateContext, node: ElementNode): string {
  const dynamicName = getAttr(node, ":name") ?? getAttr(node, "v-bind:name");
  if (dynamicName && dynamicName.value !== true) {
    return `String(__mikuru_unwrap(${compileSsrExpression(context, String(dynamicName.value), "slot name")}) ?? "default")`;
  }

  const staticName = getAttr(node, "name");
  if (staticName && staticName.value !== true) {
    return quote(staticName.value);
  }

  return quote("default");
}

function isComponentTag(tag: string): boolean {
  return /^[A-Z]/.test(tag);
}

function getAttr(node: ElementNode, name: string): TemplateAttribute | undefined {
  return node.attrs.find((attr) => attr.name === name);
}

function getAttrValue(node: ElementNode, name: string): string {
  const attr = getAttr(node, name);
  if (!attr || attr.value === true) {
    throw createCompileError(`${name} requires an expression`, contextSource(node), node.loc?.offset ?? 0);
  }
  return attr.value;
}

function compileSsrExpression(context: SsrGenerateContext, expression: string, usage: string): string {
  return compileTemplateExpression(expression, usage, {
    source: context.source ?? expression,
    offset: 0,
    filename: context.filename
  }).replace(/\bunwrap\(/g, "__mikuru_unwrap(");
}

function expressionContext(context: SsrGenerateContext, attr: TemplateAttribute, usage: string) {
  return {
    source: context.source ?? String(attr.value),
    offset: attr.valueLoc?.offset ?? attr.loc?.offset ?? 0,
    filename: context.filename
  };
}

function splitScript(script: string): ScriptParts {
  const imports: string[] = [];
  const body: string[] = [];

  for (const line of script.split(/\r?\n/)) {
    if (/^\s*import\s/.test(line)) {
      imports.push(line.trim());
    } else {
      body.push(line);
    }
  }

  return {
    imports,
    body: body.join("\n")
  };
}

function createScopeAttr(descriptor: SfcDescriptor): string {
  const seed = descriptor.filename ?? descriptor.template;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return `data-mikuru-${Math.abs(hash).toString(36)}`;
}

function contextSource(node: ElementNode): string {
  return node.tag;
}

function emit(context: SsrGenerateContext, indent: number, line: string): void {
  context.lines.push(`${"  ".repeat(indent)}${line}`);
}

function nextName(context: SsrGenerateContext, prefix: string): string {
  const name = `__mikuru_${prefix}_${context.index}`;
  context.index += 1;
  return name;
}

function emitRaw(context: SsrGenerateContext, source: string): void {
  for (const line of source.split(/\r?\n/)) {
    context.lines.push(line);
  }
}

function quote(value: unknown): string {
  return JSON.stringify(String(value));
}
