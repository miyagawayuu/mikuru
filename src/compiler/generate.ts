import { parse } from "acorn";

import { createCompileError } from "./errors.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode, TextPart } from "./types.js";
import type { SourceLocation } from "./errors.js";
import type { ExpressionLocationContext } from "./parseExpression.js";
import { compileTemplateExpression, parseForExpression, validateAssignableExpression, validateTemplateExpression } from "./parseExpression.js";

type GenerateContext = {
  lines: string[];
  index: number;
  source?: string;
  filename?: string;
  scopeAttr?: string;
  templateRefMode?: "single" | "array";
};

type ScriptParts = {
  imports: string[];
  runtimeImports: string[];
  body: string;
  inheritAttrs: boolean;
  usesPropsAlias: boolean;
  usesAttrsAlias: boolean;
  usesEmitAlias: boolean;
};

type ScriptNode = {
  type: string;
  start: number;
  end: number;
  source?: { value?: string };
  kind?: string;
  body?: ScriptNode[];
  declarations?: ScriptNode[];
  id?: ScriptNode;
  init?: ScriptNode | null;
  callee?: ScriptNode;
  arguments?: ScriptNode[];
  name?: string;
  properties?: ScriptNode[];
  key?: ScriptNode;
  value?: ScriptNode | string | number | boolean | null;
  computed?: boolean;
  shorthand?: boolean;
  left?: ScriptNode;
  right?: ScriptNode;
  argument?: ScriptNode;
  expression?: ScriptNode;
  elements?: Array<ScriptNode | null>;
  specifiers?: ScriptNode[];
  imported?: ScriptNode;
  local?: ScriptNode;
};

type ScriptEdit = {
  start: number;
  end: number;
  replacement: string;
};

type EmitsDeclaration = {
  localName: string;
  events?: Set<string>;
};

type IfBranch = {
  node: ElementNode;
  condition?: string;
  directive: "v-if" | "v-else-if" | "v-else";
};

type EventDirective = {
  name: string;
  modifiers: string[];
};

type SlotDefinition = {
  name: string;
  nameExpression?: string;
  children: TemplateNode[];
  scope: string | true;
  loc?: SourceLocation;
  scopeLoc?: SourceLocation;
};

type SlotTemplateDirective = {
  name: string;
  nameExpression?: string;
  scope: string | true;
  loc?: SourceLocation;
  scopeLoc?: SourceLocation;
};

type SlotScopeBinding =
  | { kind: "props"; alias: string }
  | { kind: "property"; source: string; alias: string; defaultValue?: string };

export function generate(descriptor: SfcDescriptor, root: ElementNode): string {
  const context: GenerateContext = {
    lines: [],
    index: 0,
    source: descriptor.source,
    filename: descriptor.filename,
    scopeAttr: descriptor.styleScoped ? createScopeAttr(descriptor) : undefined
  };
  const script = normalizeScript(descriptor);

  for (const importLine of script.imports) {
    emit(context, 0, importLine);
  }

  const runtimeImports = mergeRuntimeImports(["computed", "effect", "ref", "setAttribute", "unwrap"], script.runtimeImports);
  emit(context, 0, `import { ${runtimeImports.join(", ")} } from "mikuru/runtime";`);
  emit(context, 0, "");
  emit(context, 0, "export function mount(target, props = {}) {");
  emit(context, 1, "const __mikuru_cleanup = [];");
  emit(context, 1, "const __mikuru_afterUnmount = [];");
  emit(context, 1, "const __mikuru_mounted = [];");
  emit(context, 1, "const __mikuru_context = { parent: props.__mikuru_context, provides: new Map() };");
  emit(context, 1, "const __mikuru_runCleanup = (cleanups) => {");
  emit(context, 2, "for (const cleanup of cleanups.splice(0).reverse()) {");
  emit(context, 3, "cleanup();");
  emit(context, 2, "}");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_setRef = (target, value, multiple = false) => {");
  emit(context, 2, "if (typeof target === \"function\") {");
  emit(context, 3, "target(value);");
  emit(context, 3, "return () => target(null);");
  emit(context, 2, "}");
  emit(context, 2, "if (!target || typeof target !== \"object\" || !(\"value\" in target)) {");
  emit(context, 3, "return () => {};");
  emit(context, 2, "}");
  emit(context, 2, "if (multiple) {");
  emit(context, 3, "const list = Array.isArray(target.value) ? target.value : [];");
  emit(context, 3, "if (target.value !== list) { target.value = list; }");
  emit(context, 3, "list.push(value);");
  emit(context, 3, "return () => { const index = list.indexOf(value); if (index >= 0) { list.splice(index, 1); } };");
  emit(context, 2, "}");
  emit(context, 2, "target.value = value;");
  emit(context, 2, "return () => { if (target.value === value) { target.value = null; } };");
  emit(context, 1, "};");
  emit(context, 1, "// expose a lightweight registrar for runtime lifecycle and provide/inject helpers");
  emit(context, 1, "const __mikuru_previousRegistrar = globalThis.__mikuru_currentRegistrar;");
  emit(context, 1, "globalThis.__mikuru_currentRegistrar = {");
  emit(context, 2, "registerMounted: (fn) => __mikuru_mounted.push(fn),");
  emit(context, 2, "registerBeforeUnmount: (fn) => __mikuru_cleanup.push(fn),");
  emit(context, 2, "registerUnmounted: (fn) => __mikuru_afterUnmount.push(fn),");
  emit(context, 2, "provide: (key, value) => __mikuru_context.provides.set(key, value),");
  emit(context, 2, "inject: (key) => {");
  emit(context, 3, "for (let context = __mikuru_context; context; context = context.parent) {");
  emit(context, 4, "if (context.provides.has(key)) {");
  emit(context, 5, "return { found: true, value: context.provides.get(key) };");
  emit(context, 4, "}");
  emit(context, 3, "}");
  emit(context, 3, "return { found: false };");
  emit(context, 2, "},");
  emit(context, 2, "registerEffect: (fn) => Promise.resolve().then(fn)");
  emit(context, 1, "};");
  emit(context, 1, "");

  if (descriptor.style?.trim()) {
    emitStyleInjection(context, descriptor, 1);
    emit(context, 1, "");
  }

  if (script.body.trim()) {
    if (script.usesPropsAlias) {
      emit(context, 1, "const __mikuru_props = props;");
    }

    if (script.usesAttrsAlias) {
      emit(context, 1, "const __mikuru_attrs = props.__mikuru_attrs ?? {};");
    }

    if (script.usesEmitAlias) {
      emit(context, 1, "const __mikuru_emit = (name, ...args) => {");
      emit(context, 2, "const handlerName = \"on\" + String(name).split(/[-:]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(\"\");");
      emit(context, 2, "const handler = props[handlerName];");
      emit(context, 2, "if (handler) {");
      emit(context, 3, "handler(...args);");
      emit(context, 2, "}");
      emit(context, 1, "};");
    }

    emitBlock(context, 1, script.body);
    emit(context, 1, "");
  }

  const rootVar = generateNode(context, root, "target", "__mikuru_cleanup", 1);
  emit(context, 1, "// call mounted callbacks registered during setup and remove registrar");
  emit(context, 1, "for (const cb of __mikuru_mounted.splice(0)) { try { cb(); } catch (e) { setTimeout(() => { throw e; }); } }");
  emit(context, 1, "if (__mikuru_previousRegistrar === undefined) { delete globalThis.__mikuru_currentRegistrar; } else { globalThis.__mikuru_currentRegistrar = __mikuru_previousRegistrar; }");
  emit(context, 1, "return {");
  emit(context, 2, `element: ${rootVar},`);
  emit(context, 2, "unmount() {");
  emit(context, 3, "__mikuru_runCleanup(__mikuru_cleanup);");
  emit(context, 3, "for (const cb of __mikuru_afterUnmount.splice(0).reverse()) { try { cb(); } catch (e) { setTimeout(() => { throw e; }); } }");
  emit(context, 3, `${rootVar}.remove();`);
  emit(context, 2, "}");
  emit(context, 1, "};");
  emit(context, 0, "}");
  emit(context, 0, "");
  emit(context, 0, `const __mikuru_component = { mount${script.inheritAttrs ? "" : ", inheritAttrs: false"} };`);
  emit(context, 0, "export default __mikuru_component;");

  return `${context.lines.join("\n")}\n`;
}

function emitStyleInjection(context: GenerateContext, descriptor: SfcDescriptor, indent: number): void {
  const styleId = `mikuru-${hash(`${descriptor.filename ?? ""}\n${descriptor.style ?? ""}`)}`;
  const styleContent =
    descriptor.styleScoped && context.scopeAttr
      ? scopeCssSelectors(descriptor.style?.trim() ?? "", context.scopeAttr)
      : descriptor.style?.trim() ?? "";
  emit(context, indent, `if (!document.querySelector(${quote(`style[data-mikuru-style="${styleId}"]`)})) {`);
  emit(context, indent + 1, "const style = document.createElement(\"style\");");
  emit(context, indent + 1, `style.setAttribute("data-mikuru-style", ${quote(styleId)});`);
  emit(context, indent + 1, `style.textContent = ${quote(styleContent)};`);
  emit(context, indent + 1, "document.head.appendChild(style);");
  emit(context, indent, "}");
}

function generateNode(
  context: GenerateContext,
  node: TemplateNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  if (node.type === "text") {
    return generateText(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  const forExpression = getStringAttr(node, "v-for");

  if (forExpression) {
    return generateFor(context, node, parentVar, cleanupVar, indent, forExpression, beforeVar);
  }

  const ifExpression = getStringAttr(node, "v-if");

  if (ifExpression) {
    return generateIfChain(context, [{ node, condition: ifExpression, directive: "v-if" }], parentVar, cleanupVar, indent, beforeVar);
  }

  const orphanElseAttr = node.attrs.find((attr) => attr.name === "v-else-if" || attr.name === "v-else");

  if (orphanElseAttr) {
    throwTemplateError(`${orphanElseAttr.name} must follow v-if or v-else-if`, context, orphanElseAttr.loc);
  }

  if (isComponentTag(node.tag)) {
    return generateComponent(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "slot") {
    return generateSlot(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  return generateElement(context, node, parentVar, cleanupVar, indent, beforeVar);
}

function generateSlot(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  const slotCleanupVar = nextVar(context, "slotCleanup");
  const slotCleanupResultVar = nextVar(context, "slotCleanup");
  const slotFnVar = nextVar(context, "slot");
  const slotPropsVar = nextVar(context, "slotProps");
  const slotName = getSlotOutletNameExpression(node, context);

  if (slotName.dynamic) {
    const startVar = nextVar(context, "slotStart");
    const endVar = nextVar(context, "slotEnd");
    const slotFragmentVar = nextVar(context, "slot");
    const slotNameVar = nextVar(context, "slotName");
    const stopVar = nextVar(context, "stop");
    emit(context, indent, `const ${startVar} = document.createComment("slot");`);
    emit(context, indent, `const ${endVar} = document.createComment("/slot");`);
    appendNode(context, parentVar, startVar, indent, beforeVar);
    appendNode(context, parentVar, endVar, indent, beforeVar);
    emit(context, indent, `const ${slotCleanupVar} = [];`);
    emit(context, indent, `const ${stopVar} = effect(() => {`);
    emit(context, indent + 1, `__mikuru_runCleanup(${slotCleanupVar});`);
    emitRemoveBetween(context, indent + 1, startVar, endVar);
    emit(context, indent + 1, `const ${slotNameVar} = String(unwrap(${slotName.expression}) ?? "default");`);
    emit(context, indent + 1, `const ${slotFnVar} = ${slotNameVar} === "default" ? props.slots?.default ?? props.children : props.slots?.[${slotNameVar}];`);
    emitSlotOutletProps(context, node, slotPropsVar, indent + 1);
    emit(context, indent + 1, `const ${slotFragmentVar} = document.createDocumentFragment();`);
    emit(context, indent + 1, `if (${slotFnVar}) {`);
    emit(context, indent + 2, `const ${slotCleanupResultVar} = ${slotFnVar}(${slotFragmentVar}, ${slotPropsVar});`);
    emit(context, indent + 2, `if (${slotCleanupResultVar}) {`);
    emit(context, indent + 3, `${slotCleanupVar}.push(${slotCleanupResultVar});`);
    emit(context, indent + 2, "}");
    emit(context, indent + 1, "} else {");
    generateChildren(context, node.children, slotFragmentVar, slotCleanupVar, indent + 2);
    emit(context, indent + 1, "}");
    appendNode(context, parentVar, slotFragmentVar, indent + 1, endVar);
    emit(context, indent, "});");
    emit(context, indent, `${cleanupVar}.push(() => {`);
    emit(context, indent + 1, `${stopVar}();`);
    emit(context, indent + 1, `__mikuru_runCleanup(${slotCleanupVar});`);
    emit(context, indent, "});");
    return startVar;
  }

  const slotVar = nextVar(context, "slot");
  emit(context, indent, `const ${slotFnVar} = ${slotName.name === "default" ? "props.slots?.default ?? props.children" : `props.slots?.[${quote(slotName.name)}]`};`);
  emitSlotOutletProps(context, node, slotPropsVar, indent);
  emit(context, indent, `const ${slotVar} = document.createDocumentFragment();`);
  emit(context, indent, `const ${slotCleanupVar} = [];`);
  emit(context, indent, `if (${slotFnVar}) {`);
  emit(context, indent + 1, `const ${slotCleanupResultVar} = ${slotFnVar}(${slotVar}, ${slotPropsVar});`);
  emit(context, indent + 1, `if (${slotCleanupResultVar}) {`);
  emit(context, indent + 2, `${slotCleanupVar}.push(${slotCleanupResultVar});`);
  emit(context, indent + 1, "}");
  emit(context, indent, "} else {");
  generateChildren(context, node.children, slotVar, slotCleanupVar, indent + 1);
  emit(context, indent, "}");
  emit(context, indent, `${cleanupVar}.push(() => __mikuru_runCleanup(${slotCleanupVar}));`);
  appendNode(context, parentVar, slotVar, indent, beforeVar);
  return slotVar;
}

function generateComponent(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  const fragmentVar = nextVar(context, "fragment");
  const attrsVar = nextVar(context, "attrs");
  const propsVar = nextVar(context, "props");
  const componentVar = nextVar(context, "component");
  emit(context, indent, `const ${fragmentVar} = document.createDocumentFragment();`);
  emitComponentAttrs(context, node, attrsVar, indent);
  emitComponentProps(context, node, propsVar, attrsVar, indent);
  emit(context, indent, `const ${componentVar} = ${node.tag}.mount(${fragmentVar}, ${propsVar});`);
  if (context.scopeAttr) {
    emit(context, indent, `if (${componentVar}.element?.nodeType === 1) {`);
    emit(context, indent + 1, `${componentVar}.element.setAttribute(${quote(context.scopeAttr)}, "");`);
    emit(context, indent, "}");
  }
  emit(context, indent, `if (${node.tag}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context, node, componentVar, cleanupVar, indent + 1);
  emit(context, indent, "}");
  emitComponentShow(context, node, componentVar, cleanupVar, indent);
  emit(context, indent, `${cleanupVar}.push(() => ${componentVar}.unmount());`);
  emitTemplateRef(context, node, componentVar, cleanupVar, indent);
  appendNode(context, parentVar, fragmentVar, indent, beforeVar);
  return `${componentVar}.element`;
}

function emitComponentShow(
  context: GenerateContext,
  node: ElementNode,
  componentVar: string,
  cleanupVar: string,
  indent: number
): void {
  const showAttr = node.attrs.find((attr) => attr.name === "v-show");

  if (!showAttr) {
    return;
  }

  const expression = compileTemplateExpression(requireAttrValue(showAttr), showAttr.name, toExpressionContext(context, showAttr.valueLoc));
  const elementVar = nextVar(context, "componentEl");
  const baseDisplayVar = nextVar(context, "baseDisplay");
  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${elementVar} = ${componentVar}.element;`);
  emit(context, indent, `if (${elementVar}?.nodeType === 1) {`);
  emit(context, indent + 1, `const ${baseDisplayVar} = ${elementVar}.style.display;`);
  emit(context, indent + 1, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 2, `${elementVar}.style.display = unwrap(${expression}) ? ${baseDisplayVar} : "none";`);
  emit(context, indent + 1, "});");
  emit(context, indent + 1, `${cleanupVar}.push(${stopVar});`);
  emit(context, indent, "}");
}

function emitComponentAttrs(context: GenerateContext, node: ElementNode, attrsVar: string, indent: number): void {
  const objectBindExpressions = node.attrs
    .filter((attr) => isObjectBindAttr(attr))
    .map((attr) => compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc)));
  const classParts = componentFallthroughExpressions(context, node, "class", objectBindExpressions);
  const styleParts = componentFallthroughExpressions(context, node, "style", objectBindExpressions);
  const directAttrs = componentDirectAttributeFallthroughs(context, node);
  const baseVar = objectBindExpressions.length > 0 ? nextVar(context, "attrsBase") : attrsVar;

  emit(context, indent, `const ${baseVar} = {`);

  if (classParts.length > 0) {
    emit(context, indent + 1, `get class() { return [${classParts.join(", ")}]; },`);
  }

  if (styleParts.length > 0) {
    emit(context, indent + 1, `get style() { return [${styleParts.join(", ")}]; },`);
  }

  for (const attr of directAttrs) {
    if (attr.dynamic) {
      emit(context, indent + 1, `get ${quotePropertyName(attr.name)}() { return unwrap(${attr.expression}); },`);
    } else {
      emit(context, indent + 1, `${quotePropertyName(attr.name)}: ${attr.expression},`);
    }
  }

  emit(context, indent, "};");

  if (objectBindExpressions.length > 0) {
    emitComponentAttrsProxy(context, attrsVar, baseVar, objectBindExpressions, indent);
  }
}

function emitComponentAttrsProxy(
  context: GenerateContext,
  attrsVar: string,
  baseVar: string,
  objectBindExpressions: string[],
  indent: number
): void {
  const keyVar = nextVar(context, "key");
  const sourceVar = nextVar(context, "source");
  const keysVar = nextVar(context, "keys");
  const descriptorVar = nextVar(context, "descriptor");
  emit(context, indent, `const ${attrsVar} = new Proxy(${baseVar}, {`);
  emit(context, indent + 1, `get(target, ${keyVar}) {`);
  emit(context, indent + 2, `if (typeof ${keyVar} === "symbol" || ${keyVar} in target) {`);
  emit(context, indent + 3, `return target[${keyVar}];`);
  emit(context, indent + 2, "}");

  for (const expression of objectBindExpressions) {
    emit(context, indent + 2, `{`);
    emit(context, indent + 3, `const ${sourceVar} = unwrap(${expression}) ?? {};`);
    emit(context, indent + 3, `if (${sourceVar} && typeof ${sourceVar} === "object" && ${keyVar} in ${sourceVar} && (${keyVar} === "class" || ${keyVar} === "style" || ${componentFallthroughAttributeNameExpression(keyVar)})) {`);
    emit(context, indent + 4, `return unwrap(${sourceVar}[${keyVar}]);`);
    emit(context, indent + 3, "}");
    emit(context, indent + 2, `}`);
  }

  emit(context, indent + 2, "return undefined;");
  emit(context, indent + 1, "},");
  emit(context, indent + 1, "ownKeys(target) {");
  emit(context, indent + 2, `const ${keysVar} = new Set(Reflect.ownKeys(target));`);

  for (const expression of objectBindExpressions) {
    emit(context, indent + 2, `{`);
    emit(context, indent + 3, `const ${sourceVar} = unwrap(${expression}) ?? {};`);
    emit(context, indent + 3, `if (${sourceVar} && typeof ${sourceVar} === "object") {`);
    emit(context, indent + 4, `for (const ${keyVar} of Object.keys(${sourceVar})) {`);
    emit(context, indent + 5, `if (${keyVar} === "class" || ${keyVar} === "style" || ${componentFallthroughAttributeNameExpression(keyVar)}) {`);
    emit(context, indent + 6, `${keysVar}.add(${keyVar});`);
    emit(context, indent + 5, "}");
    emit(context, indent + 4, "}");
    emit(context, indent + 3, "}");
    emit(context, indent + 2, `}`);
  }

  emit(context, indent + 2, `return Array.from(${keysVar});`);
  emit(context, indent + 1, "},");
  emit(context, indent + 1, `getOwnPropertyDescriptor(target, ${keyVar}) {`);
  emit(context, indent + 2, `const ${descriptorVar} = Reflect.getOwnPropertyDescriptor(target, ${keyVar});`);
  emit(context, indent + 2, `if (${descriptorVar}) { return ${descriptorVar}; }`);
  emit(context, indent + 2, `if (typeof ${keyVar} === "string" && this.get(target, ${keyVar}) !== undefined) {`);
  emit(context, indent + 3, "return { enumerable: true, configurable: true };");
  emit(context, indent + 2, "}");
  emit(context, indent + 2, "return undefined;");
  emit(context, indent + 1, "}");
  emit(context, indent, "});");
}

function emitComponentFallthrough(
  context: GenerateContext,
  node: ElementNode,
  componentVar: string,
  cleanupVar: string,
  indent: number
): void {
  const objectBindExpressions = node.attrs
    .filter((attr) => isObjectBindAttr(attr))
    .map((attr) => compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc)));
  const classParts = componentFallthroughExpressions(context, node, "class", objectBindExpressions);
  const styleParts = componentFallthroughExpressions(context, node, "style", objectBindExpressions);
  const directAttrs = componentDirectAttributeFallthroughs(context, node);

  if (classParts.length === 0 && styleParts.length === 0 && directAttrs.length === 0 && objectBindExpressions.length === 0) {
    return;
  }

  const elementVar = nextVar(context, "componentEl");
  emit(context, indent, `const ${elementVar} = ${componentVar}.element;`);
  emit(context, indent, `if (${elementVar}?.nodeType === 1) {`);

  if (classParts.length > 0) {
    emitComponentFallthroughAttribute(context, elementVar, cleanupVar, "class", classParts, indent + 1);
  }

  if (styleParts.length > 0) {
    emitComponentFallthroughAttribute(context, elementVar, cleanupVar, "style", styleParts, indent + 1);
  }

  for (const attr of directAttrs) {
    if (attr.dynamic) {
      const stopVar = nextVar(context, "stop");
      emit(context, indent + 1, `const ${stopVar} = effect(() => {`);
      emit(context, indent + 2, `setAttribute(${elementVar}, ${quote(attr.name)}, unwrap(${attr.expression}));`);
      emit(context, indent + 1, "});");
      emit(context, indent + 1, `${cleanupVar}.push(${stopVar});`);
    } else {
      emit(context, indent + 1, `setAttribute(${elementVar}, ${quote(attr.name)}, ${attr.expression});`);
    }
  }

  for (const expression of objectBindExpressions) {
    emitComponentObjectAttributeFallthrough(context, elementVar, cleanupVar, expression, indent + 1);
  }

  emit(context, indent, "}");
}

function emitComponentFallthroughAttribute(
  context: GenerateContext,
  elementVar: string,
  cleanupVar: string,
  attributeName: "class" | "style",
  parts: string[],
  indent: number
): void {
  const baseVar = nextVar(context, `base${attributeName === "class" ? "Class" : "Style"}`);
  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${baseVar} = ${elementVar}.getAttribute(${quote(attributeName)});`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `setAttribute(${elementVar}, ${quote(attributeName)}, [${baseVar}, ${parts.join(", ")}]);`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(${stopVar});`);
}

function componentFallthroughExpressions(
  context: GenerateContext,
  node: ElementNode,
  attributeName: "class" | "style",
  objectBindExpressions: string[]
): string[] {
  return [
    ...node.attrs.flatMap((attr) => componentDirectFallthroughExpression(context, attr, attributeName)),
    ...objectBindExpressions.map((expression) => objectBindFallthroughExpression(expression, attributeName))
  ];
}

function componentDirectFallthroughExpression(
  context: GenerateContext,
  attr: TemplateAttribute,
  attributeName: "class" | "style"
): string[] {
  if (attr.name === attributeName) {
    return [quote(attr.value === true ? "" : attr.value)];
  }

  if (getBindingName(attr.name) === attributeName) {
    return [compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc))];
  }

  return [];
}

function objectBindFallthroughExpression(expression: string, attributeName: "class" | "style"): string {
  const key = quote(attributeName);
  return `(() => { const source = unwrap(${expression}) ?? {}; return source && typeof source === "object" && ${key} in source ? unwrap(source[${key}]) : null; })()`;
}

type ComponentDirectAttributeFallthrough = {
  dynamic: boolean;
  expression: string;
  name: string;
};

function componentDirectAttributeFallthroughs(
  context: GenerateContext,
  node: ElementNode
): ComponentDirectAttributeFallthrough[] {
  return node.attrs.flatMap((attr): ComponentDirectAttributeFallthrough[] => {
    if (attr.name === "class" || attr.name === "style") {
      return [];
    }

    if (!isDirectiveAttr(attr) && isComponentFallthroughAttributeName(attr.name)) {
      return [
        {
          dynamic: false,
          expression: quote(attr.value === true ? true : attr.value),
          name: attr.name
        }
      ];
    }

    const bindingName = getBindingName(attr.name);

    if (bindingName && bindingName !== "class" && bindingName !== "style" && isComponentFallthroughAttributeName(bindingName)) {
      return [
        {
          dynamic: true,
          expression: compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc)),
          name: bindingName
        }
      ];
    }

    return [];
  });
}

function emitComponentObjectAttributeFallthrough(
  context: GenerateContext,
  elementVar: string,
  cleanupVar: string,
  expression: string,
  indent: number
): void {
  const previousVar = nextVar(context, "fallthroughKeys");
  const stopVar = nextVar(context, "stop");
  const sourceVar = nextVar(context, "source");
  const nextVarName = nextVar(context, "nextKeys");
  const keyVar = nextVar(context, "key");
  const valueVar = nextVar(context, "value");
  const staleKeyVar = nextVar(context, "staleKey");
  emit(context, indent, `let ${previousVar} = new Set();`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${sourceVar} = unwrap(${expression}) ?? {};`);
  emit(context, indent + 1, `const ${nextVarName} = new Set();`);
  emit(context, indent + 1, `if (${sourceVar} && typeof ${sourceVar} === "object") {`);
  emit(context, indent + 2, `for (const [${keyVar}, ${valueVar}] of Object.entries(${sourceVar})) {`);
  emit(context, indent + 3, `if (${keyVar} === "class" || ${keyVar} === "style" || !${componentFallthroughAttributeNameExpression(keyVar)}) { continue; }`);
  emit(context, indent + 3, `${nextVarName}.add(${keyVar});`);
  emit(context, indent + 3, `setAttribute(${elementVar}, ${keyVar}, unwrap(${valueVar}));`);
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `for (const ${staleKeyVar} of ${previousVar}) {`);
  emit(context, indent + 2, `if (!${nextVarName}.has(${staleKeyVar})) {`);
  emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, null);`);
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${previousVar} = ${nextVarName};`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(${stopVar});`);
}

function isComponentFallthroughAttributeName(name: string): boolean {
  return (
    name === "id" ||
    name === "title" ||
    name === "role" ||
    name === "tabindex" ||
    name === "lang" ||
    name === "dir" ||
    name === "hidden" ||
    name.startsWith("aria-") ||
    name.startsWith("data-")
  );
}

function componentFallthroughAttributeNameExpression(keyExpression: string): string {
  return `(${keyExpression} === "id" || ${keyExpression} === "title" || ${keyExpression} === "role" || ${keyExpression} === "tabindex" || ${keyExpression} === "lang" || ${keyExpression} === "dir" || ${keyExpression} === "hidden" || ${keyExpression}.startsWith("aria-") || ${keyExpression}.startsWith("data-"))`;
}

function generateElement(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  const slotDirectiveAttr = node.attrs.find((attr) => isSlotDirectiveAttr(attr));

  if (slotDirectiveAttr) {
    throwTemplateError("v-slot must be used on a <template> child in Mikuru", context, slotDirectiveAttr.loc);
  }

  validateAttributes(node);

  const elementVar = nextVar(context, "el");
  emit(context, indent, `const ${elementVar} = document.createElement(${quote(node.tag)});`);

  if (context.scopeAttr) {
    emit(context, indent, `${elementVar}.setAttribute(${quote(context.scopeAttr)}, "");`);
  }

  for (const attr of node.attrs) {
    if (attr.name === "ref" || getBindingName(attr.name) === "ref") {
      continue;
    }

    if (isDirectiveAttr(attr)) {
      continue;
    }

    emit(context, indent, `setAttribute(${elementVar}, ${quote(attr.name)}, ${quote(attr.value === true ? "" : attr.value)});`);
  }

  emitTemplateRef(context, node, elementVar, cleanupVar, indent);

  generateChildren(context, node.children, elementVar, cleanupVar, indent);

  for (const attr of node.attrs) {
    const modelDirective = parseModelDirective(attr.name);

    if (modelDirective) {
      validateModelModifiers(modelDirective, attr, context);
      const expression = validateAssignableExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
      const stopVar = nextVar(context, "stop");
      const handlerVar = nextVar(context, "handler");
      const inputType = getStaticAttrValue(node, "type")?.toLowerCase();
      const multiple = node.tag === "select" && hasStaticBooleanAttr(node, "multiple");
      const modelMode =
        node.tag === "input" && inputType === "checkbox"
          ? "checkbox"
          : node.tag === "input" && inputType === "radio"
            ? "radio"
            : node.tag === "select" && multiple
              ? "select-multiple"
              : node.tag === "select"
                ? "select"
                : "text";
      const eventName = modelMode === "text" && !modelDirective.modifiers.includes("lazy") ? "input" : "change";
      const propertyName = modelMode === "checkbox" || modelMode === "radio" ? "checked" : "value";
      const renderedValue =
        modelMode === "checkbox"
          ? `Boolean(unwrap(${expression}))`
          : modelMode === "radio"
            ? `(${modelDirective.modifiers.includes("number") ? `Number(${elementVar}.getAttribute("value") ?? "on")` : `(${elementVar}.getAttribute("value") ?? "on")`} === unwrap(${expression}))`
            : modelMode === "select-multiple"
              ? `Array.from(${elementVar}.options).forEach((option) => { option.selected = (unwrap(${expression}) ?? []).map(String).includes(option.getAttribute("value") ?? option.textContent ?? ""); })`
              : `String(unwrap(${expression}) ?? "")`;
      const assignedValue = modelAssignedValue(modelMode, modelDirective.modifiers);

      emit(context, indent, `const ${stopVar} = effect(() => {`);
      if (modelMode === "select-multiple") {
        emit(context, indent + 1, renderedValue);
      } else {
        emit(context, indent + 1, `if (${elementVar}.${propertyName} !== ${renderedValue}) {`);
        emit(context, indent + 2, `${elementVar}.${propertyName} = ${renderedValue};`);
        emit(context, indent + 1, "}");
      }
      emit(context, indent, "});");
      emit(context, indent, `${cleanupVar}.push(${stopVar});`);
      emit(context, indent, `const ${handlerVar} = ($event) => {`);
      emit(context, indent + 1, `${expression}.value = ${assignedValue};`);
      emit(context, indent, "};");
      emit(context, indent, `${elementVar}.addEventListener(${quote(eventName)}, ${handlerVar});`);
      emit(context, indent, `${cleanupVar}.push(() => ${elementVar}.removeEventListener(${quote(eventName)}, ${handlerVar}));`);
      continue;
    }

    if (attr.name === "v-show") {
      const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
      const stopVar = nextVar(context, "stop");
      emit(context, indent, `const ${stopVar} = effect(() => {`);
      emit(context, indent + 1, `${elementVar}.style.display = unwrap(${expression}) ? "" : "none";`);
      emit(context, indent, "});");
      emit(context, indent, `${cleanupVar}.push(${stopVar});`);
      continue;
    }

    if (isObjectBindAttr(attr)) {
      emitObjectBind(context, node, elementVar, attr, cleanupVar, indent);
      continue;
    }

    if (isObjectOnAttr(attr)) {
      emitObjectListeners(context, elementVar, attr, cleanupVar, indent);
      continue;
    }

    const event = parseEventDirective(attr.name);

    if (event) {
      validateEventModifiers(event, attr, context);
      const handler = validateTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
      const handlerVar = nextVar(context, "handler");
      const handlerExpression = eventHandlerExpression(handler, context, attr.valueLoc);

      if (event.modifiers.length) {
        const baseHandlerVar = nextVar(context, "handler");
        emit(context, indent, `const ${baseHandlerVar} = ${handlerExpression};`);
        emit(context, indent, `const ${handlerVar} = ($event) => {`);

        if (event.modifiers.includes("self")) {
          emit(context, indent + 1, `if ($event.target !== ${elementVar}) { return; }`);
        }

        if (event.modifiers.includes("prevent")) {
          emit(context, indent + 1, "$event.preventDefault();");
        }

        if (event.modifiers.includes("stop")) {
          emit(context, indent + 1, "$event.stopPropagation();");
        }

        emit(context, indent + 1, `return ${baseHandlerVar}($event);`);
        emit(context, indent, "};");
      } else {
        emit(context, indent, `const ${handlerVar} = ${handlerExpression};`);
      }

      const eventOptions = eventListenerOptions(event);
      emit(context, indent, `${elementVar}.addEventListener(${quote(event.name)}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
      emit(context, indent, `${cleanupVar}.push(() => ${elementVar}.removeEventListener(${quote(event.name)}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}));`);
      continue;
    }

    const bindingName = getBindingName(attr.name);

    if (bindingName) {
      if (bindingName === "ref") {
        continue;
      }

      const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
      const stopVar = nextVar(context, "stop");
      const valueExpression =
        bindingName === "class" && getStaticAttrValue(node, "class")
          ? `[${quote(getStaticAttrValue(node, "class"))}, ${expression}]`
          : expression;
      emit(context, indent, `const ${stopVar} = effect(() => {`);
      emit(context, indent + 1, `setAttribute(${elementVar}, ${quote(bindingName)}, unwrap(${valueExpression}));`);
      emit(context, indent, "});");
      emit(context, indent, `${cleanupVar}.push(${stopVar});`);
    }
  }

  appendNode(context, parentVar, elementVar, indent, beforeVar);
  return elementVar;
}

function emitTemplateRef(
  context: GenerateContext,
  node: ElementNode,
  valueExpression: string,
  cleanupVar: string,
  indent: number
): void {
  const refAttr = getTemplateRefAttr(node);

  if (!refAttr) {
    return;
  }

  const targetExpression = templateRefTargetExpression(context, refAttr);
  const cleanupRefVar = nextVar(context, "cleanupRef");
  const multiple = context.templateRefMode === "array";
  emit(context, indent, `const ${cleanupRefVar} = __mikuru_setRef(${targetExpression}, ${valueExpression}, ${multiple ? "true" : "false"});`);
  emit(context, indent, `${cleanupVar}.push(${cleanupRefVar});`);
}

function getTemplateRefAttr(node: ElementNode): TemplateAttribute | undefined {
  return node.attrs.find((attr) => attr.name === "ref" || getBindingName(attr.name) === "ref");
}

function templateRefTargetExpression(context: GenerateContext, attr: TemplateAttribute): string {
  if (getBindingName(attr.name) === "ref") {
    return compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
  }

  if (attr.value === true || !attr.value.trim()) {
    throwTemplateError("Template ref requires a ref object name, for example ref=\"inputEl\"", context, attr.loc);
  }

  const name = attr.value.trim();

  if (!isIdentifier(name)) {
    throwTemplateError("Template ref must be a simple identifier that points to a ref object", context, attr.valueLoc ?? attr.loc);
  }

  return name;
}

function generateText(
  context: GenerateContext,
  node: TextNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  const textVar = nextVar(context, "text");
  emit(context, indent, `const ${textVar} = document.createTextNode("");`);

  if (node.parts.some((part) => part.type === "expression")) {
    const stopVar = nextVar(context, "stop");
    emit(context, indent, `const ${stopVar} = effect(() => {`);
    emit(context, indent + 1, `${textVar}.textContent = ${textExpression(node.parts, context)};`);
    emit(context, indent, "});");
    emit(context, indent, `${cleanupVar}.push(${stopVar});`);
  } else {
    emit(context, indent, `${textVar}.textContent = ${quote(node.parts.map((part) => part.value).join(""))};`);
  }

  appendNode(context, parentVar, textVar, indent, beforeVar);
  return textVar;
}

function emitObjectBind(
  context: GenerateContext,
  node: ElementNode,
  elementVar: string,
  attr: TemplateAttribute,
  cleanupVar: string,
  indent: number
): void {
  const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
  const prevKeysVar = nextVar(context, "boundKeys");
  const stopVar = nextVar(context, "stop");
  const attrsVar = nextVar(context, "attrs");
  const nextKeysVar = nextVar(context, "boundKeys");
  const keyVar = nextVar(context, "key");
  const valueVar = nextVar(context, "value");
  const staleKeyVar = nextVar(context, "key");
  const staticClass = getStaticAttrValue(node, "class");
  emit(context, indent, `const ${prevKeysVar} = new Set();`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${attrsVar} = unwrap(${expression}) ?? {};`);
  emit(context, indent + 1, `const ${nextKeysVar} = new Set();`);
  emit(context, indent + 1, `if (${attrsVar} && typeof ${attrsVar} === "object") {`);
  emit(context, indent + 2, `for (const [${keyVar}, ${valueVar}] of Object.entries(${attrsVar})) {`);
  emit(context, indent + 3, `${nextKeysVar}.add(${keyVar});`);
  if (staticClass) {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${keyVar}, ${keyVar} === "class" ? [${quote(staticClass)}, unwrap(${valueVar})] : unwrap(${valueVar}));`);
  } else {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${keyVar}, unwrap(${valueVar}));`);
  }
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `for (const ${staleKeyVar} of ${prevKeysVar}) {`);
  emit(context, indent + 2, `if (!${nextKeysVar}.has(${staleKeyVar})) {`);
  if (staticClass) {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, ${staleKeyVar} === "class" ? ${quote(staticClass)} : null);`);
  } else {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, null);`);
  }
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${prevKeysVar}.clear();`);
  emit(context, indent + 1, `for (const ${keyVar} of ${nextKeysVar}) {`);
  emit(context, indent + 2, `${prevKeysVar}.add(${keyVar});`);
  emit(context, indent + 1, "}");
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(${stopVar});`);
}

function emitObjectListeners(
  context: GenerateContext,
  elementVar: string,
  attr: TemplateAttribute,
  cleanupVar: string,
  indent: number
): void {
  const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
  const listenersVar = nextVar(context, "listeners");
  const stopVar = nextVar(context, "stop");
  const sourceVar = nextVar(context, "listeners");
  const eventVar = nextVar(context, "event");
  const handlerVar = nextVar(context, "handler");
  emit(context, indent, `const ${listenersVar} = new Map();`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `for (const [${eventVar}, ${handlerVar}] of ${listenersVar}) {`);
  emit(context, indent + 2, `${elementVar}.removeEventListener(${eventVar}, ${handlerVar});`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${listenersVar}.clear();`);
  emit(context, indent + 1, `const ${sourceVar} = unwrap(${expression}) ?? {};`);
  emit(context, indent + 1, `if (${sourceVar} && typeof ${sourceVar} === "object") {`);
  emit(context, indent + 2, `for (const [${eventVar}, ${handlerVar}] of Object.entries(${sourceVar})) {`);
  emit(context, indent + 3, `if (typeof ${handlerVar} === "function") {`);
  emit(context, indent + 4, `${elementVar}.addEventListener(${eventVar}, ${handlerVar});`);
  emit(context, indent + 4, `${listenersVar}.set(${eventVar}, ${handlerVar});`);
  emit(context, indent + 3, "}");
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `for (const [${eventVar}, ${handlerVar}] of ${listenersVar}) {`);
  emit(context, indent + 2, `${elementVar}.removeEventListener(${eventVar}, ${handlerVar});`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${listenersVar}.clear();`);
  emit(context, indent, "});");
}

function generateChildren(
  context: GenerateContext,
  children: TemplateNode[],
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): void {
  let index = 0;

  while (index < children.length) {
    const child = children[index];

    if (child.type === "element" && getStringAttr(child, "v-if")) {
      const branches: IfBranch[] = [
        {
          node: child,
          condition: getStringAttr(child, "v-if"),
          directive: "v-if"
        }
      ];
      let cursor = index + 1;

      while (cursor < children.length) {
        let candidateIndex = cursor;

        while (candidateIndex < children.length && isWhitespaceText(children[candidateIndex])) {
          candidateIndex += 1;
        }

        const candidate = children[candidateIndex];

        if (candidate?.type !== "element") {
          break;
        }

        const elseIfExpression = getStringAttr(candidate, "v-else-if");

        if (elseIfExpression) {
          branches.push({
            node: candidate,
            condition: elseIfExpression,
            directive: "v-else-if"
          });
          cursor = candidateIndex + 1;
          continue;
        }

        if (hasAttr(candidate, "v-else")) {
          validateElseAttribute(candidate, context);
          branches.push({
            node: candidate,
            directive: "v-else"
          });
          cursor = candidateIndex + 1;
        }

        break;
      }

      generateIfChain(context, branches, parentVar, cleanupVar, indent, beforeVar);
      index = cursor;
      continue;
    }

    if (child.type === "element" && (hasAttr(child, "v-else-if") || hasAttr(child, "v-else"))) {
      const attr = child.attrs.find((candidate) => candidate.name === "v-else-if" || candidate.name === "v-else");
      throwTemplateError(`${attr?.name ?? "v-else"} must follow v-if or v-else-if`, context, attr?.loc);
    }

    generateNode(context, child, parentVar, cleanupVar, indent, beforeVar);
    index += 1;
  }
}

function generateIfChain(
  context: GenerateContext,
  branches: IfBranch[],
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  const startVar = nextVar(context, "ifStart");
  const endVar = nextVar(context, "ifEnd");
  const branchCleanupVar = nextVar(context, "ifCleanup");
  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${branchCleanupVar} = [];`);
  emit(context, indent, `const ${startVar} = document.createComment("if");`);
  emit(context, indent, `const ${endVar} = document.createComment("/if");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);

  branches.forEach((branch, branchIndex) => {
    if (branch.directive === "v-else") {
      emit(context, indent + 1, `${branchIndex === 0 ? "if (true)" : "else"} {`);
    } else {
      const condition = compileTemplateExpression(
        branch.condition ?? "",
        branch.directive,
        toExpressionContext(context, getStringAttrLocation(branch.node, branch.directive))
      );
      emit(context, indent + 1, `${branchIndex === 0 ? "if" : "else if"} (unwrap(${condition})) {`);
    }

    generateNode(context, withoutAttrs(branch.node, ["v-if", "v-else-if", "v-else"]), parentVar, branchCleanupVar, indent + 2, endVar);
    emit(context, indent + 1, "}");
  });

  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emit(context, indent, "});");
  return startVar;
}

function generateFor(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  expression: string,
  beforeVar?: string
): string {
  const { item: itemName, index: indexName, source: sourceExpression } = parseForExpression(
    expression,
    toExpressionContext(context, getStringAttrLocation(node, "v-for"))
  );
  const keyExpression = getKeyExpression(node);

  if (keyExpression) {
    return generateKeyedFor(context, node, parentVar, cleanupVar, indent, itemName, indexName, sourceExpression, keyExpression, beforeVar);
  }

  const startVar = nextVar(context, "forStart");
  const endVar = nextVar(context, "forEnd");
  const branchCleanupVar = nextVar(context, "forCleanup");
  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${branchCleanupVar} = [];`);
  emit(context, indent, `const ${startVar} = document.createComment("for");`);
  emit(context, indent, `const ${endVar} = document.createComment("/for");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  if (indexName) {
    const sourceVar = nextVar(context, "forSource");
    const indexVar = nextVar(context, "forIndex");
    emit(context, indent + 1, `const ${sourceVar} = unwrap(${compileTemplateExpression(sourceExpression, "v-for source", toExpressionContext(context, getStringAttrLocation(node, "v-for")))}) ?? [];`);
    emit(context, indent + 1, `for (let ${indexVar} = 0; ${indexVar} < ${sourceVar}.length; ${indexVar} += 1) {`);
    emit(context, indent + 2, `const ${itemName} = ${sourceVar}[${indexVar}];`);
    emit(context, indent + 2, `const ${indexName} = ${indexVar};`);
    withTemplateRefMode(context, "array", () => {
      generateNode(context, withoutForAttrs(node), parentVar, branchCleanupVar, indent + 2, endVar);
    });
    emit(context, indent + 1, "}");
  } else {
    emit(context, indent + 1, `for (const ${itemName} of unwrap(${compileTemplateExpression(sourceExpression, "v-for source", toExpressionContext(context, getStringAttrLocation(node, "v-for")))}) ?? []) {`);
    withTemplateRefMode(context, "array", () => {
      generateNode(context, withoutForAttrs(node), parentVar, branchCleanupVar, indent + 2, endVar);
    });
    emit(context, indent + 1, "}");
  }
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emit(context, indent, "});");
  return startVar;
}

function generateKeyedFor(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  itemName: string,
  indexName: string | undefined,
  sourceExpression: string,
  keyExpression: string,
  beforeVar?: string
): string {
  const startVar = nextVar(context, "forStart");
  const endVar = nextVar(context, "forEnd");
  const recordsVar = nextVar(context, "forRecords");
  const stopVar = nextVar(context, "stop");
  const compiledSource = compileTemplateExpression(sourceExpression, "v-for source", toExpressionContext(context, getStringAttrLocation(node, "v-for")));
  const compiledKey = compileTemplateExpression(keyExpression, "v-for key", toExpressionContext(context, getKeyAttrLocation(node)));
  emit(context, indent, `const ${recordsVar} = new Map();`);
  emit(context, indent, `const ${startVar} = document.createComment("for");`);
  emit(context, indent, `const ${endVar} = document.createComment("/for");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  const sourceVar = nextVar(context, "forSource");
  const nextRecordsVar = nextVar(context, "nextRecords");
  const indexVar = nextVar(context, "forIndex");
  const rawItemVar = nextVar(context, "forItem");
  const rawIndexVar = nextVar(context, "forIndexValue");
  const keyVar = nextVar(context, "forKey");
  const recordVar = nextVar(context, "forRecord");
  const recordCleanupVar = nextVar(context, "forRecordCleanup");
  const itemRefVar = nextVar(context, "forItemRef");
  const indexRefVar = nextVar(context, "forIndexRef");
  emit(context, indent + 1, `const ${sourceVar} = unwrap(${compiledSource}) ?? [];`);
  emit(context, indent + 1, `const ${nextRecordsVar} = new Map();`);
  emit(context, indent + 1, `for (let ${indexVar} = 0; ${indexVar} < ${sourceVar}.length; ${indexVar} += 1) {`);
  emit(context, indent + 2, `const ${rawItemVar} = ${sourceVar}[${indexVar}];`);
  emit(context, indent + 2, `const ${rawIndexVar} = ${indexVar};`);
  emit(context, indent + 2, `const ${itemName} = ${rawItemVar};`);

  if (indexName) {
    emit(context, indent + 2, `const ${indexName} = ${rawIndexVar};`);
  }

  emit(context, indent + 2, `const ${keyVar} = unwrap(${compiledKey});`);
  emit(context, indent + 2, `let ${recordVar} = ${recordsVar}.get(${keyVar});`);
  emit(context, indent + 2, `if (!${recordVar}) {`);
  emit(context, indent + 3, `const ${recordCleanupVar} = [];`);
  emit(context, indent + 3, `const ${itemRefVar} = ref(${rawItemVar});`);

  if (indexName) {
    emit(context, indent + 3, `const ${indexRefVar} = ref(${rawIndexVar});`);
  }

  emit(context, indent + 3, `{`);
  emit(context, indent + 4, `const ${itemName} = ${itemRefVar};`);

  if (indexName) {
    emit(context, indent + 4, `const ${indexName} = ${indexRefVar};`);
  }

  const elementVar = withTemplateRefMode(context, "array", () =>
    generateNode(context, withoutForAttrs(node), parentVar, recordCleanupVar, indent + 4, endVar)
  );
  emit(context, indent + 4, `${recordVar} = { element: ${elementVar}, cleanups: ${recordCleanupVar}, item: ${itemRefVar}${indexName ? `, index: ${indexRefVar}` : ""} };`);
  emit(context, indent + 3, `}`);
  emit(context, indent + 2, `} else {`);
  emit(context, indent + 3, `${recordVar}.item.value = ${rawItemVar};`);

  if (indexName) {
    emit(context, indent + 3, `${recordVar}.index.value = ${rawIndexVar};`);
  }

  emit(context, indent + 3, `${parentVar}.insertBefore(${recordVar}.element, ${endVar});`);
  emit(context, indent + 2, `}`);
  emit(context, indent + 2, `${nextRecordsVar}.set(${keyVar}, ${recordVar});`);
  emit(context, indent + 1, `}`);
  emit(context, indent + 1, `for (const [${keyVar}, ${recordVar}] of ${recordsVar}) {`);
  emit(context, indent + 2, `if (!${nextRecordsVar}.has(${keyVar})) {`);
  emit(context, indent + 3, `__mikuru_runCleanup(${recordVar}.cleanups);`);
  emit(context, indent + 3, `${recordVar}.element.remove();`);
  emit(context, indent + 2, `}`);
  emit(context, indent + 1, `}`);
  emit(context, indent + 1, `${recordsVar}.clear();`);
  emit(context, indent + 1, `for (const [${keyVar}, ${recordVar}] of ${nextRecordsVar}) {`);
  emit(context, indent + 2, `${recordsVar}.set(${keyVar}, ${recordVar});`);
  emit(context, indent + 1, `}`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `for (const ${recordVar} of ${recordsVar}.values()) {`);
  emit(context, indent + 2, `__mikuru_runCleanup(${recordVar}.cleanups);`);
  emit(context, indent + 1, `}`);
  emit(context, indent + 1, `${recordsVar}.clear();`);
  emit(context, indent, "});");
  return startVar;
}

function emitRemoveBetween(context: GenerateContext, indent: number, startVar: string, endVar: string): void {
  const currentVar = nextVar(context, "current");
  const nextVarName = nextVar(context, "next");
  emit(context, indent, `let ${currentVar} = ${startVar}.nextSibling;`);
  emit(context, indent, `while (${currentVar} && ${currentVar} !== ${endVar}) {`);
  emit(context, indent + 1, `const ${nextVarName} = ${currentVar}.nextSibling;`);
  emit(context, indent + 1, `${currentVar}.remove();`);
  emit(context, indent + 1, `${currentVar} = ${nextVarName};`);
  emit(context, indent, "}");
}

function withTemplateRefMode<T>(context: GenerateContext, mode: "single" | "array", callback: () => T): T {
  const previousMode = context.templateRefMode;
  context.templateRefMode = mode;

  try {
    return callback();
  } finally {
    context.templateRefMode = previousMode;
  }
}

function appendNode(context: GenerateContext, parentVar: string, nodeVar: string, indent: number, beforeVar?: string): void {
  if (beforeVar) {
    emit(context, indent, `${parentVar}.insertBefore(${nodeVar}, ${beforeVar});`);
    return;
  }

  emit(context, indent, `${parentVar}.appendChild(${nodeVar});`);
}

function textExpression(parts: TextPart[], context: GenerateContext): string {
  return parts
    .map((part) => {
      if (part.type === "static") {
        return quote(part.value);
      }

      return `String(unwrap(${compileTemplateExpression(part.value, "interpolation", toExpressionContext(context, part.loc))}) ?? "")`;
    })
    .join(" + ");
}

function normalizeScript(descriptor: SfcDescriptor): ScriptParts {
  const script = descriptor.script ?? "";
  const source = descriptor.source ?? script;
  const scriptOffset = descriptor.scriptOffset ?? 0;
  const imports: string[] = [];
  const runtimeImports: string[] = [];
  const edits: ScriptEdit[] = [];
  const transformedMacroStarts = new Set<number>();
  const emitsDeclarations: EmitsDeclaration[] = [];
  let inheritAttrs = true;
  let usesPropsAlias = false;
  let usesAttrsAlias = false;
  let usesEmitAlias = false;
  let ast: ScriptNode;

  try {
    ast = parse(script, { ecmaVersion: "latest", sourceType: "module" }) as unknown as ScriptNode;
  } catch (error) {
    const offset = typeof (error as { pos?: unknown }).pos === "number" ? (error as { pos: number }).pos : 0;
    throw createCompileError("Invalid <script> syntax", source, scriptOffset + offset, descriptor.filename);
  }

  for (const statement of ast.body ?? []) {
    if (statement.type === "ImportDeclaration") {
      const importSource = statement.source?.value;

      edits.push({ start: statement.start, end: statement.end, replacement: "" });

      if (importSource === "mikuru" || importSource === "mikuru/runtime") {
        runtimeImports.push(...extractRuntimeImportSpecifiers(statement));
        continue;
      }

      imports.push(script.slice(statement.start, statement.end).trim());
      continue;
    }

    if (statement.type !== "VariableDeclaration") {
      if (isMacroCall(statement.expression, "defineOptions")) {
        inheritAttrs = parseDefineOptionsDeclaration(statement.expression, descriptor).inheritAttrs;
        edits.push({ start: statement.start, end: statement.end, replacement: "" });
        transformedMacroStarts.add(statement.expression?.start ?? statement.start);
      }

      continue;
    }

    const macroDeclarations = (statement.declarations ?? []).filter(
      (declaration) =>
        isMacroCall(declaration.init, "defineProps") ||
        isMacroCall(declaration.init, "defineEmits") ||
        isMacroCall(declaration.init, "useAttrs")
    );

    if (macroDeclarations.length > 0 && (statement.declarations ?? []).length !== 1) {
      throwUnsupportedMacro(
        "defineProps(), defineEmits(), and useAttrs() cannot share a variable declaration with other bindings",
        macroDeclarations[0],
        descriptor
      );
    }

    if (macroDeclarations.length > 0 && statement.kind !== "const") {
      throwUnsupportedMacro("defineProps(), defineEmits(), and useAttrs() must use const declarations", macroDeclarations[0], descriptor);
    }

    for (const declaration of statement.declarations ?? []) {
      if (
        !isMacroCall(declaration.init, "defineProps") &&
        !isMacroCall(declaration.init, "defineEmits") &&
        !isMacroCall(declaration.init, "useAttrs")
      ) {
        continue;
      }

      if (isMacroCall(declaration.init, "defineProps")) {
        const replacement = transformDefinePropsDeclaration(declaration, script, descriptor);
        edits.push({ start: statement.start, end: statement.end, replacement });
        transformedMacroStarts.add(declaration.init?.start ?? declaration.start);
        usesPropsAlias = usesPropsAlias || replacement.includes("__mikuru_props");
        continue;
      }

      if (isMacroCall(declaration.init, "useAttrs")) {
        const replacement = transformUseAttrsDeclaration(declaration, descriptor);
        edits.push({ start: statement.start, end: statement.end, replacement });
        transformedMacroStarts.add(declaration.init?.start ?? declaration.start);
        usesAttrsAlias = true;
        continue;
      }

      const emitDeclaration = transformDefineEmitsDeclaration(declaration, descriptor);
      edits.push({ start: statement.start, end: statement.end, replacement: emitDeclaration.replacement });
      transformedMacroStarts.add(declaration.init?.start ?? declaration.start);
      emitsDeclarations.push({
        localName: emitDeclaration.localName,
        events: emitDeclaration.events
      });
      usesEmitAlias = true;
    }
  }

  const body = applyScriptEdits(script, edits).replace(/\bexport\s+(?=(const|let|var|function|class)\b)/g, "").trim();
  assertNoUnsupportedMacroCalls(ast, transformedMacroStarts, descriptor);
  validateDeclaredEmitCalls(ast, emitsDeclarations, descriptor);

  return {
    imports,
    runtimeImports,
    body,
    inheritAttrs,
    usesPropsAlias,
    usesAttrsAlias,
    usesEmitAlias
  };
}

function mergeRuntimeImports(requiredImports: string[], scriptImports: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const importName of [...requiredImports, ...scriptImports]) {
    if (seen.has(importName)) continue;
    seen.add(importName);
    merged.push(importName);
  }

  return merged;
}

function extractRuntimeImportSpecifiers(statement: ScriptNode): string[] {
  const imports: string[] = [];

  for (const specifier of statement.specifiers ?? []) {
    if (specifier.type !== "ImportSpecifier" || !specifier.imported?.name || !specifier.local?.name) {
      continue;
    }

    imports.push(
      specifier.imported.name === specifier.local.name
        ? specifier.imported.name
        : `${specifier.imported.name} as ${specifier.local.name}`
    );
  }

  return imports;
}

function transformDefinePropsDeclaration(declaration: ScriptNode, script: string, descriptor: SfcDescriptor): string {
  const macroCall = declaration.init;

  validateDefinePropsDeclaration(macroCall, descriptor);

  if (declaration.id?.type === "Identifier") {
    const localName = declaration.id.name ?? "";

    if (!isIdentifier(localName)) {
      throwUnsupportedMacro("Unsupported defineProps binding", declaration.id, descriptor);
    }

    return `const ${localName} = ${localName === "props" ? "__mikuru_props" : "props"};`;
  }

  if (declaration.id?.type !== "ObjectPattern") {
    throwUnsupportedMacro("defineProps() only supports identifier and object destructuring bindings", declaration.id ?? declaration, descriptor);
  }

  return (declaration.id.properties ?? [])
    .map((property) => transformDefinePropsProperty(property, script, descriptor))
    .join("\n");
}

function transformDefinePropsProperty(property: ScriptNode, script: string, descriptor: SfcDescriptor): string {
  if (property.type === "RestElement") {
    throwUnsupportedMacro("defineProps() does not support rest props yet", property, descriptor);
  }

  if (property.type !== "Property" || property.computed || property.key?.type !== "Identifier") {
    throwUnsupportedMacro("Unsupported defineProps destructuring entry", property, descriptor);
  }

  const propName = property.key.name ?? "";
  const propValueNode = property.value as ScriptNode | undefined;
  let localName = "";
  let defaultValue: string | undefined;

  if (propValueNode?.type === "Identifier") {
    localName = propValueNode.name ?? "";
  } else if (propValueNode?.type === "AssignmentPattern" && propValueNode.left?.type === "Identifier") {
    localName = propValueNode.left.name ?? "";
    defaultValue = script.slice(propValueNode.right?.start ?? propValueNode.end, propValueNode.right?.end ?? propValueNode.end);
  } else {
    throwUnsupportedMacro("defineProps() does not support nested destructuring yet", propValueNode ?? property, descriptor);
  }

  if (!isIdentifier(propName) || !isIdentifier(localName)) {
    throwUnsupportedMacro("Unsupported defineProps destructuring entry", property, descriptor);
  }

  const propValue = `props.${propName}`;

  if (defaultValue) {
    return `const ${localName} = { get value() { const value = ${propValue}; return value === undefined ? (${defaultValue}) : value; } };`;
  }

  return `const ${localName} = { get value() { return ${propValue}; } };`;
}

function transformDefineEmitsDeclaration(
  declaration: ScriptNode,
  descriptor: SfcDescriptor
): { replacement: string; localName: string; events?: Set<string> } {
  if (declaration.id?.type !== "Identifier" || !isIdentifier(declaration.id.name ?? "")) {
    throwUnsupportedMacro("defineEmits() only supports identifier bindings", declaration.id ?? declaration, descriptor);
  }

  const localName = declaration.id.name ?? "";

  return {
    replacement: `const ${localName} = __mikuru_emit;`,
    localName,
    events: parseDefineEmitsDeclaration(declaration.init, descriptor)
  };
}

function transformUseAttrsDeclaration(declaration: ScriptNode, descriptor: SfcDescriptor): string {
  validateNoMacroArguments(declaration.init, "useAttrs", descriptor);

  if (declaration.id?.type !== "Identifier" || !isIdentifier(declaration.id.name ?? "")) {
    throwUnsupportedMacro("useAttrs() only supports identifier bindings", declaration.id ?? declaration, descriptor);
  }

  const localName = declaration.id.name ?? "";
  return `const ${localName} = ${localName === "__mikuru_attrs" ? "props.__mikuru_attrs ?? {}" : "__mikuru_attrs"};`;
}

function applyScriptEdits(script: string, edits: ScriptEdit[]): string {
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  let output = "";
  let cursor = 0;

  for (const edit of ordered) {
    if (edit.start < cursor) {
      continue;
    }

    output += script.slice(cursor, edit.start);
    output += edit.replacement;
    cursor = edit.end;
  }

  output += script.slice(cursor);
  return output;
}

function isMacroCall(node: ScriptNode | null | undefined, name: "defineProps" | "defineEmits" | "useAttrs" | "defineOptions"): boolean {
  return node?.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === name;
}

function validateNoMacroArguments(node: ScriptNode | null | undefined, name: string, descriptor: SfcDescriptor): void {
  const args = node?.arguments ?? [];

  if (args.length > 0) {
    throwUnsupportedMacro(`${name}() does not accept arguments`, args[0] ?? node ?? undefined, descriptor);
  }
}

function parseDefineOptionsDeclaration(node: ScriptNode | null | undefined, descriptor: SfcDescriptor): { inheritAttrs: boolean } {
  const args = node?.arguments ?? [];

  if (args.length !== 1 || args[0]?.type !== "ObjectExpression") {
    throwUnsupportedMacro("defineOptions() only supports an object declaration argument", args[0] ?? node ?? undefined, descriptor);
  }

  let inheritAttrs = true;

  for (const property of args[0].properties ?? []) {
    if (property.type !== "Property" || property.computed) {
      throwUnsupportedMacro("Unsupported defineOptions() declaration entry", property, descriptor);
    }

    const keyName = getPropertyKeyName(property.key);

    if (keyName !== "inheritAttrs") {
      throwUnsupportedMacro(`Unsupported defineOptions() option "${keyName ?? ""}"`, property.key ?? property, descriptor);
    }

    const valueNode = property.value as ScriptNode | undefined;

    if (valueNode?.type !== "Literal" || typeof valueNode.value !== "boolean") {
      throwUnsupportedMacro("defineOptions({ inheritAttrs }) must use a boolean literal", valueNode ?? property, descriptor);
    }

    inheritAttrs = valueNode.value;
  }

  return { inheritAttrs };
}

function validateDefinePropsDeclaration(node: ScriptNode | null | undefined, descriptor: SfcDescriptor): void {
  const args = node?.arguments ?? [];

  if (args.length === 0) {
    return;
  }

  if (args.length !== 1 || args[0]?.type !== "ObjectExpression") {
    throwUnsupportedMacro("defineProps() only supports an object declaration argument", args[0] ?? node ?? undefined, descriptor);
  }

  for (const property of args[0].properties ?? []) {
    if (property.type !== "Property" || property.computed) {
      throwUnsupportedMacro("Unsupported defineProps() declaration entry", property, descriptor);
    }

    const propName = getPropertyKeyName(property.key);

    if (!propName) {
      throwUnsupportedMacro("Unsupported defineProps() declaration key", property.key ?? property, descriptor);
    }

    const valueNode = property.value as ScriptNode | undefined;

    if (!isSupportedPropConstructor(valueNode)) {
      throwUnsupportedMacro("defineProps() declaration values must use String, Number, Boolean, Array, or Object", valueNode, descriptor);
    }
  }
}

function parseDefineEmitsDeclaration(node: ScriptNode | null | undefined, descriptor: SfcDescriptor): Set<string> | undefined {
  const args = node?.arguments ?? [];

  if (args.length === 0) {
    return undefined;
  }

  if (args.length !== 1 || args[0]?.type !== "ArrayExpression") {
    throwUnsupportedMacro("defineEmits() only supports an array declaration argument", args[0] ?? node ?? undefined, descriptor);
  }

  const events = new Set<string>();

  for (const element of args[0].elements ?? []) {
    if (element?.type !== "Literal" || typeof element.value !== "string") {
      throwUnsupportedMacro("defineEmits() declarations must be string literals", element ?? args[0], descriptor);
    }

    events.add(element.value);
  }

  return events;
}

function validateDeclaredEmitCalls(
  node: ScriptNode,
  emitsDeclarations: EmitsDeclaration[],
  descriptor: SfcDescriptor
): void {
  if (!emitsDeclarations.length) {
    return;
  }

  walkScriptNode(node, (candidate) => {
    if (candidate.type !== "CallExpression" || candidate.callee?.type !== "Identifier") {
      return;
    }

    const declaration = emitsDeclarations.find((emitDeclaration) => emitDeclaration.localName === candidate.callee?.name);

    if (!declaration?.events) {
      return;
    }

    const eventArg = candidate.arguments?.[0];

    if (eventArg?.type !== "Literal" || typeof eventArg.value !== "string") {
      throwUnsupportedMacro("Declared emit calls must use a string literal event name", eventArg ?? candidate, descriptor);
    }

    if (!declaration.events.has(eventArg.value)) {
      throwUnsupportedMacro(`Emit event "${eventArg.value}" is not declared`, eventArg, descriptor);
    }
  });
}

function getPropertyKeyName(node: ScriptNode | undefined): string | undefined {
  if (node?.type === "Identifier") {
    return node.name;
  }

  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
}

function isSupportedPropConstructor(node: ScriptNode | undefined): boolean {
  if (node?.type !== "Identifier") {
    return false;
  }

  return ["String", "Number", "Boolean", "Array", "Object"].includes(node.name ?? "");
}

function assertNoUnsupportedMacroCalls(
  node: ScriptNode,
  transformedMacroStarts: Set<number>,
  descriptor: SfcDescriptor
): void {
  walkScriptNode(node, (candidate) => {
    if (
      candidate.type === "CallExpression" &&
      candidate.callee?.type === "Identifier" &&
      (candidate.callee.name === "defineProps" ||
        candidate.callee.name === "defineEmits" ||
        candidate.callee.name === "useAttrs" ||
        candidate.callee.name === "defineOptions") &&
      !transformedMacroStarts.has(candidate.start)
    ) {
      throwUnsupportedMacro(
        "defineProps(), defineEmits(), useAttrs(), and defineOptions() must be used in supported top-level declarations",
        candidate,
        descriptor
      );
    }
  });
}

function walkScriptNode(node: ScriptNode | ScriptNode[] | null | undefined, visit: (node: ScriptNode) => void): void {
  if (!node) {
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      walkScriptNode(child, visit);
    }

    return;
  }

  visit(node);

  for (const value of Object.values(node) as unknown[]) {
    if (!value || typeof value !== "object") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "type" in item) {
          walkScriptNode(item as ScriptNode, visit);
        }
      }

      continue;
    }

    if ("type" in value) {
      walkScriptNode(value as ScriptNode, visit);
    }
  }
}

function throwUnsupportedMacro(message: string, node: ScriptNode | undefined, descriptor: SfcDescriptor): never {
  throw createCompileError(
    message,
    descriptor.source ?? descriptor.script ?? "",
    (descriptor.scriptOffset ?? 0) + (node?.start ?? 0),
    descriptor.filename
  );
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function eventHandlerExpression(expression: string, context: GenerateContext, location: SourceLocation | undefined): string {
  const validatedExpression = validateTemplateExpression(expression, "event handler", toExpressionContext(context, location));

  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(validatedExpression)) {
    return validatedExpression;
  }

  return `($event) => (${compileTemplateExpression(validatedExpression, "event handler", toExpressionContext(context, location))})`;
}

function getStringAttr(node: ElementNode, name: string): string | undefined {
  const attr = node.attrs.find((candidate) => candidate.name === name);

  if (!attr) {
    return undefined;
  }

  return requireAttrValue(attr);
}

function getStringAttrLocation(node: ElementNode, name: string): SourceLocation | undefined {
  return node.attrs.find((candidate) => candidate.name === name)?.valueLoc;
}

function getStaticAttrValue(node: ElementNode, name: string): string | undefined {
  const attr = node.attrs.find((candidate) => candidate.name === name);

  if (!attr || attr.value === true) {
    return undefined;
  }

  return attr.value;
}

function hasStaticBooleanAttr(node: ElementNode, name: string): boolean {
  return node.attrs.some((candidate) => candidate.name === name && candidate.value === true);
}

function getKeyExpression(node: ElementNode): string | undefined {
  return getStringAttr(node, ":key") ?? getStringAttr(node, "v-bind:key");
}

function getKeyAttrLocation(node: ElementNode): SourceLocation | undefined {
  return getStringAttrLocation(node, ":key") ?? getStringAttrLocation(node, "v-bind:key");
}

function toExpressionContext(
  context: GenerateContext,
  location: SourceLocation | undefined
): ExpressionLocationContext | undefined {
  if (!context.source || !location) {
    return undefined;
  }

  return {
    source: context.source,
    offset: location.offset,
    filename: context.filename
  };
}

function withoutAttr(node: ElementNode, name: string): ElementNode {
  return withoutAttrs(node, [name]);
}

function withoutForAttrs(node: ElementNode): ElementNode {
  return withoutAttrs(node, ["v-for", "key", ":key", "v-bind:key"]);
}

function withoutAttrs(node: ElementNode, names: string[]): ElementNode {
  return {
    ...node,
    attrs: node.attrs.filter((attr) => !names.includes(attr.name))
  };
}

function hasAttr(node: ElementNode, name: string): boolean {
  return node.attrs.some((attr) => attr.name === name);
}

function isWhitespaceText(node: TemplateNode | undefined): boolean {
  return node?.type === "text" && node.parts.every((part) => part.type === "static" && !part.value.trim());
}

function validateElseAttribute(node: ElementNode, context: GenerateContext): void {
  const attr = node.attrs.find((candidate) => candidate.name === "v-else");

  if (attr && attr.value !== true) {
    throwTemplateError("v-else does not accept a value", context, attr.valueLoc ?? attr.loc);
  }
}

function throwTemplateError(message: string, context: GenerateContext, location: SourceLocation | undefined): never {
  if (context.source && location) {
    throw createCompileError(message, context.source, location.offset, context.filename);
  }

  throw new Error(message);
}

function emitComponentProps(context: GenerateContext, node: ElementNode, propsVar: string, attrsVar: string, indent: number): void {
  const props = node.attrs
    .filter((attr) => !isStructuralAttr(attr))
    .flatMap((attr) => componentPropEntries(context, attr));
  const objectBindAttrs = node.attrs.filter((attr) => isObjectBindAttr(attr));
  const objectOnAttrs = node.attrs.filter((attr) => isObjectOnAttr(attr));
  const slots = collectComponentSlots(context, node);
  const defaultSlot = slots.find((slot) => !slot.nameExpression && slot.name === "default");
  const needsProxy = objectBindAttrs.length > 0 || objectOnAttrs.length > 0;
  const propsTargetVar = needsProxy ? nextVar(context, "propsBase") : propsVar;

  emit(context, indent, `const ${propsTargetVar} = {`);
  emit(context, indent + 1, "__mikuru_context,");
  emit(context, indent + 1, `__mikuru_attrs: ${attrsVar},`);

  for (const prop of props) {
    emit(context, indent + 1, `${prop},`);
  }

  if (defaultSlot) {
    emitSlotFunction(context, "children", defaultSlot, indent + 1);
  }

  if (slots.length > 0) {
    emit(context, indent + 1, "slots: {");

    for (const slot of slots) {
      emitSlotFunction(context, slot.nameExpression ? `[${slot.nameExpression}]` : quotePropertyName(slot.name), slot, indent + 2);
    }

    emit(context, indent + 1, "},");
  }

  emit(context, indent, "};");

  if (needsProxy) {
    emitComponentPropsProxy(context, propsVar, propsTargetVar, objectBindAttrs, objectOnAttrs, indent);
  }
}

function emitComponentPropsProxy(
  context: GenerateContext,
  propsVar: string,
  propsTargetVar: string,
  objectBindAttrs: TemplateAttribute[],
  objectOnAttrs: TemplateAttribute[],
  indent: number
): void {
  const keyVar = nextVar(context, "key");
  const sourceVar = nextVar(context, "source");
  const eventNameVar = nextVar(context, "eventName");
  const handlerVar = nextVar(context, "handler");
  const propNameVar = nextVar(context, "propName");
  emit(context, indent, `const ${propsVar} = new Proxy(${propsTargetVar}, {`);
  emit(context, indent + 1, `get(target, ${keyVar}) {`);
  emit(context, indent + 2, `if (typeof ${keyVar} === "symbol" || ${keyVar} in target) {`);
  emit(context, indent + 3, `return target[${keyVar}];`);
  emit(context, indent + 2, "}");

  for (const attr of objectBindAttrs) {
    const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    emit(context, indent + 2, `{`);
    emit(context, indent + 3, `const ${sourceVar} = unwrap(${expression}) ?? {};`);
    emit(context, indent + 3, `if (${sourceVar} && typeof ${sourceVar} === "object" && ${keyVar} in ${sourceVar}) {`);
    emit(context, indent + 4, `return unwrap(${sourceVar}[${keyVar}]);`);
    emit(context, indent + 3, "}");
    emit(context, indent + 2, `}`);
  }

  for (const attr of objectOnAttrs) {
    const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    emit(context, indent + 2, `{`);
    emit(context, indent + 3, `const ${sourceVar} = unwrap(${expression}) ?? {};`);
    emit(context, indent + 3, `if (${sourceVar} && typeof ${sourceVar} === "object") {`);
    emit(context, indent + 4, `for (const [${eventNameVar}, ${handlerVar}] of Object.entries(${sourceVar})) {`);
    emit(context, indent + 5, `const ${propNameVar} = "on" + String(${eventNameVar}).split(/[-:]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");`);
    emit(context, indent + 5, `if (${propNameVar} === ${keyVar} && typeof ${handlerVar} === "function") {`);
    emit(context, indent + 6, `return ${handlerVar};`);
    emit(context, indent + 5, "}");
    emit(context, indent + 4, "}");
    emit(context, indent + 3, "}");
    emit(context, indent + 2, `}`);
  }

  emit(context, indent + 2, "return undefined;");
  emit(context, indent + 1, "}");
  emit(context, indent, "});");
}

function emitSlotFunction(context: GenerateContext, propertyName: string, slot: SlotDefinition, indent: number): void {
  const slotTargetVar = nextVar(context, "slotTarget");
  const slotPropsVar = nextVar(context, "slotProps");
  const slotCleanupVar = nextVar(context, "slotCleanup");
  emit(context, indent, `${propertyName}(${slotTargetVar}, ${slotPropsVar} = {}) {`);
  emit(context, indent + 1, `const ${slotCleanupVar} = [];`);
  emitSlotScopeBindings(context, slot, slotPropsVar, indent + 1);
  generateChildren(context, slot.children, slotTargetVar, slotCleanupVar, indent + 1);
  emit(context, indent + 1, `return () => __mikuru_runCleanup(${slotCleanupVar});`);
  emit(context, indent, "},");
}

function emitSlotScopeBindings(context: GenerateContext, slot: SlotDefinition, slotPropsVar: string, indent: number): void {
  for (const binding of parseSlotScopeBindings(slot.scope, context, slot.scopeLoc ?? slot.loc)) {
    if (binding.kind === "props") {
      emit(context, indent, `const ${binding.alias} = ${slotPropsVar};`);
      continue;
    }

    if (binding.defaultValue) {
      emit(context, indent, `const ${binding.alias} = { get value() { const value = ${slotPropsVar}.${binding.source}; return value === undefined ? (${binding.defaultValue}) : value; } };`);
      continue;
    }

    emit(context, indent, `const ${binding.alias} = { get value() { return ${slotPropsVar}.${binding.source}; } };`);
  }
}

function collectComponentSlots(context: GenerateContext, node: ElementNode): SlotDefinition[] {
  const slots: SlotDefinition[] = [];
  const usedNames = new Set<string>();
  const defaultChildren: TemplateNode[] = [];

  for (const child of node.children) {
    if (child.type === "element") {
      const slotDirective = getSlotTemplateDirective(child, context);

      if (slotDirective) {
        if (usedNames.has(slotDirective.name)) {
          throwTemplateError(`Duplicate slot template: ${slotDirective.name}`, context, slotDirective.loc);
        }

        usedNames.add(slotDirective.name);
        slots.push({
          name: slotDirective.name,
          nameExpression: slotDirective.nameExpression,
          children: child.children,
          scope: slotDirective.scope,
          loc: child.loc,
          scopeLoc: slotDirective.scopeLoc
        });
        continue;
      }
    }

    defaultChildren.push(child);
  }

  if (hasMeaningfulTemplateChildren(defaultChildren)) {
    if (usedNames.has("default")) {
      throwTemplateError("Duplicate slot template: default", context, node.loc);
    }

    slots.unshift({
      name: "default",
      children: defaultChildren,
      scope: true,
      loc: node.loc
    });
  }

  return slots;
}

function getSlotTemplateDirective(node: ElementNode, context: GenerateContext): SlotTemplateDirective | undefined {
  if (node.tag !== "template") {
    return undefined;
  }

  const slotAttrs = node.attrs.filter((attr) => isSlotDirectiveAttr(attr));

  if (slotAttrs.length === 0) {
    return undefined;
  }

  if (slotAttrs.length > 1) {
    throwTemplateError("A slot template can only declare one slot target", context, slotAttrs[1]?.loc);
  }

  const attr = slotAttrs[0]!;
  const name = getSlotTemplateName(attr, context);

  return {
    ...name,
    scope: attr.value,
    loc: attr.loc,
    scopeLoc: attr.valueLoc
  };
}

function getSlotTemplateName(attr: TemplateAttribute, context: GenerateContext): { name: string; nameExpression?: string } {
  if (attr.name === "v-slot") {
    return { name: "default" };
  }

  if (attr.name.startsWith("v-slot:")) {
    return parseSlotTemplateName(attr.name.slice("v-slot:".length) || "default", attr, context);
  }

  if (attr.name.startsWith("#")) {
    return parseSlotTemplateName(attr.name.slice(1) || "default", attr, context);
  }

  return { name: "default" };
}

function parseSlotTemplateName(rawName: string, attr: TemplateAttribute, context: GenerateContext): { name: string; nameExpression?: string } {
  const name = rawName.trim();
  const dynamicStart = name.indexOf("[");
  const dynamicEnd = name.lastIndexOf("]");

  if (dynamicStart >= 0 && dynamicEnd > dynamicStart) {
    const expression = name.slice(dynamicStart + 1, dynamicEnd).trim();

    if (!expression) {
      throwTemplateError("Dynamic slot name requires an expression", context, attr.loc);
    }

    return {
      name: `[${expression}]`,
      nameExpression: compileTemplateExpression(expression, attr.name, toExpressionContext(context, attr.loc))
    };
  }

  return { name };
}

function parseSlotScopeBindings(scope: string | true, context: GenerateContext, location: SourceLocation | undefined): SlotScopeBinding[] {
  if (scope === true || !scope.trim()) {
    return [];
  }

  const source = scope.trim();

  if (isIdentifier(source)) {
    return [{ kind: "props", alias: source }];
  }

  if (!source.startsWith("{") || !source.endsWith("}")) {
    throwTemplateError("Slot scope must be an identifier or object destructuring pattern", context, location);
  }

  const body = source.slice(1, -1).trim();

  if (!body) {
    return [];
  }

  return body.split(",").map((part) => {
    const sourcePart = part.trim();
    const match = /^([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?(?:\s*=\s*(.+))?$/.exec(sourcePart);

    if (!match) {
      throwTemplateError("Slot scope destructuring only supports identifiers, simple aliases, and default values", context, location);
    }

    return {
      kind: "property",
      source: match[1],
      alias: match[2] ?? match[1],
      defaultValue: match[3]
        ? compileTemplateExpression(match[3].trim(), "slot scope default", toExpressionContext(context, location))
        : undefined
    };
  });
}

function emitSlotOutletProps(context: GenerateContext, node: ElementNode, propsVar: string, indent: number): void {
  const entries = node.attrs
    .filter((attr) => attr.name !== "name" && getBindingName(attr.name) !== "name")
    .map((attr) => slotOutletPropEntry(context, attr));

  emit(context, indent, `const ${propsVar} = {`);

  for (const entry of entries) {
    emit(context, indent + 1, `${entry},`);
  }

  emit(context, indent, "};");
}

function slotOutletPropEntry(context: GenerateContext, attr: TemplateAttribute): string {
  const bindingName = getBindingName(attr.name);

  if (bindingName) {
    const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    return `get ${quotePropertyName(bindingName)}() { return unwrap(${expression}); }`;
  }

  if (isSupportedDirectiveAttr(attr) || attr.name.startsWith("@") || attr.name.startsWith("v-")) {
    throwTemplateError(`Unsupported slot directive ${attr.name}`, context, attr.loc);
  }

  return `${quotePropertyName(attr.name)}: ${quote(attr.value === true ? true : attr.value)}`;
}

function getSlotOutletNameExpression(
  node: ElementNode,
  context: GenerateContext
): { dynamic: true; expression: string } | { dynamic: false; name: string } {
  const dynamicNameAttr = node.attrs.find((candidate) => getBindingName(candidate.name) === "name");

  if (dynamicNameAttr) {
    return {
      dynamic: true,
      expression: compileTemplateExpression(
        requireAttrValue(dynamicNameAttr),
        dynamicNameAttr.name,
        toExpressionContext(context, dynamicNameAttr.valueLoc)
      )
    };
  }

  return { dynamic: false, name: getStaticAttrValue(node, "name") ?? "default" };
}

function componentPropEntries(context: GenerateContext, attr: TemplateAttribute): string[] {
  if (isSlotDirectiveAttr(attr)) {
    throwTemplateError("v-slot must be used on a <template> child in Mikuru", context, attr.loc);
  }

  if (attr.name === "ref") {
    return [];
  }

  if (getBindingName(attr.name) === "ref") {
    return [];
  }

  if (isObjectBindAttr(attr) || isObjectOnAttr(attr)) {
    return [];
  }

  const modelDirective = parseModelDirective(attr.name);

  if (modelDirective) {
    validateModelModifiers(modelDirective, attr, context);
    const expression = validateAssignableExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    const valueExpression = compileTemplateExpression(expression, attr.name, toExpressionContext(context, attr.valueLoc));

    const entries = [
      `get modelValue() { return unwrap(${valueExpression}); }`,
      `onUpdateModelValue: ($value) => { ${expression}.value = $value; }`
    ];

    if (modelDirective.modifiers.length > 0) {
      entries.push(`modelModifiers: { ${modelDirective.modifiers.map((modifier) => `${quotePropertyName(modifier)}: true`).join(", ")} }`);
    }

    return entries;
  }

  const event = parseEventDirective(attr.name);

  if (event) {
    validateComponentEventModifiers(event, attr, context);
    const handler = validateTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    return [
      `${quotePropertyName(toComponentEventProp(event.name))}: ${componentEventHandlerExpression(
        event,
        eventHandlerExpression(handler, context, attr.valueLoc),
        context
      )}`
    ];
  }

  const bindingName = getBindingName(attr.name);

  if (bindingName) {
    const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    return [`get ${quotePropertyName(bindingName)}() { return unwrap(${expression}); }`];
  }

  if (attr.name === "v-show") {
    return [];
  }

  return [`${quotePropertyName(attr.name)}: ${quote(attr.value === true ? true : attr.value)}`];
}

function hasMeaningfulTemplateChildren(children: TemplateNode[]): boolean {
  return children.some((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));
}

function toComponentEventProp(eventName: string): string {
  return `on${eventName
    .split(/[-:]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("")}`;
}

function validateAttributes(node: ElementNode): void {
  for (const attr of node.attrs) {
    if (attr.name.startsWith("v-") && !isSupportedDirectiveAttr(attr)) {
      throw new Error(`Unsupported directive ${attr.name}`);
    }
  }
}

function isDirectiveAttr(attr: TemplateAttribute): boolean {
  return isSupportedDirectiveAttr(attr) || attr.name.startsWith("@") || attr.name.startsWith(":");
}

function isStructuralAttr(attr: TemplateAttribute): boolean {
  return attr.name === "v-if" || attr.name === "v-else-if" || attr.name === "v-else" || attr.name === "v-for";
}

function isSlotDirectiveAttr(attr: TemplateAttribute): boolean {
  return attr.name === "v-slot" || attr.name.startsWith("v-slot:") || attr.name.startsWith("#");
}

function isSupportedDirectiveAttr(attr: TemplateAttribute): boolean {
  return (
    attr.name === "v-if" ||
    attr.name === "v-else-if" ||
    attr.name === "v-else" ||
    attr.name === "v-for" ||
    attr.name === "v-show" ||
    Boolean(parseModelDirective(attr.name)) ||
    isObjectBindAttr(attr) ||
    isObjectOnAttr(attr) ||
    Boolean(parseEventDirective(attr.name)) ||
    Boolean(getBindingName(attr.name))
  );
}

function isObjectBindAttr(attr: TemplateAttribute): boolean {
  return attr.name === "v-bind";
}

function isObjectOnAttr(attr: TemplateAttribute): boolean {
  return attr.name === "v-on";
}

function parseEventDirective(name: string): EventDirective | undefined {
  const rawName = getEventName(name);

  if (!rawName) {
    return undefined;
  }

  const [eventName, ...modifiers] = rawName.split(".");
  return {
    name: eventName,
    modifiers
  };
}

function parseModelDirective(name: string): { modifiers: string[] } | undefined {
  if (name === "v-model") {
    return { modifiers: [] };
  }

  if (!name.startsWith("v-model.")) {
    return undefined;
  }

  return { modifiers: name.slice("v-model.".length).split(".").filter(Boolean) };
}

function validateModelModifiers(model: { modifiers: string[] }, attr: TemplateAttribute, context: GenerateContext): void {
  const supportedModifiers = new Set(["trim", "number", "lazy"]);

  for (const modifier of model.modifiers) {
    if (!supportedModifiers.has(modifier)) {
      throwTemplateError(`Unsupported v-model modifier .${modifier}`, context, attr.loc);
    }
  }
}

function modelAssignedValue(modelMode: string, modifiers: string[]): string {
  if (modelMode === "checkbox") {
    return "$event.target.checked";
  }

  if (modelMode === "radio") {
    const valueExpression = `($event.target.getAttribute("value") ?? "on")`;
    return modifiers.includes("number") ? `Number(${valueExpression})` : valueExpression;
  }

  if (modelMode === "select-multiple") {
    const valueExpression = `Array.from($event.target.options).filter((option) => option.selected).map((option) => option.getAttribute("value") ?? option.textContent ?? "")`;
    return modifiers.includes("number") ? `${valueExpression}.map((value) => Number(value))` : valueExpression;
  }

  let valueExpression = "$event.target.value";

  if (modifiers.includes("trim")) {
    valueExpression = `${valueExpression}.trim()`;
  }

  if (modifiers.includes("number")) {
    valueExpression = `Number(${valueExpression})`;
  }

  return valueExpression;
}

function validateEventModifiers(event: EventDirective, attr: TemplateAttribute, context: GenerateContext): void {
  const supportedModifiers = new Set(["prevent", "stop", "self", "once", "capture", "passive"]);

  for (const modifier of event.modifiers) {
    if (!supportedModifiers.has(modifier)) {
      throwTemplateError(`Unsupported event modifier .${modifier}`, context, attr.loc);
    }
  }

  if (event.modifiers.includes("passive") && event.modifiers.includes("prevent")) {
    throwTemplateError("Event modifiers .passive and .prevent cannot be combined", context, attr.loc);
  }
}

function validateComponentEventModifiers(event: EventDirective, attr: TemplateAttribute, context: GenerateContext): void {
  for (const modifier of event.modifiers) {
    if (modifier !== "once") {
      throwTemplateError(`Event modifier .${modifier} is only supported on DOM events`, context, attr.loc);
    }
  }
}

function eventListenerOptions(event: EventDirective): string | undefined {
  const options = [
    event.modifiers.includes("capture") ? "capture: true" : undefined,
    event.modifiers.includes("once") ? "once: true" : undefined,
    event.modifiers.includes("passive") ? "passive: true" : undefined
  ].filter(Boolean);

  return options.length ? `{ ${options.join(", ")} }` : undefined;
}

function componentEventHandlerExpression(event: EventDirective, handlerExpression: string, context: GenerateContext): string {
  if (!event.modifiers.includes("once")) {
    return handlerExpression;
  }

  const calledVar = nextVar(context, "called");
  const handlerVar = nextVar(context, "handler");
  return `(() => { let ${calledVar} = false; const ${handlerVar} = ${handlerExpression}; return (...$args) => { if (${calledVar}) { return; } ${calledVar} = true; return ${handlerVar}(...$args); }; })()`;
}

function getEventName(name: string): string | undefined {
  if (name.startsWith("@")) {
    return name.slice(1);
  }

  if (name.startsWith("v-on:")) {
    return name.slice("v-on:".length);
  }

  return undefined;
}

function getBindingName(name: string): string | undefined {
  if (name.startsWith(":")) {
    return name.slice(1);
  }

  if (name.startsWith("v-bind:")) {
    return name.slice("v-bind:".length);
  }

  return undefined;
}

function requireAttrValue(attr: TemplateAttribute): string {
  if (attr.value === true) {
    throw new Error(`Attribute ${attr.name} requires a value`);
  }

  return attr.value;
}

function isComponentTag(tag: string): boolean {
  return /^[A-Z]/.test(tag);
}

function emitBlock(context: GenerateContext, indent: number, block: string): void {
  for (const line of block.split("\n")) {
    emit(context, indent, line);
  }
}

function emit(context: GenerateContext, indent: number, line: string): void {
  context.lines.push(`${"  ".repeat(indent)}${line}`);
}

function nextVar(context: GenerateContext, prefix: string): string {
  const value = `${prefix}${context.index}`;
  context.index += 1;
  return value;
}

function quote(value: unknown): string {
  return JSON.stringify(value);
}

function quotePropertyName(value: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : quote(value);
}

function createScopeAttr(descriptor: SfcDescriptor): string {
  return `data-mikuru-scope-${hash(`${descriptor.filename ?? ""}\n${descriptor.style ?? ""}`)}`;
}

function scopeCssSelectors(css: string, scopeAttr: string): string {
  return css.replace(/([^{}]+)\{/g, (match, selectorSource: string) => {
    const selector = selectorSource.trim();

    if (!selector || selector.startsWith("@")) {
      return match;
    }

    return `${selector
      .split(",")
      .map((part) => scopeSingleSelector(part.trim(), scopeAttr))
      .join(", ")} {`;
  });
}

function scopeSingleSelector(selector: string, scopeAttr: string): string {
  if (!selector || selector.includes(`[${scopeAttr}]`)) {
    return selector;
  }

  const pseudoIndex = selector.search(/:{1,2}[A-Za-z-]/);

  if (pseudoIndex === -1) {
    return `${selector}[${scopeAttr}]`;
  }

  return `${selector.slice(0, pseudoIndex)}[${scopeAttr}]${selector.slice(pseudoIndex)}`;
}

function hash(value: string): string {
  let result = 5381;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33) ^ value.charCodeAt(index);
  }

  return (result >>> 0).toString(36);
}
