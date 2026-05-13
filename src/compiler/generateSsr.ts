import { createCompileError } from "./errors.js";
import { compileTemplateExpression, parseForExpression } from "./parseExpression.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode } from "./types.js";

type SsrGenerateContext = {
  lines: string[];
  index: number;
  teleportIndex: number;
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

type BindDirective = {
  name?: string;
  nameExpression?: string;
  modifiers: string[];
};

export function generateSsr(descriptor: SfcDescriptor, root: ElementNode): string {
  const context: SsrGenerateContext = {
    lines: [],
    index: 0,
    teleportIndex: 0,
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

  emit(context, 0, "export async function renderToString(props = {}) {");
  emit(context, 1, "let __mikuru_html = \"\";");
  emit(context, 1, "const __mikuru_teleports = props.__mikuru_teleports ?? {};");
  emit(context, 1, `const __mikuru_componentInfo = { component: ${quote(descriptor.filename ?? "anonymous.mikuru")}, filename: ${quote(descriptor.filename ?? "anonymous.mikuru")} };`);
  emit(context, 1, "const __mikuru_context = { parent: props.__mikuru_context, provides: new Map(), ...__mikuru_componentInfo };");
  emit(context, 1, "const __mikuru_ssrRegistrar = {");
  emit(context, 2, "provide: (key, value) => __mikuru_context.provides.set(key, value),");
  emit(context, 2, "inject: (key) => {");
  emit(context, 3, "for (let context = __mikuru_context; context; context = context.parent) {");
  emit(context, 4, "if (context.provides?.has(key)) return { found: true, value: context.provides.get(key) };");
  emit(context, 3, "}");
  emit(context, 3, "return { found: false };");
  emit(context, 2, "}");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_previousRegistrar = globalThis.__mikuru_currentRegistrar;");
  emit(context, 1, "globalThis.__mikuru_currentRegistrar = __mikuru_ssrRegistrar;");
  emit(context, 1, "try {");
  if (script.body.trim()) {
    emitRaw(context, script.body.trim());
    emit(context, 2, "");
  }
  emitNode(context, root, 2);
  emit(context, 2, "return __mikuru_html;");
  emit(context, 1, "} finally {");
  emit(context, 2, "globalThis.__mikuru_currentRegistrar = __mikuru_previousRegistrar;");
  emit(context, 1, "}");
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
  if (getAttr(node, "v-pre") && !skippedAttrs.has("v-pre")) {
    emitPreElement(context, node, indent);
    return;
  }

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

  if (node.tag === "component") {
    emitDynamicComponent(context, node, indent);
    return;
  }

  if (node.tag === "KeepAlive") {
    emitKeepAlive(context, node, indent);
    return;
  }

  if (node.tag === "AsyncBoundary") {
    emitAsyncBoundary(context, node, indent);
    return;
  }

  if (node.tag === "Teleport") {
    emitTeleport(context, node, indent);
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
  const contentDirective = getContentDirectiveAttr(node);
  if (contentDirective) {
    emitContentDirective(context, contentDirective, indent);
  } else {
    emitChildren(context, node.children, indent);
  }
  emit(context, indent, `__mikuru_html += ${quote(`</${node.tag}>`)};`);
}

function emitPreElement(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  emit(context, indent, `__mikuru_html += ${quote(`<${node.tag}`)};`);

  for (const attr of node.attrs) {
    if (attr.name === "v-pre") {
      continue;
    }

    emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${quote(attr.name)}, ${attr.value === true ? "true" : quote(attr.value)});`);
  }

  if (context.scopeAttr) {
    emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${quote(context.scopeAttr)}, true);`);
  }

  if (voidElements.has(node.tag.toLowerCase())) {
    emit(context, indent, "__mikuru_html += \">\";");
    return;
  }

  emit(context, indent, "__mikuru_html += \">\";");
  for (const child of node.children) {
    emitPreNode(context, child, indent);
  }
  emit(context, indent, `__mikuru_html += ${quote(`</${node.tag}>`)};`);
}

function emitPreNode(context: SsrGenerateContext, node: TemplateNode, indent: number): void {
  if (node.type === "text") {
    for (const part of node.parts) {
      emit(context, indent, `__mikuru_html += __mikuru_escape(${quote(part.value)});`);
    }
    return;
  }

  emitPreElement(context, node, indent);
}

function emitContentDirective(context: SsrGenerateContext, attr: TemplateAttribute, indent: number): void {
  const expression = compileSsrExpression(context, requireAttrValue(attr), attr.name);

  if (attr.name === "v-html") {
    emit(context, indent, `__mikuru_html += String(__mikuru_unwrap(${expression}) ?? "");`);
    return;
  }

  emit(context, indent, `__mikuru_html += __mikuru_escape(__mikuru_unwrap(${expression}) ?? "");`);
}

function emitComponent(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const propsVar = nextName(context, "props");
  emit(context, indent, `const ${propsVar} = {};`);
  emitComponentProps(context, node, propsVar, indent);
  emit(context, indent, `${propsVar}.__mikuru_context = __mikuru_context;`);

  if (node.children.length > 0) {
    emitComponentSlots(context, node, propsVar, indent);
  }

  emit(context, indent, `__mikuru_html += await __mikuru_renderComponent(${node.tag}, ${propsVar});`);
}

function emitDynamicComponent(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const isAttr = node.attrs.find((attr) => parseBindDirective(attr.name)?.name === "is");

  if (!isAttr) {
    throw createCompileError("Dynamic component requires :is to resolve to a component object", contextSource(node), node.loc?.offset ?? 0);
  }

  const componentExpression = compileSsrExpression(context, requireAttrValue(isAttr), isAttr.name);
  const dynamicNode = withoutDynamicComponentIs(node);
  const componentVar = nextName(context, "dynamicComponent");
  const propsVar = nextName(context, "props");

  emit(context, indent, `const ${componentVar} = __mikuru_unwrap(${componentExpression});`);
  emit(context, indent, `if (${componentVar}) {`);
  emit(context, indent + 1, `if ((typeof ${componentVar} !== "object" && typeof ${componentVar} !== "function") || (typeof ${componentVar} === "object" && typeof ${componentVar}.renderToString !== "function") && typeof ${componentVar} !== "function") {`);
  emit(context, indent + 2, `throw new Error("Dynamic component :is must resolve to a component object with renderToString()");`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `const ${propsVar} = {};`);
  emitComponentProps(context, dynamicNode, propsVar, indent + 1);
  emit(context, indent + 1, `${propsVar}.__mikuru_context = __mikuru_context;`);
  if (dynamicNode.children.length > 0) {
    emitComponentSlots(context, dynamicNode, propsVar, indent + 1);
  }
  emit(context, indent + 1, `__mikuru_html += await __mikuru_renderComponent(${componentVar}, ${propsVar});`);
  emit(context, indent, "}");
}

function emitKeepAlive(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  validateKeepAliveAttributes(node);
  const child = getSingleElementChild(node, "<KeepAlive>");

  if (child.tag !== "component") {
    throw createCompileError("<KeepAlive> requires a single <component :is=\"...\" /> child in v1", contextSource(child), child.loc?.offset ?? 0);
  }

  if (!getDynamicComponentIsAttr(child)) {
    throw createCompileError("<KeepAlive> dynamic child requires :is to resolve to a component object", contextSource(child), child.loc?.offset ?? 0);
  }

  emitDynamicComponent(context, child, indent);
}

function emitAsyncBoundary(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  validateAsyncBoundaryAttributes(node);
  emitChildren(context, getAsyncBoundaryChildren(node), indent);
}

function emitTeleport(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const id = `t${context.teleportIndex}`;
  context.teleportIndex += 1;
  const toExpression = getTeleportToExpression(context, node);
  const disabledExpression = getTeleportDisabledExpression(context, node);
  const disabledVar = nextName(context, "teleportDisabled");
  const targetVar = nextName(context, "teleportTarget");
  const previousHtmlVar = nextName(context, "previousHtml");
  const contentVar = nextName(context, "teleportContent");

  emit(context, indent, `__mikuru_html += ${quote(`<!--teleport:${id}-->`)};`);
  emit(context, indent, `const ${disabledVar} = Boolean(__mikuru_unwrap(${disabledExpression}));`);
  emit(context, indent, `if (${disabledVar}) {`);
  emitChildren(context, node.children, indent + 1);
  emit(context, indent, "} else {");
  emit(context, indent + 1, `const ${targetVar} = __mikuru_unwrap(${toExpression});`);
  emit(context, indent + 1, `if (typeof ${targetVar} !== "string") { throw new Error("SSR Teleport target must be a string selector."); }`);
  emit(context, indent + 1, `const ${previousHtmlVar} = __mikuru_html;`);
  emit(context, indent + 1, "__mikuru_html = \"\";");
  emitChildren(context, node.children, indent + 1);
  emit(context, indent + 1, `const ${contentVar} = __mikuru_html;`);
  emit(context, indent + 1, `__mikuru_html = ${previousHtmlVar};`);
  emit(context, indent + 1, `__mikuru_teleports[${targetVar}] = (__mikuru_teleports[${targetVar}] ?? "") + ${quote(`<!--teleport content:${id}-->`)} + ${contentVar} + ${quote(`<!--/teleport content:${id}-->`)};`);
  emit(context, indent, "}");
  emit(context, indent, `__mikuru_html += ${quote(`<!--/teleport:${id}-->`)};`);
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
  emit(context, indent + 1, "const __mikuru_previousSlotRegistrar = globalThis.__mikuru_currentRegistrar;");
  emit(context, indent + 1, "globalThis.__mikuru_currentRegistrar = __mikuru_ssrRegistrar;");
  emit(context, indent + 1, "try {");
  if (scope) {
    emit(context, indent + 2, `const ${scope} = ${propsVar};`);
  }
  emit(context, indent + 2, "let __mikuru_html = \"\";");
  emitChildren(context, children, indent + 2);
  emit(context, indent + 2, "return __mikuru_html;");
  emit(context, indent + 1, "} finally {");
  emit(context, indent + 2, "globalThis.__mikuru_currentRegistrar = __mikuru_previousSlotRegistrar;");
  emit(context, indent + 1, "}");
  emit(context, indent, "};");
  return slotVar;
}

function emitComponentProps(context: SsrGenerateContext, node: ElementNode, propsVar: string, indent: number): void {
  for (const attr of node.attrs) {
    if (shouldSkipAttr(attr)) {
      continue;
    }

    const objectBindDirective = parseObjectBindDirective(attr.name);
    if (objectBindDirective) {
      validateObjectBindModifiers(objectBindDirective, attr, "component");
      emit(context, indent, `Object.assign(${propsVar}, __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), attr.name)}) ?? {});`);
      continue;
    }

    const bindDirective = parseBindDirective(attr.name);
    const dynamicArgument = bindDirective?.nameExpression ? bindDirective : undefined;
    if (dynamicArgument) {
      validateBindModifiers(dynamicArgument, attr, "component");
      emit(context, indent, `${propsVar}[${bindNameExpression(`String(__mikuru_unwrap(${compileSsrExpression(context, dynamicArgument.nameExpression ?? "", attr.name)}) ?? "")`, dynamicArgument)}] = __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), attr.name)});`);
      continue;
    }

    const dynamicName = bindDirective?.name;
    if (dynamicName) {
      validateBindModifiers(bindDirective, attr, "component");
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
  emit(context, indent, `${slotPropsVar}.__mikuru_context = __mikuru_context;`);
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

    const objectBindDirective = parseObjectBindDirective(attr.name);
    if (objectBindDirective) {
      validateObjectBindModifiers(objectBindDirective, attr, "component");
      emit(context, indent, `Object.assign(${propsVar}, __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), attr.name)}) ?? {});`);
      continue;
    }

    const bindDirective = parseBindDirective(attr.name);
    const dynamicArgument = bindDirective?.nameExpression ? bindDirective : undefined;
    if (dynamicArgument) {
      validateBindModifiers(dynamicArgument, attr, "component");
      emit(context, indent, `${propsVar}[${bindNameExpression(`String(__mikuru_unwrap(${compileSsrExpression(context, dynamicArgument.nameExpression ?? "", attr.name)}) ?? "")`, dynamicArgument)}] = __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), attr.name)});`);
      continue;
    }

    const dynamicName = bindDirective?.name;
    if (dynamicName) {
      validateBindModifiers(bindDirective, attr, "component");
      emit(context, indent, `${propsVar}[${quote(dynamicName)}] = __mikuru_unwrap(${compileSsrExpression(context, String(attr.value), attr.name)});`);
      continue;
    }

    emit(context, indent, `${propsVar}[${quote(attr.name)}] = ${attr.value === true ? "true" : quote(attr.value)};`);
  }
}

function emitAttrs(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const staticClass = getStaticAttrValue(node, "class");
  const staticStyle = getStaticAttrValue(node, "style");
  const hasObjectBind = node.attrs.some((attr) => Boolean(parseObjectBindDirective(attr.name)));
  const hasDynamicClass = node.attrs.some((attr) => getDynamicAttrName(attr.name) === "class");
  const hasDynamicStyle = node.attrs.some((attr) => getDynamicAttrName(attr.name) === "style");

  for (const attr of node.attrs) {
    if (attr.name === "v-cloak") {
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr("v-cloak", "");`);
      continue;
    }

    if (shouldSkipAttr(attr)) {
      continue;
    }

    const objectBindDirective = parseObjectBindDirective(attr.name);
    if (objectBindDirective) {
      validateObjectBindModifiers(objectBindDirective, attr, "element");
      if (objectBindDirective.modifiers.includes("prop")) {
        continue;
      }
      const value = String(attr.value);
      const attrsVar = nextName(context, "attrs");
      const renderedAttrsVar = objectBindDirective.modifiers.includes("camel") ? nextName(context, "attrs") : attrsVar;
      emit(context, indent, "{");
      emit(context, indent + 1, `const ${attrsVar} = __mikuru_unwrap(${compileSsrExpression(context, value, "v-bind")}) ?? {};`);
      if (objectBindDirective.modifiers.includes("camel")) {
        emit(context, indent + 1, `const ${renderedAttrsVar} = Object.fromEntries(Object.entries(${attrsVar}).map(([key, value]) => [String(key).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()), value]));`);
      }
      emit(context, indent + 1, `__mikuru_html += __mikuru_renderAttrs({ ...${renderedAttrsVar}${staticClass ? `, class: [${quote(staticClass)}, ${renderedAttrsVar}.class]` : ""}${staticStyle ? `, style: [${quote(staticStyle)}, ${renderedAttrsVar}.style]` : ""} });`);
      emit(context, indent, "}");
      continue;
    }

    const bindDirective = parseBindDirective(attr.name);
    const dynamicArgument = bindDirective?.nameExpression ? bindDirective : undefined;
    if (dynamicArgument) {
      validateBindModifiers(dynamicArgument, attr, "element");
      if (dynamicArgument.modifiers.includes("prop")) {
        continue;
      }
      const value = String(attr.value);
      const nameExpression = compileSsrExpression(context, dynamicArgument.nameExpression ?? "", attr.name);
      const valueExpression = compileSsrExpression(context, value, attr.name);
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${bindNameExpression(`String(__mikuru_unwrap(${nameExpression}) ?? "")`, dynamicArgument)}, __mikuru_unwrap(${valueExpression}));`);
      continue;
    }

    const dynamicName = bindDirective?.name;
    if (dynamicName) {
      validateBindModifiers(bindDirective, attr, "element");
      if (bindDirective.modifiers.includes("prop")) {
        continue;
      }
      const value = String(attr.value);
      const expression = compileSsrExpression(context, value, attr.name);
      const valueExpression =
        dynamicName === "class" && staticClass
          ? `[${quote(staticClass)}, __mikuru_unwrap(${expression})]`
          : dynamicName === "style" && staticStyle
            ? `[${quote(staticStyle)}, __mikuru_unwrap(${expression})]`
            : `__mikuru_unwrap(${expression})`;
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${quote(dynamicName)}, ${valueExpression});`);
      continue;
    }

    if ((attr.name === "class" && (hasDynamicClass || hasObjectBind)) || (attr.name === "style" && (hasDynamicStyle || hasObjectBind))) {
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
    || attr.name === "v-html"
    || attr.name === "v-text"
    || attr.name === "v-pre"
    || attr.name === "v-cloak"
    || attr.name === "v-model"
    || attr.name === "ref"
    || attr.name === "key"
    || attr.name.startsWith("@")
    || attr.name.startsWith("v-on:")
    || attr.name.startsWith("#")
    || attr.name.startsWith("v-slot");
}

function getDynamicAttrName(name: string): string | undefined {
  const binding = parseBindDirective(name);
  return binding?.nameExpression ? undefined : binding?.name;
}

function getDynamicAttrArgument(name: string): { expression: string } | undefined {
  const binding = parseBindDirective(name);
  return binding?.nameExpression ? { expression: binding.nameExpression } : undefined;
}

function parseBindDirective(name: string): BindDirective | undefined {
  const dynamic = parseDynamicArgument(name, [":", "v-bind:"]);
  if (dynamic) {
    return { nameExpression: dynamic.expression, modifiers: dynamic.modifiers };
  }

  const rawName = name.startsWith(":")
    ? name.slice(1)
    : name.startsWith("v-bind:")
      ? name.slice("v-bind:".length)
      : undefined;

  if (!rawName) {
    return undefined;
  }

  const [bindingName, ...modifiers] = rawName.split(".");
  if (!bindingName) {
    return undefined;
  }

  return { name: modifiers.includes("camel") ? camelize(bindingName) : bindingName, modifiers };
}

function validateBindModifiers(binding: BindDirective, attr: TemplateAttribute, target: "element" | "component"): void {
  const allowed = new Set(["camel", "prop", "attr"]);
  for (const modifier of binding.modifiers) {
    if (!allowed.has(modifier)) {
      throw new Error(`Unsupported v-bind modifier ".${modifier}" on ${attr.name}. Use .camel, .prop, or .attr.`);
    }
  }

  if (binding.modifiers.includes("prop") && binding.modifiers.includes("attr")) {
    throw new Error(`v-bind modifiers .prop and .attr cannot be used together on ${attr.name}`);
  }

  if (target === "component" && (binding.modifiers.includes("prop") || binding.modifiers.includes("attr"))) {
    throw new Error(`v-bind .prop and .attr modifiers are only supported on native elements: ${attr.name}`);
  }
}

function validateObjectBindModifiers(binding: BindDirective, attr: TemplateAttribute, target: "element" | "component"): void {
  const allowed = new Set(["camel", "prop", "attr"]);
  for (const modifier of binding.modifiers) {
    if (!allowed.has(modifier)) {
      throw new Error(`Unsupported object v-bind modifier ".${modifier}" on ${attr.name}. Use .camel, .prop, or .attr.`);
    }
  }

  if (binding.modifiers.includes("prop") && binding.modifiers.includes("attr")) {
    throw new Error(`Object v-bind modifiers .prop and .attr cannot be used together on ${attr.name}`);
  }

  if (target === "component" && binding.modifiers.length > 0) {
    throw new Error(`Object v-bind modifiers are only supported on native elements: ${attr.name}`);
  }
}

function bindNameExpression(expression: string, binding: BindDirective): string {
  return binding.modifiers.includes("camel") ? `(${expression}).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())` : expression;
}

function camelize(value: string): string {
  return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function parseObjectBindDirective(name: string): BindDirective | undefined {
  if (name === "v-bind") {
    return { modifiers: [] };
  }

  if (!name.startsWith("v-bind.")) {
    return undefined;
  }

  return { modifiers: name.slice("v-bind.".length).split(".").filter(Boolean) };
}

function parseDynamicArgument(name: string, prefixes: string[]): { expression: string; modifiers: string[] } | undefined {
  for (const prefix of prefixes) {
    if (!name.startsWith(`${prefix}[`)) {
      continue;
    }

    const argumentStart = prefix.length + 1;
    const argumentEnd = name.indexOf("]", argumentStart);
    if (argumentEnd === -1) {
      return undefined;
    }

    const expression = name.slice(argumentStart, argumentEnd).trim();
    if (!expression) {
      return undefined;
    }

    const rest = name.slice(argumentEnd + 1);
    const modifiers = rest.startsWith(".") ? rest.slice(1).split(".").filter(Boolean) : [];
    return { expression, modifiers };
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

function getTeleportToExpression(context: SsrGenerateContext, node: ElementNode): string {
  const dynamicTarget = getAttr(node, ":to") ?? getAttr(node, "v-bind:to");
  if (dynamicTarget && dynamicTarget.value !== true) {
    return compileSsrExpression(context, String(dynamicTarget.value), "Teleport to");
  }

  const staticTarget = getAttr(node, "to");
  if (staticTarget && staticTarget.value !== true) {
    return quote(staticTarget.value);
  }

  throw createCompileError("<Teleport> requires a to target", contextSource(node), node.loc?.offset ?? 0);
}

function getTeleportDisabledExpression(context: SsrGenerateContext, node: ElementNode): string {
  const dynamicDisabled = getAttr(node, ":disabled") ?? getAttr(node, "v-bind:disabled");
  if (dynamicDisabled && dynamicDisabled.value !== true) {
    return compileSsrExpression(context, String(dynamicDisabled.value), "Teleport disabled");
  }

  return getAttr(node, "disabled") ? "true" : "false";
}

function validateKeepAliveAttributes(node: ElementNode): void {
  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (name === "include" || name === "exclude" || name === "max") {
      continue;
    }

    throw createCompileError(`Unsupported attribute "${attr.name}" on <KeepAlive>. Supported attributes: include, exclude, and max.`, contextSource(node), attr.loc?.offset ?? node.loc?.offset ?? 0);
  }
}

function validateAsyncBoundaryAttributes(node: ElementNode): void {
  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (name === "loading" || name === "fallback" || name === "delay" || name === "timeout") {
      continue;
    }

    throw createCompileError(`Unsupported attribute "${attr.name}" on <AsyncBoundary>. Supported attributes: loading, fallback, delay, and timeout.`, contextSource(node), attr.loc?.offset ?? node.loc?.offset ?? 0);
  }
}

function getAsyncBoundaryChildren(node: ElementNode): TemplateNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length === 0) {
    throw createCompileError("<AsyncBoundary> requires at least one child", contextSource(node), node.loc?.offset ?? 0);
  }

  return node.children;
}

function getSingleElementChild(node: ElementNode, label: string): ElementNode {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length !== 1 || meaningful[0]?.type !== "element") {
    throw createCompileError(`${label} requires exactly one element or component child`, contextSource(node), node.loc?.offset ?? 0);
  }

  return meaningful[0];
}

function getDynamicComponentIsAttr(node: ElementNode): TemplateAttribute | undefined {
  return node.attrs.find((attr) => parseBindDirective(attr.name)?.name === "is");
}

function withoutDynamicComponentIs(node: ElementNode): ElementNode {
  return {
    ...node,
    attrs: node.attrs.filter((attr) => parseBindDirective(attr.name)?.name !== "is")
  };
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

function getStaticAttrValue(node: ElementNode, name: string): string | undefined {
  const attr = getAttr(node, name);
  return attr && attr.value !== true ? String(attr.value) : undefined;
}

function getContentDirectiveAttr(node: ElementNode): TemplateAttribute | undefined {
  return getAttr(node, "v-html") ?? getAttr(node, "v-text");
}

function requireAttrValue(attr: TemplateAttribute): string {
  if (attr.value === true) {
    throw new Error(`Attribute ${attr.name} requires a value`);
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

function emitRaw(context: SsrGenerateContext, source: string, indent = 0): void {
  for (const line of source.split(/\r?\n/)) {
    context.lines.push(`${"  ".repeat(indent)}${line}`);
  }
}

function quote(value: unknown): string {
  return JSON.stringify(String(value));
}
