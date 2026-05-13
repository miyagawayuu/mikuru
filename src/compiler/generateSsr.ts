import { createCompileError } from "./errors.js";
import { compileTemplateExpression, parseForExpression } from "./parseExpression.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode } from "./types.js";

type SsrGenerateContext = {
  lines: string[];
  index: number;
  teleportIndex: number;
  selectModels: SsrSelectModel[];
  source?: string;
  filename?: string;
  scopeAttr?: string;
};

type SsrSelectModel = {
  expression: string;
  modifiers: string[];
  multiple: boolean;
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

type ComponentSlot = {
  name: string;
  nameExpression?: string;
  children: TemplateNode[];
  scope?: string;
};

export function generateSsr(descriptor: SfcDescriptor, root: ElementNode): string {
  const context: SsrGenerateContext = {
    lines: [],
    index: 0,
    teleportIndex: 0,
    selectModels: [],
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
      while (cursor < children.length) {
        let candidateIndex = cursor;
        while (candidateIndex < children.length && isWhitespaceText(children[candidateIndex])) {
          candidateIndex += 1;
        }

        if (children[candidateIndex]?.type !== "element") {
          break;
        }

        const branchNode = children[candidateIndex] as ElementNode;
        if (getAttr(branchNode, "v-else-if")) {
          branches.push({ node: branchNode, condition: getAttrValue(branchNode, "v-else-if"), directive: "v-else-if" });
          cursor = candidateIndex + 1;
          continue;
        }
        if (getAttr(branchNode, "v-else")) {
          branches.push({ node: branchNode, directive: "v-else" });
          cursor = candidateIndex + 1;
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

  if (node.tag === "ErrorBoundary") {
    emitErrorBoundary(context, node, indent);
    return;
  }

  if (node.tag === "TransitionGroup") {
    emitTransitionGroup(context, node, indent);
    return;
  }

  if (node.tag === "Transition") {
    emitTransition(context, node, indent);
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
  const selectModel = createSsrSelectModel(context, node);
  const contentDirective = getContentDirectiveAttr(node);
  if (contentDirective) {
    emitContentDirective(context, contentDirective, indent);
  } else if (node.tag === "textarea" && hasElementModel(node)) {
    emitTextareaModelContent(context, node, indent);
  } else {
    if (selectModel) {
      context.selectModels.push(selectModel);
    }
    emitChildren(context, node.children, indent);
    if (selectModel) {
      context.selectModels.pop();
    }
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
  emitRouterViewRouteSlot(context, node, propsVar, indent);

  if (node.children.length > 0) {
    emitComponentSlots(context, node, propsVar, indent);
  }

  emit(context, indent, `__mikuru_html += await __mikuru_renderComponent(${node.tag}, ${propsVar});`);
}

function emitRouterViewRouteSlot(context: SsrGenerateContext, node: ElementNode, propsVar: string, indent: number): void {
  if (node.tag !== "RouterView") return;
  emit(context, indent, `if (typeof props.children === "function") { ${propsVar}.children = props.children; ${propsVar}.slots = { ...(${propsVar}.slots ?? {}), default: props.children }; }`);
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
  emitRouterViewRouteSlot(context, dynamicNode, propsVar, indent + 1);
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

function emitErrorBoundary(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  validateErrorBoundaryAttributes(node);
  getErrorBoundaryFallbackAttr(node);
  emitElement(context, getSingleElementChild(node, "<ErrorBoundary>"), indent);
}

function emitTransition(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  validateTransitionAttributes(node);
  const children = getTransitionChildren(node);

  if (getAttr(children[0], "v-if")) {
    emitIfBranches(context, getTransitionBranches(children), indent);
    return;
  }

  emitElement(context, children[0], indent);
}

function emitTransitionGroup(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  validateTransitionGroupAttributes(node);
  const child = getTransitionGroupChild(node);
  const tagVar = nextName(context, "transitionGroupTag");
  emit(context, indent, `const ${tagVar} = String(__mikuru_unwrap(${getTransitionGroupTagExpression(context, node)}) ?? "span");`);
  emit(context, indent, `__mikuru_html += "<" + ${tagVar} + ">";`);
  emitElement(context, withoutAttrs(child, [":key", "v-bind:key"]), indent);
  emit(context, indent, `__mikuru_html += "</" + ${tagVar} + ">";`);
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
  const namedSlots: ComponentSlot[] = [];
  const usedSlotNames = new Set<string>();

  for (const child of node.children) {
    if (child.type === "element" && child.tag === "template") {
      const slot = getSlotTemplate(context, child);
      if (slot) {
        if (!slot.nameExpression && usedSlotNames.has(slot.name)) {
          throw createCompileError(`Duplicate slot template: ${slot.name}`, context.source ?? child.tag, child.loc?.offset ?? 0, context.filename);
        }

        if (!slot.nameExpression) {
          usedSlotNames.add(slot.name);
        }

        namedSlots.push({ ...slot, children: child.children });
        continue;
      }
    }
    defaultChildren.push(child);
  }

  const slotEntries: string[] = [];
  if (defaultChildren.length > 0) {
    if (usedSlotNames.has("default")) {
      throw createCompileError("Duplicate slot template: default", context.source ?? node.tag, node.loc?.offset ?? 0, context.filename);
    }

    const slotVar = emitSlotFunction(context, defaultChildren, indent, undefined);
    emit(context, indent, `${propsVar}.children = ${slotVar};`);
    slotEntries.push(`default: ${slotVar}`);
  }

  const dynamicSlotEntries: Array<{ nameExpression: string; slotVar: string }> = [];
  for (const slot of namedSlots) {
    const slotVar = emitSlotFunction(context, slot.children, indent, slot.scope);
    if (slot.nameExpression) {
      dynamicSlotEntries.push({ nameExpression: slot.nameExpression, slotVar });
      continue;
    }
    if (slot.name === "default") {
      emit(context, indent, `${propsVar}.children = ${slotVar};`);
    }
    slotEntries.push(`${quote(slot.name)}: ${slotVar}`);
  }

  if (slotEntries.length > 0 || dynamicSlotEntries.length > 0) {
    emit(context, indent, `${propsVar}.slots = { ${slotEntries.join(", ")} };`);
  }

  for (const slot of dynamicSlotEntries) {
    emit(context, indent, `${propsVar}.slots[String(__mikuru_unwrap(${slot.nameExpression}) ?? "default")] = ${slot.slotVar};`);
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

    if (shouldSkipAttr(attr) || shouldSkipModelOwnedAttr(context, node, attr)) {
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

  emitModelAttrs(context, node, indent);

  if (context.scopeAttr) {
    emit(context, indent, `__mikuru_html += __mikuru_renderAttr(${quote(context.scopeAttr)}, true);`);
  }
}

function emitModelAttrs(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const model = getElementModel(context, node);
  if (model && node.tag === "input") {
    const inputType = getStaticAttrValue(node, "type")?.toLowerCase();
    if (inputType === "checkbox") {
      const modelValue = `__mikuru_unwrap(${model.expression})`;
      const checkboxValue = ssrInputValueExpression(context, node, model.modifiers);
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr("checked", Array.isArray(${modelValue}) ? ${modelValue}.some((item) => Object.is(item, ${checkboxValue})) : Boolean(${modelValue}));`);
      return;
    }
    if (inputType === "radio") {
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr("checked", Object.is(${ssrInputValueExpression(context, node, model.modifiers)}, __mikuru_unwrap(${model.expression})));`);
      return;
    }
    emit(context, indent, `__mikuru_html += __mikuru_renderAttr("value", String(__mikuru_unwrap(${model.expression}) ?? ""));`);
    return;
  }

  const selectModel = context.selectModels.at(-1);
  if (selectModel && node.tag === "option") {
    const optionValue = ssrOptionValueExpression(context, node, selectModel.modifiers);
    if (selectModel.multiple) {
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr("selected", (__mikuru_unwrap(${selectModel.expression}) ?? []).some((item) => Object.is(item, ${optionValue})));`);
    } else {
      emit(context, indent, `__mikuru_html += __mikuru_renderAttr("selected", Object.is(${optionValue}, __mikuru_unwrap(${selectModel.expression})));`);
    }
  }
}

function emitTextareaModelContent(context: SsrGenerateContext, node: ElementNode, indent: number): void {
  const model = getElementModel(context, node);
  if (!model) {
    return;
  }
  emit(context, indent, `__mikuru_html += __mikuru_escape(__mikuru_unwrap(${model.expression}) ?? "");`);
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

function isWhitespaceText(node: TemplateNode | undefined): boolean {
  return node?.type === "text" && node.parts.every((part) => part.type === "static" && part.value.trim() === "");
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
    || attr.name.startsWith("v-model.")
    || attr.name.startsWith("v-model:")
    || attr.name === "ref"
    || attr.name === "key"
    || attr.name.startsWith("@")
    || attr.name.startsWith("v-on:")
    || attr.name.startsWith("#")
    || attr.name.startsWith("v-slot");
}

function shouldSkipModelOwnedAttr(context: SsrGenerateContext, node: ElementNode, attr: TemplateAttribute): boolean {
  const dynamicName = getDynamicAttrName(attr.name);
  const attrName = dynamicName ?? attr.name;
  const model = getElementModel(context, node);

  if (model) {
    const inputType = getStaticAttrValue(node, "type")?.toLowerCase();
    if (node.tag === "input" && (inputType === "checkbox" || inputType === "radio")) {
      return attrName === "checked";
    }
    if (node.tag === "input") {
      return attrName === "value";
    }
    if (node.tag === "textarea") {
      return attrName === "value";
    }
  }

  return node.tag === "option" && context.selectModels.length > 0 && attrName === "selected";
}

function parseModelDirective(name: string): { argument?: string; modifiers: string[] } | undefined {
  if (name === "v-model") return { modifiers: [] };
  if (name.startsWith("v-model.")) return { modifiers: name.slice("v-model.".length).split(".").filter(Boolean) };
  if (!name.startsWith("v-model:")) return undefined;
  const [argument = "", ...modifiers] = name.slice("v-model:".length).split(".");
  return { argument, modifiers };
}

function ssrInputValueExpression(context: SsrGenerateContext, node: ElementNode, modifiers: string[]): string {
  return applyModelValueModifiers(ssrElementValueExpression(context, node, "on"), modifiers);
}

function ssrOptionValueExpression(context: SsrGenerateContext, node: ElementNode, modifiers: string[]): string {
  return applyModelValueModifiers(ssrElementValueExpression(context, node, staticOptionText(node) ?? ""), modifiers);
}

function ssrElementValueExpression(context: SsrGenerateContext, node: ElementNode, fallback: string): string {
  const boundValue = getBoundAttr(node, "value");
  if (boundValue && boundValue.value !== true) {
    return `__mikuru_unwrap(${compileSsrExpression(context, boundValue.value, boundValue.name)})`;
  }

  return quote(getStaticAttrValue(node, "value") ?? fallback);
}

function applyModelValueModifiers(expression: string, modifiers: string[]): string {
  return modifiers.includes("number") ? `Number(${expression})` : expression;
}

function getBoundAttr(node: ElementNode, name: string): TemplateAttribute | undefined {
  return node.attrs.find((attr) => getDynamicAttrName(attr.name) === name);
}

function staticOptionText(node: ElementNode): string | undefined {
  let value = "";
  for (const child of node.children) {
    if (child.type !== "text") {
      return undefined;
    }
    for (const part of child.parts) {
      if (part.type !== "static") {
        return undefined;
      }
      value += part.value;
    }
  }
  return value;
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

function getSlotTemplate(context: SsrGenerateContext, node: ElementNode): { name: string; nameExpression?: string; scope?: string } | undefined {
  for (const attr of node.attrs) {
    const scope = attr.value === true ? undefined : String(attr.value);

    if (attr.name === "v-slot") {
      return { name: "default", scope };
    }
    if (attr.name.startsWith("#")) {
      return parseSlotTemplateName(context, attr.name.slice(1) || "default", attr, scope);
    }
    if (attr.name.startsWith("v-slot:")) {
      return parseSlotTemplateName(context, attr.name.slice("v-slot:".length) || "default", attr, scope);
    }
  }
  return undefined;
}

function parseSlotTemplateName(
  context: SsrGenerateContext,
  rawName: string,
  attr: TemplateAttribute,
  scope: string | undefined
): { name: string; nameExpression?: string; scope?: string } {
  const name = rawName.trim() || "default";
  const dynamicStart = name.indexOf("[");
  const dynamicEnd = name.lastIndexOf("]");

  if (dynamicStart >= 0 && dynamicEnd > dynamicStart) {
    const expression = name.slice(dynamicStart + 1, dynamicEnd).trim();

    if (!expression) {
      throw createCompileError("Dynamic slot name requires an expression", context.source ?? attr.name, attr.loc?.offset ?? 0, context.filename);
    }

    return {
      name: `[${expression}]`,
      nameExpression: compileSsrExpression(context, expression, attr.name),
      scope
    };
  }

  return { name, scope };
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

function validateErrorBoundaryAttributes(node: ElementNode): void {
  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (name === "fallback" || name === "reset-key") {
      continue;
    }

    throw createCompileError(`Unsupported attribute "${attr.name}" on <ErrorBoundary>. Supported attributes: fallback and reset-key.`, contextSource(node), attr.loc?.offset ?? node.loc?.offset ?? 0);
  }
}

function getErrorBoundaryFallbackAttr(node: ElementNode): TemplateAttribute {
  const attr = node.attrs.find((candidate) => parseBindDirective(candidate.name)?.name === "fallback");
  if (!attr) {
    throw createCompileError("<ErrorBoundary> requires :fallback to resolve to a component object", contextSource(node), node.loc?.offset ?? 0);
  }

  return attr;
}

function validateTransitionAttributes(node: ElementNode): void {
  const supported = new Set([
    "name",
    "appear",
    "mode",
    "enter-from-class",
    "enter-active-class",
    "enter-to-class",
    "leave-from-class",
    "leave-active-class",
    "leave-to-class"
  ]);

  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (supported.has(name)) {
      continue;
    }

    throw createCompileError(`Unsupported attribute "${attr.name}" on <Transition>. Supported attributes: name, appear, mode, and CSS class override attributes.`, contextSource(node), attr.loc?.offset ?? node.loc?.offset ?? 0);
  }
}

function validateTransitionGroupAttributes(node: ElementNode): void {
  const supported = new Set([
    "name",
    "tag",
    "enter-from-class",
    "enter-active-class",
    "enter-to-class",
    "leave-from-class",
    "leave-active-class",
    "leave-to-class",
    "move-class"
  ]);

  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (supported.has(name)) {
      continue;
    }

    throw createCompileError(`Unsupported attribute "${attr.name}" on <TransitionGroup>. Supported attributes: name, tag, and CSS class override attributes.`, contextSource(node), attr.loc?.offset ?? node.loc?.offset ?? 0);
  }
}

function getAsyncBoundaryChildren(node: ElementNode): TemplateNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length === 0) {
    throw createCompileError("<AsyncBoundary> requires at least one child", contextSource(node), node.loc?.offset ?? 0);
  }

  return node.children;
}

function getTransitionChildren(node: ElementNode): ElementNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length === 0 || meaningful.some((child) => child.type !== "element")) {
    throw createCompileError("<Transition> requires exactly one element/component child or one v-if chain", contextSource(node), node.loc?.offset ?? 0);
  }

  const children = meaningful as ElementNode[];

  if (children.length === 1) {
    return children;
  }

  if (!getAttr(children[0], "v-if")) {
    throw createCompileError("<Transition> requires exactly one element/component child or one v-if chain", contextSource(node), node.loc?.offset ?? 0);
  }

  for (const child of children.slice(1)) {
    if (!getAttr(child, "v-else-if") && !getAttr(child, "v-else")) {
      throw createCompileError("<Transition> only accepts multiple children when they form a v-if chain", contextSource(child), child.loc?.offset ?? node.loc?.offset ?? 0);
    }
  }

  return children;
}

function getTransitionBranches(children: ElementNode[]): IfBranch[] {
  return children.map((child, index) => {
    if (index === 0) {
      return { node: child, condition: getAttrValue(child, "v-if"), directive: "v-if" };
    }

    if (getAttr(child, "v-else-if")) {
      return { node: child, condition: getAttrValue(child, "v-else-if"), directive: "v-else-if" };
    }

    return { node: child, directive: "v-else" };
  });
}

function getTransitionGroupChild(node: ElementNode): ElementNode {
  const child = getSingleElementChild(node, "<TransitionGroup>");

  if (!getAttr(child, "v-for") || !getKeyExpression(child)) {
    throw createCompileError("<TransitionGroup> requires a single keyed v-for child in v1", contextSource(child), child.loc?.offset ?? node.loc?.offset ?? 0);
  }

  return child;
}

function getTransitionGroupTagExpression(context: SsrGenerateContext, node: ElementNode): string {
  const dynamicTag = node.attrs.find((attr) => parseBindDirective(attr.name)?.name === "tag");
  if (dynamicTag) {
    return compileSsrExpression(context, requireAttrValue(dynamicTag), dynamicTag.name);
  }

  return quote(getStaticAttrValue(node, "tag") ?? "span");
}

function getKeyExpression(node: ElementNode): string | undefined {
  return getStaticAttrValue(node, ":key") ?? getStaticAttrValue(node, "v-bind:key");
}

function withoutAttrs(node: ElementNode, names: string[]): ElementNode {
  return {
    ...node,
    attrs: node.attrs.filter((attr) => !names.includes(attr.name))
  };
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

function hasElementModel(node: ElementNode): boolean {
  return node.attrs.some((attr) => Boolean(parseModelDirective(attr.name)));
}

function getElementModel(context: SsrGenerateContext, node: ElementNode): { expression: string; modifiers: string[] } | undefined {
  const attr = node.attrs.find((candidate) => Boolean(parseModelDirective(candidate.name)));
  const model = attr ? parseModelDirective(attr.name) : undefined;
  if (!attr || !model || model.argument || attr.value === true) {
    return undefined;
  }

  return {
    expression: compileSsrExpression(context, attr.value, attr.name),
    modifiers: model.modifiers
  };
}

function createSsrSelectModel(context: SsrGenerateContext, node: ElementNode): SsrSelectModel | undefined {
  if (node.tag !== "select") {
    return undefined;
  }

  const model = getElementModel(context, node);
  if (!model) {
    return undefined;
  }

  return {
    ...model,
    multiple: hasStaticBooleanAttr(node, "multiple")
  };
}

function getStaticAttrValue(node: ElementNode, name: string): string | undefined {
  const attr = getAttr(node, name);
  return attr && attr.value !== true ? String(attr.value) : undefined;
}

function hasStaticBooleanAttr(node: ElementNode, name: string): boolean {
  return node.attrs.some((attr) => attr.name === name && attr.value === true);
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
