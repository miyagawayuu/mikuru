import { parse, parseExpressionAt } from "acorn";

import { createCompileError } from "./errors.js";
import { compileDescriptorStyle } from "./css.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode, TextPart } from "./types.js";
import type { SourceLocation } from "./errors.js";
import type { ExpressionLocationContext } from "./parseExpression.js";
import { compileTemplateExpression, parseForExpression, validateAssignableExpression, validateTemplateExpression } from "./parseExpression.js";

export type GenerateContext = {
  lines: string[];
  index: number;
  source?: string;
  filename?: string;
  scopeAttr?: string;
  templateRefMode?: "single" | "array";
  componentContextVar?: string;
  debug?: boolean;
  batchedUpdates?: boolean;
  once?: boolean;
};

type GenerateOptions = {
  debug?: boolean;
  batchedUpdates?: boolean;
  externalStyles?: boolean;
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
  test?: ScriptNode;
  consequent?: ScriptNode;
  alternate?: ScriptNode;
  object?: ScriptNode;
  property?: ScriptNode;
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
  name?: string;
  nameExpression?: string;
  modifiers: string[];
};

type BindDirective = {
  name?: string;
  nameExpression?: string;
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
  | { kind: "property"; path: string[]; alias: string; defaultValue?: string }
  | { kind: "rest"; alias: string; exclude: string[] };

export function generate(descriptor: SfcDescriptor, root: ElementNode, options: GenerateOptions = {}): string {
  const context: GenerateContext = {
    lines: [],
    index: 0,
    source: descriptor.source,
    filename: descriptor.filename,
    scopeAttr: descriptor.styleScoped ? createScopeAttr(descriptor) : undefined,
    debug: options.debug === true,
    batchedUpdates: options.batchedUpdates === true
  };
  const script = normalizeScript(descriptor);

  for (const importLine of script.imports) {
    emit(context, 0, importLine);
  }

  const runtimeBaseImports = ["computed", "effect", "ref", "setAttribute", "unwrap"];
  if (context.batchedUpdates) {
    runtimeBaseImports.push("queueJob");
  }
  if (context.debug) {
    runtimeBaseImports.push("createDebugDiagnostic", "emitDebugEvent", "registerDebugComponent");
  }
  const runtimeImports = mergeRuntimeImports(runtimeBaseImports, script.runtimeImports);
  emit(context, 0, `import { ${runtimeImports.join(", ")} } from "mikuru/runtime";`);
  emit(context, 0, "");
  if (context.batchedUpdates) {
    emit(context, 0, "const __mikuru_effect = (fn) => effect(fn, { scheduler: queueJob });");
    emit(context, 0, "");
  }
  emit(context, 0, "export function mount(target, props = {}) {");
  emit(context, 1, `const __mikuru_componentInfo = { component: ${quote(descriptor.filename ?? "anonymous.mikuru")}, filename: ${quote(descriptor.filename ?? "anonymous.mikuru")} };`);
  emitDevtoolsRegistration(context, 1);
  emit(context, 1, "const __mikuru_cleanup = [];");
  emit(context, 1, "const __mikuru_afterUnmount = [];");
  emit(context, 1, "const __mikuru_mounted = [];");
  emit(context, 1, "const __mikuru_activated = [];");
  emit(context, 1, "const __mikuru_deactivated = [];");
  emit(context, 1, `const __mikuru_context = { parent: props.__mikuru_context, provides: new Map(), errorHandler: props.__mikuru_context?.errorHandler${context.debug ? ", debugId: __mikuru_debug.id" : ""}, ...__mikuru_componentInfo };`);
  emit(context, 1, "const __mikuru_errorInfo = (phase) => ({ ...__mikuru_componentInfo, phase });");
  emit(context, 1, "const __mikuru_reportError = (error, errorHandler = __mikuru_context.errorHandler, phase = \"runtime\") => {");
  if (context.debug) {
    emit(context, 2, "emitDebugEvent(\"component:error\", { component: __mikuru_componentInfo, error, errorInfo: __mikuru_errorInfo(phase), componentId: __mikuru_debug.id, diagnostic: createDebugDiagnostic(\"runtime\", \"error\", error instanceof Error ? error.message : String(error), { ...__mikuru_errorInfo(phase), error }) });");
  }
  emit(context, 2, "if (typeof errorHandler === \"function\") { Promise.resolve().then(() => errorHandler(error, __mikuru_errorInfo(phase))); return; }");
  emit(context, 2, "setTimeout(() => { throw error; });");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_try = (fn, errorHandler, phase) => { try { return fn(); } catch (error) { __mikuru_reportError(error, errorHandler, phase); } };");
  emit(context, 1, "const __mikuru_memoEqual = (previous, next) => Array.isArray(previous) && Array.isArray(next) && previous.length === next.length && previous.every((value, index) => Object.is(value, next[index]));");
  emit(context, 1, "const __mikuru_guardEventHandler = (fn, errorHandler = __mikuru_context.errorHandler) => (...args) => __mikuru_try(() => fn(...args), errorHandler, \"event\");");
  emit(context, 1, "const __mikuru_runCleanup = (cleanups) => {");
  emit(context, 2, "for (const cleanup of cleanups.splice(0).reverse()) {");
  emit(context, 3, "__mikuru_try(cleanup, undefined, \"cleanup\");");
  emit(context, 2, "}");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_transitionFrame = (fn) => {");
  emit(context, 2, "const raf = globalThis.requestAnimationFrame;");
  emit(context, 2, "if (typeof raf === \"function\") { raf(() => raf(fn)); } else { setTimeout(fn, 0); }");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_transitionDone = (element, cleanup) => {");
  emit(context, 2, "let done = false;");
  emit(context, 2, "const finish = () => {");
  emit(context, 3, "if (done) { return; }");
  emit(context, 3, "done = true;");
  emit(context, 3, "element.removeEventListener(\"transitionend\", finish);");
  emit(context, 3, "element.removeEventListener(\"animationend\", finish);");
  emit(context, 3, "cleanup();");
  emit(context, 2, "};");
  emit(context, 2, "element.addEventListener(\"transitionend\", finish);");
  emit(context, 2, "element.addEventListener(\"animationend\", finish);");
  emit(context, 2, "setTimeout(finish, 50);");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_applyTransitionEnter = (element, name) => {");
  emit(context, 2, "const transition = typeof name === \"object\" ? name : { name };");
  emit(context, 2, "if (!element || element.nodeType !== 1 || !transition.name) { return; }");
  emit(context, 2, "if (transition.appear === false && !transition.__mikuru_hasAppeared) { transition.__mikuru_hasAppeared = true; return; }");
  emit(context, 2, "transition.__mikuru_hasAppeared = true;");
  emit(context, 2, "const from = transition.enterFromClass || `${transition.name}-enter-from`;");
  emit(context, 2, "const active = transition.enterActiveClass || `${transition.name}-enter-active`;");
  emit(context, 2, "const to = transition.enterToClass || `${transition.name}-enter-to`;");
  emit(context, 2, "element.classList.add(from, active);");
  emit(context, 2, "__mikuru_transitionFrame(() => {");
  emit(context, 3, "element.classList.remove(from);");
  emit(context, 3, "element.classList.add(to);");
  emit(context, 3, "__mikuru_transitionDone(element, () => element.classList.remove(active, to));");
  emit(context, 2, "});");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_applyTransitionMove = (element, transition) => {");
  emit(context, 2, "if (!element || element.nodeType !== 1 || !transition?.name) { return; }");
  emit(context, 2, "const move = transition.moveClass || `${transition.name}-move`;");
  emit(context, 2, "element.classList.add(move);");
  emit(context, 2, "__mikuru_transitionFrame(() => __mikuru_transitionDone(element, () => element.classList.remove(move)));");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_removeNode = (node) => {");
  emit(context, 2, "if (!node || !node.parentNode) { return; }");
  emit(context, 2, "if (node.nodeType !== 1 || !node.__mikuru_transition || node.__mikuru_transitionLeaving) { node.remove(); return; }");
  emit(context, 2, "node.__mikuru_transitionLeaving = true;");
  emit(context, 2, "const transition = node.__mikuru_transition;");
  emit(context, 2, "const from = transition.leaveFromClass || `${transition.name}-leave-from`;");
  emit(context, 2, "const active = transition.leaveActiveClass || `${transition.name}-leave-active`;");
  emit(context, 2, "const to = transition.leaveToClass || `${transition.name}-leave-to`;");
  emit(context, 2, "node.classList.add(from, active);");
  emit(context, 2, "__mikuru_transitionFrame(() => {");
  emit(context, 3, "node.classList.remove(from);");
  emit(context, 3, "node.classList.add(to);");
  emit(context, 3, "__mikuru_transitionDone(node, () => { node.classList.remove(active, to); node.remove(); });");
  emit(context, 2, "});");
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
  emit(context, 2, "registerActivated: (fn) => __mikuru_activated.push(fn),");
  emit(context, 2, "registerDeactivated: (fn) => __mikuru_deactivated.push(fn),");
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
    if (options.externalStyles === true) {
      emitExternalStyleDebugEvent(context, descriptor, 1);
    } else {
      emitStyleInjection(context, descriptor, 1);
    }
    if (options.externalStyles !== true || context.debug) {
      emit(context, 1, "");
    }
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
      emit(context, 3, "__mikuru_try(() => handler(...args), undefined, \"emit\");");
      emit(context, 2, "}");
      emit(context, 1, "};");
    }

    emitBlock(context, 1, script.body);
    emit(context, 1, "");
  }

  const rootVar = generateNode(context, root, "target", "__mikuru_cleanup", 1);
  emitDevtoolsRootUpdate(context, rootVar, 1);
  emit(context, 1, "// call mounted callbacks registered during setup and remove registrar");
  emit(context, 1, "for (const cb of __mikuru_mounted.splice(0)) { __mikuru_try(cb, undefined, \"mounted\"); }");
  emit(context, 1, "if (__mikuru_previousRegistrar === undefined) { delete globalThis.__mikuru_currentRegistrar; } else { globalThis.__mikuru_currentRegistrar = __mikuru_previousRegistrar; }");
  emit(context, 1, "return {");
  emit(context, 2, `element: ${rootVar},`);
  emit(context, 2, "activate() {");
  emit(context, 3, "for (const cb of __mikuru_activated) { __mikuru_try(cb, undefined, \"activated\"); }");
  emit(context, 2, "},");
  emit(context, 2, "deactivate() {");
  emit(context, 3, "for (const cb of __mikuru_deactivated) { __mikuru_try(cb, undefined, \"deactivated\"); }");
  emit(context, 2, "},");
  emit(context, 2, "unmount() {");
  if (context.debug) {
    emit(context, 3, "emitDebugEvent(\"component:unmount\", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id });");
    emit(context, 3, "__mikuru_unregisterDevtools();");
  }
  emit(context, 3, "__mikuru_runCleanup(__mikuru_cleanup);");
  emit(context, 3, "for (const cb of __mikuru_afterUnmount.splice(0).reverse()) { __mikuru_try(cb, undefined, \"unmounted\"); }");
  emit(context, 3, `__mikuru_removeNode(${rootVar});`);
  emit(context, 2, "}");
  emit(context, 1, "};");
  emit(context, 0, "}");
  emit(context, 0, "");
  emit(context, 0, `const __mikuru_component = { mount${script.inheritAttrs ? "" : ", inheritAttrs: false"} };`);
  emit(context, 0, "export default __mikuru_component;");

  const lines = context.batchedUpdates
    ? context.lines.map((line) => line.replace("= effect(() => {", "= __mikuru_effect(() => {"))
    : context.lines;

  return `${lines.join("\n")}\n`;
}

function emitStyleInjection(context: GenerateContext, descriptor: SfcDescriptor, indent: number): void {
  const styleId = `mikuru-${hash(`${descriptor.filename ?? ""}\n${descriptor.style ?? ""}`)}`;
  const styleResult = compileDescriptorStyle(descriptor, context.scopeAttr);
  emit(context, indent, `if (!document.querySelector(${quote(`style[data-mikuru-style="${styleId}"]`)})) {`);
  emit(context, indent + 1, "const style = document.createElement(\"style\");");
  emit(context, indent + 1, `style.setAttribute("data-mikuru-style", ${quote(styleId)});`);
  if (styleResult.scopeAttr) {
    emit(context, indent + 1, `style.setAttribute("data-mikuru-scope", ${quote(styleResult.scopeAttr)});`);
  }
  emit(context, indent + 1, `style.textContent = ${quote(styleResult.code)};`);
  emit(context, indent + 1, "document.head.appendChild(style);");
  if (context.debug) {
    emit(context, indent + 1, `emitDebugEvent("style:inject", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id, style: { id: ${quote(styleId)}, scoped: ${styleResult.scoped ? "true" : "false"}, scopeAttr: ${quote(styleResult.scopeAttr)}, length: ${styleResult.code.length} } });`);
  }
  emit(context, indent, "}");
}

function emitExternalStyleDebugEvent(context: GenerateContext, descriptor: SfcDescriptor, indent: number): void {
  if (!context.debug) {
    return;
  }

  const styleId = `mikuru-${hash(`${descriptor.filename ?? ""}\n${descriptor.style ?? ""}`)}`;
  const styleResult = compileDescriptorStyle(descriptor, context.scopeAttr);
  emit(context, indent, `emitDebugEvent("style:inject", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id, style: { id: ${quote(styleId)}, scoped: ${styleResult.scoped ? "true" : "false"}, scopeAttr: ${quote(styleResult.scopeAttr)}, length: ${styleResult.code.length}, external: true } });`);
}

function emitDevtoolsRegistration(context: GenerateContext, indent: number): void {
  if (!context.debug) {
    return;
  }

  emit(context, indent, "const __mikuru_publicProps = Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith(\"__mikuru_\")));");
  emit(context, indent, "const __mikuru_debugAttrs = props.__mikuru_attrs && typeof props.__mikuru_attrs === \"object\" ? { ...props.__mikuru_attrs } : {};");
  emit(context, indent, "const __mikuru_debug = registerDebugComponent({");
  emit(context, indent + 1, "name: __mikuru_componentInfo.component,");
  emit(context, indent + 1, "filename: __mikuru_componentInfo.filename,");
  emit(context, indent + 1, "parentId: props.__mikuru_context?.debugId,");
  emit(context, indent + 1, "props: __mikuru_publicProps,");
  emit(context, indent + 1, "propKeys: Object.keys(__mikuru_publicProps),");
  emit(context, indent + 1, "attrs: __mikuru_debugAttrs,");
  emit(context, indent + 1, "attrKeys: Object.keys(__mikuru_debugAttrs)");
  emit(context, indent, "});");
  emit(context, indent, "const __mikuru_unregisterDevtools = () => __mikuru_debug.unregister();");
}

function emitDevtoolsRootUpdate(context: GenerateContext, rootVar: string, indent: number): void {
  if (!context.debug) {
    return;
  }

  emit(context, indent, `__mikuru_debug.update({ root: ${rootVar} });`);
  emit(context, indent, "emitDebugEvent(\"component:mount\", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id, root: __mikuru_debug.metadata.root, props: __mikuru_debug.metadata.props, attrs: __mikuru_debug.metadata.attrs });");
}

export function generateNode(
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

  if (hasAttr(node, "v-pre")) {
    validatePreAttribute(context, node);
    return generatePreElement(context, node, parentVar, indent, beforeVar);
  }

  if (hasAttr(node, "v-once") && !hasAttr(node, "v-for")) {
    validateOnceAttribute(context, node);
    return withOnceMode(context, () => generateNode(context, withoutAttrs(node, ["v-once"]), parentVar, cleanupVar, indent, beforeVar));
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

  if (node.tag === "component") {
    return generateDynamicComponent(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "Transition") {
    return generateTransition(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "TransitionGroup") {
    return generateTransitionGroup(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "Teleport") {
    return generateTeleport(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "AsyncBoundary") {
    return generateAsyncBoundary(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "ErrorBoundary") {
    return generateErrorBoundary(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "KeepAlive") {
    return generateKeepAlive(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (isComponentTag(node.tag)) {
    return generateComponent(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "slot") {
    return generateSlot(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  if (node.tag === "template") {
    return generateTemplateFragment(context, node, parentVar, cleanupVar, indent, beforeVar);
  }

  return generateElement(context, node, parentVar, cleanupVar, indent, beforeVar);
}

function generateTemplateFragment(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validatePlainTemplate(context, node);
  const startVar = nextVar(context, "templateStart");
  const endVar = nextVar(context, "templateEnd");
  emit(context, indent, `const ${startVar} = document.createComment("template");`);
  emit(context, indent, `const ${endVar} = document.createComment("/template");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  generateChildren(context, node.children, parentVar, cleanupVar, indent, endVar);
  return startVar;
}

function validatePlainTemplate(context: GenerateContext, node: ElementNode): void {
  const slotAttr = node.attrs.find((attr) => isSlotDirectiveAttr(attr));
  if (slotAttr) {
    throwTemplateError("Slot templates must be direct children of a component", context, slotAttr.loc);
  }
}

function generateTransition(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validateTransitionAttributes(context, node);
  const children = getTransitionChildren(context, node);
  const transitionVar = nextVar(context, "transition");
  emit(context, indent, `const ${transitionVar} = ${getTransitionOptionsExpression(context, node)};`);
  const child = children[0];

  if (getStringAttr(child, "v-if")) {
    return generateIfChain(context, getTransitionBranches(context, children), parentVar, cleanupVar, indent, beforeVar, transitionVar);
  }

  if (child.tag === "component") {
    return generateDynamicComponent(context, child, parentVar, cleanupVar, indent, beforeVar, transitionVar);
  }

  const childVar = generateNode(context, child, parentVar, cleanupVar, indent, beforeVar);
  emitTransitionRegistration(context, childVar, transitionVar, indent);
  return childVar;
}

function generateTransitionGroup(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validateTransitionGroupAttributes(context, node);
  const children = getSingleElementChild(context, node, "<TransitionGroup>");
  const child = children[0];
  const forExpression = getStringAttr(child, "v-for");
  const keyExpression = getKeyExpression(child);

  if (!forExpression || !keyExpression) {
    throwTemplateError("<TransitionGroup> requires a single keyed v-for child in v1", context, child.loc);
  }

  const { item: itemName, index: indexName, source: sourceExpression } = parseForExpression(
    forExpression,
    toExpressionContext(context, getStringAttrLocation(child, "v-for"))
  );
  const groupVar = nextVar(context, "transitionGroup");
  const groupCleanupVar = nextVar(context, "transitionGroupCleanup");
  const transitionVar = nextVar(context, "transition");
  emit(context, indent, `const ${transitionVar} = ${getTransitionOptionsExpression(context, node)};`);
  emit(context, indent, `const ${groupVar} = document.createElement(String(unwrap(${getTransitionAttrExpression(context, node, "tag", "span")}) ?? "span"));`);
  appendNode(context, parentVar, groupVar, indent, beforeVar);
  emit(context, indent, `const ${groupCleanupVar} = [];`);
  generateKeyedFor(context, child, groupVar, groupCleanupVar, indent, itemName, indexName, sourceExpression, keyExpression, undefined, transitionVar);
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `__mikuru_runCleanup(${groupCleanupVar});`);
  emit(context, indent + 1, `__mikuru_removeNode(${groupVar});`);
  emit(context, indent, "});");
  return groupVar;
}

function generateTeleport(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validateTeleportAttributes(context, node);
  const toExpression = getTeleportToExpression(context, node);
  const disabledExpression = getTeleportDisabledExpression(context, node);
  const startVar = nextVar(context, "teleportStart");
  const endVar = nextVar(context, "teleportEnd");
  const contentStartVar = nextVar(context, "teleportContentStart");
  const contentEndVar = nextVar(context, "teleportContentEnd");
  const fragmentVar = nextVar(context, "teleportFragment");
  const teleportParentVar = nextVar(context, "teleportParent");
  const teleportCleanupVar = nextVar(context, "teleportCleanup");
  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${startVar} = document.createComment("teleport");`);
  emit(context, indent, `const ${endVar} = document.createComment("/teleport");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${contentStartVar} = document.createComment("teleport content");`);
  emit(context, indent, `const ${contentEndVar} = document.createComment("/teleport content");`);
  emit(context, indent, `const ${fragmentVar} = document.createDocumentFragment();`);
  emit(context, indent, `${fragmentVar}.appendChild(${contentStartVar});`);
  emit(context, indent, `${fragmentVar}.appendChild(${contentEndVar});`);
  emit(context, indent, `const ${teleportParentVar} = {`);
  emit(context, indent + 1, `insertBefore(node, before) { (before?.parentNode ?? ${contentEndVar}.parentNode)?.insertBefore(node, before ?? ${contentEndVar}); },`);
  emit(context, indent + 1, `appendChild(node) { ${contentEndVar}.parentNode?.insertBefore(node, ${contentEndVar}); }`);
  emit(context, indent, "};");
  emit(context, indent, `const ${teleportCleanupVar} = [];`);
  generateChildren(context, node.children, teleportParentVar, teleportCleanupVar, indent, contentEndVar);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const teleportDisabled = Boolean(unwrap(${disabledExpression}));`);
  emit(context, indent + 1, `const teleportTargetValue = unwrap(${toExpression});`);
  emit(context, indent + 1, `const teleportTarget = teleportDisabled ? ${parentVar} : (typeof teleportTargetValue === "string" ? document.querySelector(teleportTargetValue) : teleportTargetValue);`);
  emit(context, indent + 1, `if (!teleportTarget || typeof teleportTarget.insertBefore !== "function") {`);
  emit(context, indent + 2, `throw new Error("Teleport target was not found");`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `const teleportBefore = teleportDisabled ? ${endVar} : null;`);
  emit(context, indent + 1, `const teleportNodes = [];`);
  emit(context, indent + 1, `let teleportCurrent = ${contentStartVar};`);
  emit(context, indent + 1, `while (teleportCurrent) {`);
  emit(context, indent + 2, `teleportNodes.push(teleportCurrent);`);
  emit(context, indent + 2, `if (teleportCurrent === ${contentEndVar}) { break; }`);
  emit(context, indent + 2, `teleportCurrent = teleportCurrent.nextSibling;`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `for (const teleportNode of teleportNodes) {`);
  emit(context, indent + 2, `teleportTarget.insertBefore(teleportNode, teleportBefore);`);
  emit(context, indent + 1, "}");
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `__mikuru_runCleanup(${teleportCleanupVar});`);
  emitRemoveBetween(context, indent + 1, contentStartVar, contentEndVar);
  emit(context, indent + 1, `${contentStartVar}.remove();`);
  emit(context, indent + 1, `${contentEndVar}.remove();`);
  emit(context, indent + 1, `${startVar}.remove();`);
  emit(context, indent + 1, `${endVar}.remove();`);
  emit(context, indent, "});");
  return startVar;
}

function generateErrorBoundary(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validateErrorBoundaryAttributes(context, node);
  const children = getSingleElementChild(context, node, "<ErrorBoundary>");
  const fallbackExpression = getErrorBoundaryFallbackExpression(context, node);
  const resetKeyExpression = getErrorBoundaryResetKeyExpression(context, node);
  const startVar = nextVar(context, "errorBoundaryStart");
  const endVar = nextVar(context, "errorBoundaryEnd");
  const boundaryCleanupVar = nextVar(context, "errorBoundaryCleanup");
  const renderVar = nextVar(context, "renderErrorBoundary");
  const fallbackRenderVar = nextVar(context, "renderErrorBoundaryFallback");
  const errorVar = nextVar(context, "error");
  const errorInfoVar = nextVar(context, "errorInfo");
  const normalizedErrorInfoVar = nextVar(context, "errorInfo");
  const fallbackVar = nextVar(context, "errorFallback");
  const fallbackFragmentVar = nextVar(context, "errorFallback");
  const fallbackInstanceVar = nextVar(context, "errorFallback");
  const previousErrorHandlerVar = nextVar(context, "previousErrorHandler");
  const boundaryContextVar = nextVar(context, "errorBoundaryContext");
  const previousComponentContextVar = context.componentContextVar;
  const boundaryResetInitializedVar = resetKeyExpression ? nextVar(context, "errorBoundaryResetInitialized") : undefined;
  const boundaryResetValueVar = resetKeyExpression ? nextVar(context, "errorBoundaryResetValue") : undefined;
  const boundaryResetNextVar = resetKeyExpression ? nextVar(context, "errorBoundaryResetValue") : undefined;
  const boundaryResetStopVar = resetKeyExpression ? nextVar(context, "stop") : undefined;
  emit(context, indent, `const ${startVar} = document.createComment("error-boundary");`);
  emit(context, indent, `const ${endVar} = document.createComment("/error-boundary");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${boundaryCleanupVar} = [];`);
  emit(context, indent, `const ${fallbackRenderVar} = (${errorVar}, ${errorInfoVar} = __mikuru_errorInfo("runtime")) => {`);
  emit(context, indent + 1, `__mikuru_runCleanup(${boundaryCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `const ${fallbackVar} = unwrap(${fallbackExpression});`);
  emit(context, indent + 1, `if (!${fallbackVar} || typeof ${fallbackVar}.mount !== "function") { throw ${errorVar}; }`);
  emit(context, indent + 1, `const ${normalizedErrorInfoVar} = ${errorInfoVar} && typeof ${errorInfoVar} === "object" ? ${errorInfoVar} : {};`);
  if (context.debug) {
    emit(context, indent + 1, `emitDebugEvent("component:error", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id, error: ${errorVar}, errorInfo: { ...${normalizedErrorInfoVar}, boundary: __mikuru_componentInfo }, diagnostic: createDebugDiagnostic("runtime", "error", ${errorVar} instanceof Error ? ${errorVar}.message : String(${errorVar}), { ...${normalizedErrorInfoVar}, boundary: __mikuru_componentInfo, error: ${errorVar} }) });`);
  }
  emit(context, indent + 1, `const ${fallbackFragmentVar} = document.createDocumentFragment();`);
  emit(context, indent + 1, `const ${fallbackInstanceVar} = ${fallbackVar}.mount(${fallbackFragmentVar}, { error: ${errorVar}, errorInfo: { ...${normalizedErrorInfoVar}, boundary: __mikuru_componentInfo }, retry: ${renderVar}, reset: ${renderVar}, __mikuru_context });`);
  emit(context, indent + 1, `${boundaryCleanupVar}.push(() => ${fallbackInstanceVar}.unmount());`);
  appendNode(context, parentVar, fallbackFragmentVar, indent + 1, endVar);
  emit(context, indent, "};");
  emit(context, indent, `const ${renderVar} = () => {`);
  emit(context, indent + 1, `__mikuru_runCleanup(${boundaryCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `const ${previousErrorHandlerVar} = __mikuru_context.errorHandler;`);
  emit(context, indent + 1, `const ${boundaryContextVar} = { parent: __mikuru_context, provides: new Map(), errorHandler: ${fallbackRenderVar}, ...__mikuru_componentInfo };`);
  emit(context, indent + 1, `__mikuru_context.errorHandler = ${fallbackRenderVar};`);
  emit(context, indent + 1, "try {");
  context.componentContextVar = boundaryContextVar;
  generateNode(context, children[0], parentVar, boundaryCleanupVar, indent + 2, endVar);
  context.componentContextVar = previousComponentContextVar;
  emit(context, indent + 1, `} catch (${errorVar}) {`);
  emit(context, indent + 2, `${fallbackRenderVar}(${errorVar}, __mikuru_errorInfo("mount"));`);
  emit(context, indent + 1, "} finally {");
  emit(context, indent + 2, `__mikuru_context.errorHandler = ${previousErrorHandlerVar};`);
  emit(context, indent + 1, "}");
  emit(context, indent, "};");
  emit(context, indent, `${renderVar}();`);
  if (resetKeyExpression && boundaryResetInitializedVar && boundaryResetValueVar && boundaryResetNextVar && boundaryResetStopVar) {
    emit(context, indent, `let ${boundaryResetInitializedVar} = false;`);
    emit(context, indent, `let ${boundaryResetValueVar};`);
    emit(context, indent, `const ${boundaryResetStopVar} = effect(() => {`);
    emit(context, indent + 1, `const ${boundaryResetNextVar} = unwrap(${resetKeyExpression});`);
    emit(context, indent + 1, `if (!${boundaryResetInitializedVar}) { ${boundaryResetInitializedVar} = true; ${boundaryResetValueVar} = ${boundaryResetNextVar}; return; }`);
    emit(context, indent + 1, `if (Object.is(${boundaryResetValueVar}, ${boundaryResetNextVar})) { return; }`);
    emit(context, indent + 1, `${boundaryResetValueVar} = ${boundaryResetNextVar};`);
    emit(context, indent + 1, `${renderVar}();`);
    emit(context, indent, "});");
    emit(context, indent, `${cleanupVar}.push(${boundaryResetStopVar});`);
  }
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `__mikuru_runCleanup(${boundaryCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `${startVar}.remove();`);
  emit(context, indent + 1, `${endVar}.remove();`);
  emit(context, indent, "});");
  return startVar;
}

function generateAsyncBoundary(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validateAsyncBoundaryAttributes(context, node);
  const children = getAsyncBoundaryChildren(context, node);
  const loadingExpression = getAsyncBoundaryLoadingExpression(context, node);
  const fallbackExpression = getAsyncBoundaryFallbackExpression(context, node);
  const delayExpression = getAsyncBoundaryDelayExpression(context, node);
  const timeoutExpression = getAsyncBoundaryTimeoutExpression(context, node);
  const startVar = nextVar(context, "asyncBoundaryStart");
  const endVar = nextVar(context, "asyncBoundaryEnd");
  const boundaryCleanupVar = nextVar(context, "asyncBoundaryCleanup");
  const loadingCleanupVar = nextVar(context, "asyncBoundaryLoadingCleanup");
  const fallbackCleanupVar = nextVar(context, "asyncBoundaryFallbackCleanup");
  const pendingVar = nextVar(context, "asyncBoundaryPending");
  const failedVar = nextVar(context, "asyncBoundaryFailed");
  const lastRetryVar = nextVar(context, "asyncBoundaryRetry");
  const renderLoadingVar = nextVar(context, "renderAsyncBoundaryLoading");
  const clearLoadingVar = nextVar(context, "clearAsyncBoundaryLoading");
  const renderFallbackVar = nextVar(context, "renderAsyncBoundaryFallback");
  const clearFallbackVar = nextVar(context, "clearAsyncBoundaryFallback");
  const scheduleLoadingVar = nextVar(context, "scheduleAsyncBoundaryLoading");
  const scheduleTimeoutVar = nextVar(context, "scheduleAsyncBoundaryTimeout");
  const clearTimersVar = nextVar(context, "clearAsyncBoundaryTimers");
  const renderVar = nextVar(context, "renderAsyncBoundary");
  const loadingVar = nextVar(context, "asyncBoundaryLoading");
  const loadingFragmentVar = nextVar(context, "asyncBoundaryLoading");
  const loadingInstanceVar = nextVar(context, "asyncBoundaryLoading");
  const fallbackVar = nextVar(context, "asyncBoundaryFallback");
  const fallbackFragmentVar = nextVar(context, "asyncBoundaryFallback");
  const fallbackInstanceVar = nextVar(context, "asyncBoundaryFallback");
  const errorVar = nextVar(context, "error");
  const errorInfoVar = nextVar(context, "errorInfo");
  const errorsVar = nextVar(context, "asyncBoundaryErrors");
  const normalizedErrorInfoVar = nextVar(context, "errorInfo");
  const retryVar = nextVar(context, "retry");
  const settledVar = nextVar(context, "settled");
  const delayVar = nextVar(context, "asyncBoundaryDelay");
  const timeoutVar = nextVar(context, "asyncBoundaryTimeout");
  const delayTimerVar = nextVar(context, "asyncBoundaryDelayTimer");
  const timeoutTimerVar = nextVar(context, "asyncBoundaryTimeoutTimer");
  const timeoutErrorVar = nextVar(context, "asyncBoundaryTimeoutError");
  const asyncContextVar = nextVar(context, "asyncBoundaryContext");
  const previousComponentContextVar = context.componentContextVar;
  emit(context, indent, `const ${startVar} = document.createComment("async-boundary");`);
  emit(context, indent, `const ${endVar} = document.createComment("/async-boundary");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${boundaryCleanupVar} = [];`);
  emit(context, indent, `const ${loadingCleanupVar} = [];`);
  emit(context, indent, `const ${fallbackCleanupVar} = [];`);
  emit(context, indent, `let ${pendingVar} = 0;`);
  emit(context, indent, `let ${failedVar} = false;`);
  emit(context, indent, `let ${errorsVar} = [];`);
  emit(context, indent, `let ${lastRetryVar} = () => {};`);
  emit(context, indent, `let ${delayTimerVar};`);
  emit(context, indent, `let ${timeoutTimerVar};`);
  emit(context, indent, `const ${clearLoadingVar} = () => __mikuru_runCleanup(${loadingCleanupVar});`);
  emit(context, indent, `const ${clearFallbackVar} = () => __mikuru_runCleanup(${fallbackCleanupVar});`);
  emit(context, indent, `const ${clearTimersVar} = () => {`);
  emit(context, indent + 1, `if (${delayTimerVar}) { clearTimeout(${delayTimerVar}); ${delayTimerVar} = undefined; }`);
  emit(context, indent + 1, `if (${timeoutTimerVar}) { clearTimeout(${timeoutTimerVar}); ${timeoutTimerVar} = undefined; }`);
  emit(context, indent, "};");
  emit(context, indent, `const ${renderLoadingVar} = () => {`);
  emit(context, indent + 1, `if (${failedVar}) { return; }`);
  emit(context, indent + 1, `${clearLoadingVar}();`);
  emit(context, indent + 1, `const ${loadingVar} = unwrap(${loadingExpression});`);
  emit(context, indent + 1, `if (!${loadingVar} || typeof ${loadingVar}.mount !== "function") { return; }`);
  emit(context, indent + 1, `const ${loadingFragmentVar} = document.createDocumentFragment();`);
  emit(context, indent + 1, `const ${loadingInstanceVar} = ${loadingVar}.mount(${loadingFragmentVar}, { pending: ${pendingVar}, __mikuru_context });`);
  emit(context, indent + 1, `${loadingCleanupVar}.push(() => ${loadingInstanceVar}.unmount());`);
  appendNode(context, parentVar, loadingFragmentVar, indent + 1, endVar);
  emit(context, indent, "};");
  emit(context, indent, `const ${renderFallbackVar} = (${errorVar}, ${errorInfoVar} = __mikuru_errorInfo("async-loader")) => {`);
  emit(context, indent + 1, `${failedVar} = true;`);
  emit(context, indent + 1, `${clearTimersVar}();`);
  emit(context, indent + 1, `${clearLoadingVar}();`);
  emit(context, indent + 1, `${clearFallbackVar}();`);
  emit(context, indent + 1, `__mikuru_runCleanup(${boundaryCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `const ${fallbackVar} = unwrap(${fallbackExpression});`);
  emit(context, indent + 1, `if (!${fallbackVar} || typeof ${fallbackVar}.mount !== "function") { throw ${errorVar}; }`);
  emit(context, indent + 1, `const ${normalizedErrorInfoVar} = ${errorInfoVar} && typeof ${errorInfoVar} === "object" ? ${errorInfoVar} : {};`);
  if (context.debug) {
    emit(context, indent + 1, `emitDebugEvent("async:rejected", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id, error: ${errorVar}, errors: [...${errorsVar}], pending: ${pendingVar}, errorInfo: { ...${normalizedErrorInfoVar}, boundary: __mikuru_componentInfo }, diagnostic: createDebugDiagnostic("runtime", "error", ${errorVar} instanceof Error ? ${errorVar}.message : String(${errorVar}), { ...${normalizedErrorInfoVar}, boundary: __mikuru_componentInfo, error: ${errorVar} }) });`);
  }
  emit(context, indent + 1, `const ${fallbackFragmentVar} = document.createDocumentFragment();`);
  emit(context, indent + 1, `const ${fallbackInstanceVar} = ${fallbackVar}.mount(${fallbackFragmentVar}, { error: ${errorVar}, errors: [...${errorsVar}], errorInfo: { ...${normalizedErrorInfoVar}, boundary: __mikuru_componentInfo }, pending: ${pendingVar}, retry: ${lastRetryVar}, reset: ${lastRetryVar}, __mikuru_context });`);
  emit(context, indent + 1, `${fallbackCleanupVar}.push(() => ${fallbackInstanceVar}.unmount());`);
  appendNode(context, parentVar, fallbackFragmentVar, indent + 1, endVar);
  emit(context, indent, "};");
  emit(context, indent, `const ${scheduleLoadingVar} = () => {`);
  emit(context, indent + 1, `const ${delayVar} = Number(unwrap(${delayExpression}) ?? 0);`);
  emit(context, indent + 1, `if (${delayVar} <= 0) { ${renderLoadingVar}(); return; }`);
  emit(context, indent + 1, `if (${delayTimerVar}) { return; }`);
  emit(context, indent + 1, `${delayTimerVar} = setTimeout(() => {`);
  emit(context, indent + 2, `${delayTimerVar} = undefined;`);
  emit(context, indent + 2, `if (${pendingVar} > 0 && !${failedVar}) { ${renderLoadingVar}(); }`);
  emit(context, indent + 1, `}, ${delayVar});`);
  emit(context, indent, "};");
  emit(context, indent, `const ${scheduleTimeoutVar} = () => {`);
  emit(context, indent + 1, `const ${timeoutVar} = unwrap(${timeoutExpression});`);
  emit(context, indent + 1, `if (${timeoutVar} == null || Number(${timeoutVar}) <= 0 || ${timeoutTimerVar}) { return; }`);
  emit(context, indent + 1, `${timeoutTimerVar} = setTimeout(() => {`);
  emit(context, indent + 2, `${timeoutTimerVar} = undefined;`);
  emit(context, indent + 2, `if (${pendingVar} <= 0 || ${failedVar}) { return; }`);
  emit(context, indent + 2, `const ${timeoutErrorVar} = new Error("Async boundary timed out");`);
  emit(context, indent + 2, `${errorsVar}.push(${timeoutErrorVar});`);
  emit(context, indent + 2, `${renderFallbackVar}(${timeoutErrorVar}, __mikuru_errorInfo("async-timeout"));`);
  emit(context, indent + 1, `}, Number(${timeoutVar}));`);
  emit(context, indent, "};");
  emit(context, indent, `const ${asyncContextVar} = { parent: __mikuru_context, provides: new Map(), errorHandler: __mikuru_context.errorHandler, asyncBoundary: {`);
  emit(context, indent + 1, `start({ retry: ${retryVar} }) {`);
  emit(context, indent + 2, `${pendingVar} += 1;`);
  emit(context, indent + 2, `${lastRetryVar} = ${renderVar};`);
  if (context.debug) {
    emit(context, indent + 2, `emitDebugEvent("async:pending", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id, pending: ${pendingVar} });`);
  }
  emit(context, indent + 2, `if (${pendingVar} === 1) { ${scheduleLoadingVar}(); ${scheduleTimeoutVar}(); } else if (${loadingCleanupVar}.length > 0) { ${renderLoadingVar}(); }`);
  emit(context, indent + 2, `let ${settledVar} = false;`);
  emit(context, indent + 2, "return {");
  emit(context, indent + 3, "resolve() {");
  emit(context, indent + 4, `if (${settledVar}) { return; }`);
  emit(context, indent + 4, `${settledVar} = true;`);
  emit(context, indent + 4, `${pendingVar} = Math.max(0, ${pendingVar} - 1);`);
  if (context.debug) {
    emit(context, indent + 4, `emitDebugEvent("async:resolved", { component: __mikuru_componentInfo, componentId: __mikuru_debug.id, pending: ${pendingVar} });`);
  }
  emit(context, indent + 4, `if (${pendingVar} === 0) { ${clearTimersVar}(); ${clearLoadingVar}(); } else if (${loadingCleanupVar}.length > 0) { ${renderLoadingVar}(); }`);
  emit(context, indent + 3, "},");
  emit(context, indent + 3, `reject(${errorVar}, ${errorInfoVar}) {`);
  emit(context, indent + 4, `if (${settledVar}) { return; }`);
  emit(context, indent + 4, `${settledVar} = true;`);
  emit(context, indent + 4, `${pendingVar} = Math.max(0, ${pendingVar} - 1);`);
  emit(context, indent + 4, `${errorsVar}.push(${errorVar});`);
  emit(context, indent + 4, `${clearTimersVar}();`);
  emit(context, indent + 4, `${renderFallbackVar}(${errorVar}, ${errorInfoVar});`);
  emit(context, indent + 3, "}");
  emit(context, indent + 2, "};");
  emit(context, indent + 1, "}");
  emit(context, indent, `}, ...__mikuru_componentInfo };`);
  emit(context, indent, `const ${renderVar} = () => {`);
  emit(context, indent + 1, `${failedVar} = false;`);
  emit(context, indent + 1, `${pendingVar} = 0;`);
  emit(context, indent + 1, `${errorsVar} = [];`);
  emit(context, indent + 1, `${lastRetryVar} = ${renderVar};`);
  emit(context, indent + 1, `${clearTimersVar}();`);
  emit(context, indent + 1, `${clearLoadingVar}();`);
  emit(context, indent + 1, `${clearFallbackVar}();`);
  emit(context, indent + 1, `__mikuru_runCleanup(${boundaryCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  context.componentContextVar = asyncContextVar;
  generateChildren(context, children, parentVar, boundaryCleanupVar, indent + 1, endVar);
  context.componentContextVar = previousComponentContextVar;
  emit(context, indent, "};");
  emit(context, indent, `${renderVar}();`);
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${clearTimersVar}();`);
  emit(context, indent + 1, `${clearLoadingVar}();`);
  emit(context, indent + 1, `${clearFallbackVar}();`);
  emit(context, indent + 1, `__mikuru_runCleanup(${boundaryCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `${startVar}.remove();`);
  emit(context, indent + 1, `${endVar}.remove();`);
  emit(context, indent, "});");
  return startVar;
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

function generateDynamicComponent(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string,
  transitionVar?: string
): string {
  const isAttr = node.attrs.find((attr) => getBindingName(attr.name) === "is");

  if (!isAttr) {
    throwTemplateError("Dynamic component requires :is to resolve to a component object", context, node.loc);
  }

  const expression = compileTemplateExpression(requireAttrValue(isAttr), isAttr.name, toExpressionContext(context, isAttr.valueLoc));
  const dynamicNode = withoutAttrs(node, ["is", ":is", "v-bind:is"]);
  const startVar = nextVar(context, "componentStart");
  const endVar = nextVar(context, "componentEnd");
  const branchCleanupVar = nextVar(context, "componentCleanup");
  const componentTypeVar = nextVar(context, "componentType");
  const currentTypeVar = nextVar(context, "currentComponent");
  const currentInstanceVar = nextVar(context, "currentComponent");
  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${startVar} = document.createComment("component");`);
  emit(context, indent, `const ${endVar} = document.createComment("/component");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${branchCleanupVar} = [];`);
  emit(context, indent, `let ${currentTypeVar};`);
  emit(context, indent, `let ${currentInstanceVar};`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${componentTypeVar} = unwrap(${expression});`);
  emit(context, indent + 1, `if (${componentTypeVar} === ${currentTypeVar}) { return; }`);
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `if (!${componentTypeVar}) {`);
  emit(context, indent + 2, `${currentTypeVar} = ${componentTypeVar};`);
  emit(context, indent + 2, `${currentInstanceVar} = null;`);
  emit(context, indent + 2, "return;");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `if (typeof ${componentTypeVar} !== "object" || typeof ${componentTypeVar}.mount !== "function") {`);
  emit(context, indent + 2, `throw new Error("Dynamic component :is must resolve to a component object with mount()");`);
  emit(context, indent + 1, "}");
  const fragmentVar = nextVar(context, "fragment");
  const attrsVar = nextVar(context, "attrs");
  const propsVar = nextVar(context, "props");
  const componentVar = nextVar(context, "component");
  emit(context, indent + 1, `const ${fragmentVar} = document.createDocumentFragment();`);
  emitComponentAttrs(context, dynamicNode, attrsVar, indent + 1);
  emitComponentProps(context, dynamicNode, propsVar, attrsVar, indent + 1);
  emit(context, indent + 1, `const ${componentVar} = ${componentTypeVar}.mount(${fragmentVar}, ${propsVar});`);
  if (context.scopeAttr) {
    emit(context, indent + 1, `if (${componentVar}.element?.nodeType === 1) {`);
    emit(context, indent + 2, `${componentVar}.element.setAttribute(${quote(context.scopeAttr)}, "");`);
    emit(context, indent + 1, "}");
  }
  emit(context, indent + 1, `if (${componentTypeVar}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context, dynamicNode, componentVar, branchCleanupVar, indent + 2);
  emit(context, indent + 1, "}");
  emitComponentShow(context, dynamicNode, componentVar, branchCleanupVar, indent + 1);
  emit(context, indent + 1, `${branchCleanupVar}.push(() => ${componentVar}.unmount());`);
  emitTemplateRef(context, dynamicNode, componentVar, branchCleanupVar, indent + 1);
  appendNode(context, parentVar, fragmentVar, indent + 1, endVar);
  if (transitionVar) {
    emitTransitionRegistration(context, `${componentVar}.element`, transitionVar, indent + 1);
  }
  emit(context, indent + 1, `${currentTypeVar} = ${componentTypeVar};`);
  emit(context, indent + 1, `${currentInstanceVar} = ${componentVar};`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emit(context, indent, "});");
  return startVar;
}

function generateKeepAlive(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validateKeepAliveAttributes(context, node);
  const children = getSingleElementChild(context, node, "<KeepAlive>");
  const child = children[0];

  if (child.tag !== "component") {
    throwTemplateError("<KeepAlive> requires a single <component :is=\"...\" /> child in v1", context, child.loc);
  }

  const isAttr = child.attrs.find((attr) => getBindingName(attr.name) === "is");

  if (!isAttr) {
    throwTemplateError("<KeepAlive> dynamic child requires :is to resolve to a component object", context, child.loc);
  }

  const expression = compileTemplateExpression(requireAttrValue(isAttr), isAttr.name, toExpressionContext(context, isAttr.valueLoc));
  const includeExpression = getKeepAliveOptionExpression(context, node, "include");
  const excludeExpression = getKeepAliveOptionExpression(context, node, "exclude");
  const maxExpression = getKeepAliveOptionExpression(context, node, "max");
  const dynamicNode = withoutAttrs(child, ["is", ":is", "v-bind:is"]);
  const startVar = nextVar(context, "keepAliveStart");
  const endVar = nextVar(context, "keepAliveEnd");
  const cacheVar = nextVar(context, "keepAliveCache");
  const currentTypeVar = nextVar(context, "keepAliveCurrent");
  const currentRecordVar = nextVar(context, "keepAliveCurrent");
  const componentTypeVar = nextVar(context, "keepAliveType");
  const componentNameVar = nextVar(context, "keepAliveName");
  const componentNameHelperVar = nextVar(context, "keepAliveName");
  const matchHelperVar = nextVar(context, "keepAliveMatches");
  const includeVar = nextVar(context, "keepAliveInclude");
  const excludeVar = nextVar(context, "keepAliveExclude");
  const maxVar = nextVar(context, "keepAliveMax");
  const cacheableVar = nextVar(context, "keepAliveCacheable");
  const recordVar = nextVar(context, "keepAliveRecord");
  const recordNodesVar = nextVar(context, "keepAliveNodes");
  const activateRecordVar = nextVar(context, "keepAliveActivate");
  const deactivateRecordVar = nextVar(context, "keepAliveDeactivate");
  const collectNodesVar = nextVar(context, "keepAliveCollectNodes");
  const collectNodeVar = nextVar(context, "keepAliveNode");
  const staleKeyVar = nextVar(context, "keepAliveStaleKey");
  const staleRecordVar = nextVar(context, "keepAliveStaleRecord");
  const fragmentVar = nextVar(context, "fragment");
  const attrsVar = nextVar(context, "attrs");
  const propsVar = nextVar(context, "props");
  const componentVar = nextVar(context, "component");
  const recordCleanupVar = nextVar(context, "keepAliveCleanup");
  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${startVar} = document.createComment("keep-alive");`);
  emit(context, indent, `const ${endVar} = document.createComment("/keep-alive");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${cacheVar} = new Map();`);
  emit(context, indent, `let ${currentTypeVar};`);
  emit(context, indent, `let ${currentRecordVar};`);
  emit(context, indent, `const ${componentNameHelperVar} = (component) => component?.name ?? component?.displayName ?? component?.__name ?? component?.constructor?.name ?? "";`);
  emit(context, indent, `const ${matchHelperVar} = (pattern, name) => pattern == null ? false : typeof pattern === "string" ? pattern.split(",").map((part) => part.trim()).filter(Boolean).includes(name) : Array.isArray(pattern) ? pattern.some((entry) => ${matchHelperVar}(entry, name)) : pattern instanceof RegExp ? pattern.test(name) : false;`);
  emit(context, indent, `const ${activateRecordVar} = (record) => { if (record && !record.active) { record.active = true; record.instance.activate?.(); } };`);
  emit(context, indent, `const ${deactivateRecordVar} = (record) => { if (record?.active) { record.active = false; record.instance.deactivate?.(); } };`);
  emit(context, indent, `const ${collectNodesVar} = () => { const nodes = []; for (let ${collectNodeVar} = ${startVar}.nextSibling; ${collectNodeVar} && ${collectNodeVar} !== ${endVar}; ${collectNodeVar} = ${collectNodeVar}.nextSibling) { nodes.push(${collectNodeVar}); } return nodes; };`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${componentTypeVar} = unwrap(${expression});`);
  emit(context, indent + 1, `if (${componentTypeVar} === ${currentTypeVar}) { return; }`);
  emit(context, indent + 1, `if (${currentRecordVar}) { ${currentRecordVar}.nodes = ${collectNodesVar}(); }`);
  emit(context, indent + 1, `if (${currentRecordVar}?.transient) { __mikuru_runCleanup(${currentRecordVar}.cleanups); } else { ${deactivateRecordVar}(${currentRecordVar}); }`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `if (!${componentTypeVar}) { ${currentTypeVar} = ${componentTypeVar}; ${currentRecordVar} = undefined; return; }`);
  emit(context, indent + 1, `if (typeof ${componentTypeVar} !== "object" || typeof ${componentTypeVar}.mount !== "function") {`);
  emit(context, indent + 2, `throw new Error("KeepAlive child :is must resolve to a component object with mount()");`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `const ${componentNameVar} = ${componentNameHelperVar}(${componentTypeVar});`);
  emit(context, indent + 1, `const ${includeVar} = unwrap(${includeExpression ?? "undefined"});`);
  emit(context, indent + 1, `const ${excludeVar} = unwrap(${excludeExpression ?? "undefined"});`);
  emit(context, indent + 1, `const ${maxVar} = Number(unwrap(${maxExpression ?? "undefined"}));`);
  emit(context, indent + 1, `const ${cacheableVar} = (${includeVar} == null || ${matchHelperVar}(${includeVar}, ${componentNameVar})) && !${matchHelperVar}(${excludeVar}, ${componentNameVar});`);
  emit(context, indent + 1, `if (!${cacheableVar}) {`);
  emit(context, indent + 2, `const ${fragmentVar} = document.createDocumentFragment();`);
  emit(context, indent + 2, `const ${recordCleanupVar} = [];`);
  emitComponentAttrs(context, dynamicNode, attrsVar, indent + 2);
  emitComponentProps(context, dynamicNode, propsVar, attrsVar, indent + 2);
  emit(context, indent + 2, `const ${componentVar} = ${componentTypeVar}.mount(${fragmentVar}, ${propsVar});`);
  if (context.scopeAttr) {
    emit(context, indent + 2, `if (${componentVar}.element?.nodeType === 1) {`);
    emit(context, indent + 3, `${componentVar}.element.setAttribute(${quote(context.scopeAttr)}, "");`);
    emit(context, indent + 2, "}");
  }
  emit(context, indent + 2, `if (${componentTypeVar}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context, dynamicNode, componentVar, recordCleanupVar, indent + 3);
  emit(context, indent + 2, "}");
  emitComponentShow(context, dynamicNode, componentVar, recordCleanupVar, indent + 2);
  emitTemplateRef(context, dynamicNode, componentVar, recordCleanupVar, indent + 2);
  emit(context, indent + 2, `const ${recordNodesVar} = Array.from(${fragmentVar}.childNodes);`);
  appendNode(context, parentVar, fragmentVar, indent + 2, endVar);
  emit(context, indent + 2, `${currentTypeVar} = ${componentTypeVar};`);
  emit(context, indent + 2, `${currentRecordVar} = { instance: ${componentVar}, element: ${componentVar}.element, nodes: ${recordNodesVar}, cleanups: ${recordCleanupVar}, transient: true };`);
  emit(context, indent + 2, `${recordCleanupVar}.push(() => ${componentVar}.unmount());`);
  emit(context, indent + 2, "return;");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `let ${recordVar} = ${cacheVar}.get(${componentTypeVar});`);
  emit(context, indent + 1, `if (!${recordVar}) {`);
  emit(context, indent + 2, `const ${fragmentVar} = document.createDocumentFragment();`);
  emit(context, indent + 2, `const ${recordCleanupVar} = [];`);
  emitComponentAttrs(context, dynamicNode, attrsVar, indent + 2);
  emitComponentProps(context, dynamicNode, propsVar, attrsVar, indent + 2);
  emit(context, indent + 2, `const ${componentVar} = ${componentTypeVar}.mount(${fragmentVar}, ${propsVar});`);
  if (context.scopeAttr) {
    emit(context, indent + 2, `if (${componentVar}.element?.nodeType === 1) {`);
    emit(context, indent + 3, `${componentVar}.element.setAttribute(${quote(context.scopeAttr)}, "");`);
    emit(context, indent + 2, "}");
  }
  emit(context, indent + 2, `if (${componentTypeVar}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context, dynamicNode, componentVar, recordCleanupVar, indent + 3);
  emit(context, indent + 2, "}");
  emitComponentShow(context, dynamicNode, componentVar, recordCleanupVar, indent + 2);
  emitTemplateRef(context, dynamicNode, componentVar, recordCleanupVar, indent + 2);
  emit(context, indent + 2, `const ${recordNodesVar} = Array.from(${fragmentVar}.childNodes);`);
  emit(context, indent + 2, `${recordVar} = { instance: ${componentVar}, element: ${componentVar}.element, nodes: ${recordNodesVar}, cleanups: ${recordCleanupVar}, active: false };`);
  emit(context, indent + 2, `${cacheVar}.set(${componentTypeVar}, ${recordVar});`);
  emit(context, indent + 2, `if (Number.isFinite(${maxVar}) && ${maxVar} > 0) {`);
  emit(context, indent + 3, `while (${cacheVar}.size > ${maxVar}) {`);
  emit(context, indent + 4, `const ${staleKeyVar} = ${cacheVar}.keys().next().value;`);
  emit(context, indent + 4, `if (${staleKeyVar} === ${componentTypeVar}) { break; }`);
  emit(context, indent + 4, `const ${staleRecordVar} = ${cacheVar}.get(${staleKeyVar});`);
  emit(context, indent + 4, `${cacheVar}.delete(${staleKeyVar});`);
  emit(context, indent + 4, `if (${staleRecordVar}) { ${deactivateRecordVar}(${staleRecordVar}); __mikuru_runCleanup(${staleRecordVar}.cleanups); ${staleRecordVar}.instance.unmount(); }`);
  emit(context, indent + 3, "}");
  emit(context, indent + 2, "}");
  appendNode(context, parentVar, fragmentVar, indent + 2, endVar);
  emit(context, indent + 1, "} else {");
  emit(context, indent + 2, `${cacheVar}.delete(${componentTypeVar});`);
  emit(context, indent + 2, `${cacheVar}.set(${componentTypeVar}, ${recordVar});`);
  emit(context, indent + 2, `for (const node of ${recordVar}.nodes) { ${parentVar}.insertBefore(node, ${endVar}); }`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${currentTypeVar} = ${componentTypeVar};`);
  emit(context, indent + 1, `${currentRecordVar} = ${recordVar};`);
  emit(context, indent + 1, `${activateRecordVar}(${recordVar});`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `if (${currentRecordVar}?.transient) { __mikuru_runCleanup(${currentRecordVar}.cleanups); } else { ${deactivateRecordVar}(${currentRecordVar}); }`);
  emit(context, indent + 1, `for (const ${recordVar} of ${cacheVar}.values()) { __mikuru_runCleanup(${recordVar}.cleanups); ${recordVar}.instance.unmount(); }`);
  emit(context, indent + 1, `${cacheVar}.clear();`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  emit(context, indent + 1, `${startVar}.remove();`);
  emit(context, indent + 1, `${endVar}.remove();`);
  emit(context, indent, "});");
  return startVar;
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
    .map((attr) => {
      validateObjectBindModifiers(parseObjectBindDirective(attr.name) ?? { modifiers: [] }, attr, context, "component");
      return compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    });
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
    .map((attr) => {
      validateObjectBindModifiers(parseObjectBindDirective(attr.name) ?? { modifiers: [] }, attr, context, "component");
      return compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    });
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

  validateAttributes(context, node);

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

  const contentDirective = getContentDirectiveAttr(node);
  if (contentDirective) {
    emitContentDirective(context, node, elementVar, contentDirective, cleanupVar, indent);
  } else {
    generateChildren(context, node.children, elementVar, cleanupVar, indent);
  }

  for (const attr of node.attrs) {
    const modelDirective = parseModelDirective(attr.name);

    if (modelDirective) {
      validateModelModifiers(modelDirective, attr, context);
      if (modelDirective.argument) {
        throwTemplateError("v-model arguments are only supported on components in v1", context, attr.loc);
      }
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
          ? `(() => { const value = unwrap(${expression}); const checkboxValue = ${modelElementValueExpression(`${elementVar}`, modelDirective.modifiers)}; return Array.isArray(value) ? value.some((item) => Object.is(item, checkboxValue)) : Boolean(value); })()`
          : modelMode === "radio"
            ? `Object.is(${modelElementValueExpression(`${elementVar}`, modelDirective.modifiers)}, unwrap(${expression}))`
            : modelMode === "select-multiple"
              ? `Array.from(${elementVar}.options).forEach((option) => { const optionValue = ${modelElementValueExpression("option", modelDirective.modifiers)}; option.selected = (unwrap(${expression}) ?? []).some((item) => Object.is(item, optionValue)); })`
              : modelMode === "select"
                ? `Array.from(${elementVar}.options).forEach((option) => { option.selected = Object.is(${modelElementValueExpression("option", modelDirective.modifiers)}, unwrap(${expression})); })`
              : `String(unwrap(${expression}) ?? "")`;
      const assignedValue = modelAssignedValue(modelMode, modelDirective.modifiers, expression);

      emit(context, indent, `const ${stopVar} = effect(() => {`);
      if (modelMode === "select-multiple" || modelMode === "select") {
        emit(context, indent + 1, renderedValue);
      } else {
        emit(context, indent + 1, `if (${elementVar}.${propertyName} !== ${renderedValue}) {`);
        emit(context, indent + 2, `${elementVar}.${propertyName} = ${renderedValue};`);
        emit(context, indent + 1, "}");
      }
      emit(context, indent, "});");
      emit(context, indent, `${cleanupVar}.push(${stopVar});`);
      emit(context, indent, `const ${handlerVar} = __mikuru_guardEventHandler(($event) => {`);
      emit(context, indent + 1, `${expression}.value = ${assignedValue};`);
      emit(context, indent, "});");
      emit(context, indent, `${elementVar}.addEventListener(${quote(eventName)}, ${handlerVar});`);
      emit(context, indent, `${cleanupVar}.push(() => ${elementVar}.removeEventListener(${quote(eventName)}, ${handlerVar}));`);
      continue;
    }

    if (attr.name === "v-show") {
      const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
      if (context.once) {
        emit(context, indent, `${elementVar}.style.display = unwrap(${expression}) ? "" : "none";`);
      } else {
        const stopVar = nextVar(context, "stop");
        emit(context, indent, `const ${stopVar} = effect(() => {`);
        emit(context, indent + 1, `${elementVar}.style.display = unwrap(${expression}) ? "" : "none";`);
        emit(context, indent, "});");
        emit(context, indent, `${cleanupVar}.push(${stopVar});`);
      }
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
      const handler = validateEventHandlerExpression(requireAttrValue(attr), context, attr.valueLoc);
      const handlerVar = nextVar(context, "handler");
      const handlerExpression = eventHandlerExpression(handler, context, attr.valueLoc);

      if (event.modifiers.length) {
        const baseHandlerVar = nextVar(context, "handler");
        const errorHandlerVar = nextVar(context, "errorHandler");
        emit(context, indent, `const ${baseHandlerVar} = ${handlerExpression};`);
        emit(context, indent, `const ${errorHandlerVar} = __mikuru_context.errorHandler;`);
        emit(context, indent, `const ${handlerVar} = ($event) => __mikuru_try(() => {`);

        if (event.modifiers.includes("self")) {
          emit(context, indent + 1, `if ($event.target !== ${elementVar}) { return; }`);
        }

        const modifierGuard = eventModifierGuardExpression(event);
        if (modifierGuard) {
          emit(context, indent + 1, `if (${modifierGuard}) { return; }`);
        }

        if (event.modifiers.includes("prevent")) {
          emit(context, indent + 1, "$event.preventDefault();");
        }

        if (event.modifiers.includes("stop")) {
          emit(context, indent + 1, "$event.stopPropagation();");
        }

        emit(context, indent + 1, `return ${baseHandlerVar}($event);`);
        emit(context, indent, `}, ${errorHandlerVar}, "event");`);
      } else {
        emit(context, indent, `const ${handlerVar} = __mikuru_guardEventHandler(${handlerExpression});`);
      }

      if (event.nameExpression) {
        emitDynamicEventListener(context, elementVar, event, handlerVar, attr, cleanupVar, indent);
      } else {
        const eventOptions = eventListenerOptions(event);
        emit(context, indent, `${elementVar}.addEventListener(${quote(event.name ?? "")}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
        emit(context, indent, `${cleanupVar}.push(() => ${elementVar}.removeEventListener(${quote(event.name ?? "")}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}));`);
      }
      continue;
    }

    const bindDirective = parseBindDirective(attr.name);
    const dynamicBinding = bindDirective?.nameExpression ? bindDirective : undefined;

    if (dynamicBinding) {
      validateBindModifiers(dynamicBinding, attr, context, "element");
      emitDynamicAttributeBinding(context, node, elementVar, attr, dynamicBinding, cleanupVar, indent);
      continue;
    }

    const bindingName = bindDirective?.name;

    if (bindingName && bindDirective) {
      validateBindModifiers(bindDirective, attr, context, "element");
      if (bindingName === "ref") {
        continue;
      }

      const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
      const stopVar = nextVar(context, "stop");
      const staticClass = getStaticAttrValue(node, "class");
      const staticStyle = getStaticAttrValue(node, "style");
      const valueExpression =
        bindingName === "class" && staticClass
          ? `[${quote(staticClass)}, ${expression}]`
          : bindingName === "style" && staticStyle
            ? `[${quote(staticStyle)}, ${expression}]`
          : expression;
      if (context.once) {
        emit(context, indent, `setAttribute(${elementVar}, ${quote(bindingName)}, unwrap(${valueExpression})${bindOptionsExpression(bindDirective)});`);
      } else {
        emit(context, indent, `const ${stopVar} = effect(() => {`);
        emit(context, indent + 1, `setAttribute(${elementVar}, ${quote(bindingName)}, unwrap(${valueExpression})${bindOptionsExpression(bindDirective)});`);
        emit(context, indent, "});");
        emit(context, indent, `${cleanupVar}.push(${stopVar});`);
      }
    }
  }

  appendNode(context, parentVar, elementVar, indent, beforeVar);
  return elementVar;
}

function emitDynamicAttributeBinding(
  context: GenerateContext,
  node: ElementNode,
  elementVar: string,
  attr: TemplateAttribute,
  binding: BindDirective,
  cleanupVar: string,
  indent: number
): void {
  const compiledName = compileTemplateExpression(binding.nameExpression ?? "", attr.name, toExpressionContext(context, attr.loc));
  const compiledValue = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
  const staticClass = getStaticAttrValue(node, "class");
  const staticStyle = getStaticAttrValue(node, "style");
  const previousNameVar = nextVar(context, "attrName");
  const nameVar = nextVar(context, "attrName");
  const valueVar = nextVar(context, "attrValue");
  const stopVar = nextVar(context, "stop");

  emit(context, indent, `let ${previousNameVar};`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${nameVar} = ${bindNameExpression(`String(unwrap(${compiledName}) ?? "")`, binding)};`);
  emit(context, indent + 1, `if (!${nameVar}) { if (${previousNameVar}) setAttribute(${elementVar}, ${previousNameVar}, null); ${previousNameVar} = undefined; return; }`);
  emit(context, indent + 1, `if (${previousNameVar} && ${previousNameVar} !== ${nameVar}) { setAttribute(${elementVar}, ${previousNameVar}, null); }`);
  emit(context, indent + 1, `const ${valueVar} = unwrap(${compiledValue});`);
  if (staticClass || staticStyle) {
    emit(context, indent + 1, `setAttribute(${elementVar}, ${nameVar}, ${nameVar} === "class" && ${staticClass ? "true" : "false"} ? [${quote(staticClass ?? "")}, ${valueVar}] : ${nameVar} === "style" && ${staticStyle ? "true" : "false"} ? [${quote(staticStyle ?? "")}, ${valueVar}] : ${valueVar}${bindOptionsExpression(binding)});`);
  } else {
    emit(context, indent + 1, `setAttribute(${elementVar}, ${nameVar}, ${valueVar}${bindOptionsExpression(binding)});`);
  }
  emit(context, indent + 1, `${previousNameVar} = ${nameVar};`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => { ${stopVar}(); if (${previousNameVar}) setAttribute(${elementVar}, ${previousNameVar}, null); });`);
}

function emitDynamicEventListener(
  context: GenerateContext,
  elementVar: string,
  event: EventDirective,
  handlerVar: string,
  attr: TemplateAttribute,
  cleanupVar: string,
  indent: number
): void {
  const expression = compileTemplateExpression(event.nameExpression ?? "\"\"", attr.name, toExpressionContext(context, attr.loc));
  const currentEventVar = nextVar(context, "eventName");
  const nextEventVar = nextVar(context, "eventName");
  const stopVar = nextVar(context, "stop");
  const eventOptions = eventListenerOptions(event);

  emit(context, indent, `let ${currentEventVar};`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${nextEventVar} = String(unwrap(${expression}) ?? "");`);
  emit(context, indent + 1, `if (${nextEventVar} === ${currentEventVar}) { return; }`);
  emit(context, indent + 1, `if (${currentEventVar}) { ${elementVar}.removeEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}); }`);
  emit(context, indent + 1, `${currentEventVar} = ${nextEventVar};`);
  emit(context, indent + 1, `if (${currentEventVar}) { ${elementVar}.addEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}); }`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => { ${stopVar}(); if (${currentEventVar}) { ${elementVar}.removeEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}); } });`);
}

function emitContentDirective(
  context: GenerateContext,
  node: ElementNode,
  elementVar: string,
  attr: TemplateAttribute,
  cleanupVar: string,
  indent: number
): void {
  const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
  const property = attr.name === "v-html" ? "innerHTML" : "textContent";

  if (context.once) {
    emit(context, indent, `${elementVar}.${property} = String(unwrap(${expression}) ?? "");`);
    return;
  }

  const stopVar = nextVar(context, "stop");
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `${elementVar}.${property} = String(unwrap(${expression}) ?? "");`);
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(${stopVar});`);
}

function generatePreNode(
  context: GenerateContext,
  node: TemplateNode,
  parentVar: string,
  indent: number,
  beforeVar?: string
): string {
  if (node.type === "text") {
    const textVar = nextVar(context, "text");
    emit(context, indent, `const ${textVar} = document.createTextNode(${quote(node.parts.map((part) => part.value).join(""))});`);
    appendNode(context, parentVar, textVar, indent, beforeVar);
    return textVar;
  }

  return generatePreElement(context, node, parentVar, indent, beforeVar);
}

function generatePreElement(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  indent: number,
  beforeVar?: string
): string {
  const elementVar = nextVar(context, "el");
  emit(context, indent, `const ${elementVar} = document.createElement(${quote(node.tag)});`);

  if (context.scopeAttr) {
    emit(context, indent, `${elementVar}.setAttribute(${quote(context.scopeAttr)}, "");`);
  }

  for (const attr of node.attrs) {
    if (attr.name === "v-pre") {
      continue;
    }

    emit(context, indent, `setAttribute(${elementVar}, ${quote(attr.name)}, ${quote(attr.value === true ? "" : attr.value)});`);
  }

  for (const child of node.children) {
    generatePreNode(context, child, elementVar, indent);
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
    if (context.once) {
      emit(context, indent, `${textVar}.textContent = ${textExpression(node.parts, context)};`);
    } else {
      const stopVar = nextVar(context, "stop");
      emit(context, indent, `const ${stopVar} = effect(() => {`);
      emit(context, indent + 1, `${textVar}.textContent = ${textExpression(node.parts, context)};`);
      emit(context, indent, "});");
      emit(context, indent, `${cleanupVar}.push(${stopVar});`);
    }
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
  const binding = parseObjectBindDirective(attr.name);
  if (!binding) {
    return;
  }
  validateObjectBindModifiers(binding, attr, context, "element");
  const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
  const prevKeysVar = nextVar(context, "boundKeys");
  const stopVar = nextVar(context, "stop");
  const attrsVar = nextVar(context, "attrs");
  const nextKeysVar = nextVar(context, "boundKeys");
  const keyVar = nextVar(context, "key");
  const boundKeyVar = nextVar(context, "key");
  const valueVar = nextVar(context, "value");
  const staleKeyVar = nextVar(context, "key");
  const staticClass = getStaticAttrValue(node, "class");
  const staticStyle = getStaticAttrValue(node, "style");
  emit(context, indent, `const ${prevKeysVar} = new Set();`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${attrsVar} = unwrap(${expression}) ?? {};`);
  emit(context, indent + 1, `const ${nextKeysVar} = new Set();`);
  emit(context, indent + 1, `if (${attrsVar} && typeof ${attrsVar} === "object") {`);
  emit(context, indent + 2, `for (const [${keyVar}, ${valueVar}] of Object.entries(${attrsVar})) {`);
  emit(context, indent + 3, `const ${boundKeyVar} = ${objectBindKeyExpression(keyVar, binding)};`);
  emit(context, indent + 3, `${nextKeysVar}.add(${boundKeyVar});`);
  if (staticClass || staticStyle) {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${boundKeyVar}, ${boundKeyVar} === "class" && ${staticClass ? "true" : "false"} ? [${quote(staticClass ?? "")}, unwrap(${valueVar})] : ${boundKeyVar} === "style" && ${staticStyle ? "true" : "false"} ? [${quote(staticStyle ?? "")}, unwrap(${valueVar})] : unwrap(${valueVar})${bindOptionsExpression(binding)});`);
  } else {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${boundKeyVar}, unwrap(${valueVar})${bindOptionsExpression(binding)});`);
  }
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `for (const ${staleKeyVar} of ${prevKeysVar}) {`);
  emit(context, indent + 2, `if (!${nextKeysVar}.has(${staleKeyVar})) {`);
  if (staticClass || staticStyle) {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, ${staleKeyVar} === "class" && ${staticClass ? "true" : "false"} ? ${quote(staticClass ?? "")} : ${staleKeyVar} === "style" && ${staticStyle ? "true" : "false"} ? ${quote(staticStyle ?? "")} : null${bindOptionsExpression(binding)});`);
  } else {
    emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, null${bindOptionsExpression(binding)});`);
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
  const event = parseObjectOnDirective(attr.name);
  if (!event) {
    return;
  }
  validateObjectOnModifiers(event, attr, context, "element");
  const eventOptions = eventListenerOptions(event);
  const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
  const listenersVar = nextVar(context, "listeners");
  const stopVar = nextVar(context, "stop");
  const sourceVar = nextVar(context, "listeners");
  const eventVar = nextVar(context, "event");
  const handlerVar = nextVar(context, "handler");
  const wrappedHandlerVar = nextVar(context, "handler");
  emit(context, indent, `const ${listenersVar} = new Map();`);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  emit(context, indent + 1, `for (const [${eventVar}, ${handlerVar}] of ${listenersVar}) {`);
  emit(context, indent + 2, `${elementVar}.removeEventListener(${eventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${listenersVar}.clear();`);
  emit(context, indent + 1, `const ${sourceVar} = unwrap(${expression}) ?? {};`);
  emit(context, indent + 1, `if (${sourceVar} && typeof ${sourceVar} === "object") {`);
  emit(context, indent + 2, `for (const [${eventVar}, ${handlerVar}] of Object.entries(${sourceVar})) {`);
  emit(context, indent + 3, `if (typeof ${handlerVar} === "function") {`);
  emit(context, indent + 4, `const ${wrappedHandlerVar} = __mikuru_guardEventHandler(${handlerVar});`);
  emit(context, indent + 4, `${elementVar}.addEventListener(${eventVar}, ${wrappedHandlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
  emit(context, indent + 4, `${listenersVar}.set(${eventVar}, ${wrappedHandlerVar});`);
  emit(context, indent + 3, "}");
  emit(context, indent + 2, "}");
  emit(context, indent + 1, "}");
  emit(context, indent, "});");
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}();`);
  emit(context, indent + 1, `for (const [${eventVar}, ${handlerVar}] of ${listenersVar}) {`);
  emit(context, indent + 2, `${elementVar}.removeEventListener(${eventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${listenersVar}.clear();`);
  emit(context, indent, "});");
}

export function generateChildren(
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
  beforeVar?: string,
  transitionVar?: string
): string {
  const startVar = nextVar(context, "ifStart");
  const endVar = nextVar(context, "ifEnd");
  const branchCleanupVar = nextVar(context, "ifCleanup");
  const stopVar = nextVar(context, "stop");
  const renderTokenVar = transitionVar ? nextVar(context, "ifRenderToken") : undefined;
  emit(context, indent, `const ${branchCleanupVar} = [];`);
  if (renderTokenVar) {
    emit(context, indent, `let ${renderTokenVar} = 0;`);
  }
  emit(context, indent, `const ${startVar} = document.createComment("if");`);
  emit(context, indent, `const ${endVar} = document.createComment("/if");`);
  appendNode(context, parentVar, startVar, indent, beforeVar);
  appendNode(context, parentVar, endVar, indent, beforeVar);
  emit(context, indent, `const ${stopVar} = effect(() => {`);
  if (transitionVar) {
    emit(context, indent + 1, `const hadTransitionBranch = ${startVar}.nextSibling !== ${endVar};`);
  }
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emitRemoveBetween(context, indent + 1, startVar, endVar);
  const branchIndent = transitionVar ? indent + 2 : indent + 1;
  const renderBranchVar = transitionVar ? nextVar(context, "renderIfBranch") : undefined;

  if (transitionVar && renderBranchVar && renderTokenVar) {
    const currentTokenVar = nextVar(context, "ifRenderToken");
    emit(context, indent + 1, `const ${currentTokenVar} = ++${renderTokenVar};`);
    emit(context, indent + 1, `const ${renderBranchVar} = () => {`);
    emit(context, indent + 2, `if (${currentTokenVar} !== ${renderTokenVar}) { return; }`);
  }

  branches.forEach((branch, branchIndex) => {
    if (branch.directive === "v-else") {
      emit(context, branchIndent, `${branchIndex === 0 ? "if (true)" : "else"} {`);
    } else {
      const condition = compileTemplateExpression(
        branch.condition ?? "",
        branch.directive,
        toExpressionContext(context, getStringAttrLocation(branch.node, branch.directive))
      );
      emit(context, branchIndent, `${branchIndex === 0 ? "if" : "else if"} (unwrap(${condition})) {`);
    }

    const branchVar = generateNode(context, withoutAttrs(branch.node, ["v-if", "v-else-if", "v-else"]), parentVar, branchCleanupVar, branchIndent + 1, endVar);
    if (transitionVar) {
      emitTransitionRegistration(context, branchVar, transitionVar, branchIndent + 1);
    }
    emit(context, branchIndent, "}");
  });

  if (transitionVar && renderBranchVar) {
    emit(context, indent + 1, "};");
    emit(context, indent + 1, `if (${transitionVar}.mode === "out-in" && hadTransitionBranch) { setTimeout(${renderBranchVar}, 50); } else { ${renderBranchVar}(); }`);
  }

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
    if (node.tag === "template") {
      return generateKeyedTemplateFor(context, node, parentVar, cleanupVar, indent, itemName, indexName, sourceExpression, keyExpression, beforeVar);
    }

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

function generateKeyedTemplateFor(
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
  validatePlainTemplate(context, node);
  const startVar = nextVar(context, "forStart");
  const endVar = nextVar(context, "forEnd");
  const recordsVar = nextVar(context, "forRecords");
  const stopVar = nextVar(context, "stop");
  const compiledSource = compileTemplateExpression(sourceExpression, "v-for source", toExpressionContext(context, getStringAttrLocation(node, "v-for")));
  const compiledKey = compileTemplateExpression(keyExpression, "v-for key", toExpressionContext(context, getKeyAttrLocation(node)));
  const compiledMemo = getMemoExpression(context, node) ?? getOnceMemoExpression(context, node);
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
  const recordStartVar = nextVar(context, "forRecordStart");
  const recordEndVar = nextVar(context, "forRecordEnd");
  const memoVar = compiledMemo ? nextVar(context, "forMemo") : undefined;
  const memoChangedVar = compiledMemo ? nextVar(context, "forMemoChanged") : undefined;
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
  if (compiledMemo && memoVar) {
    emit(context, indent + 2, `const ${memoVar} = ${compiledMemo};`);
  }
  emit(context, indent + 2, `let ${recordVar} = ${recordsVar}.get(${keyVar});`);
  emit(context, indent + 2, `if (!${recordVar}) {`);
  emit(context, indent + 3, `const ${recordCleanupVar} = [];`);
  emit(context, indent + 3, `const ${itemRefVar} = ref(${rawItemVar});`);

  if (indexName) {
    emit(context, indent + 3, `const ${indexRefVar} = ref(${rawIndexVar});`);
  }

  emit(context, indent + 3, `const ${recordStartVar} = document.createComment("for item");`);
  emit(context, indent + 3, `const ${recordEndVar} = document.createComment("/for item");`);
  emit(context, indent + 3, `${parentVar}.insertBefore(${recordStartVar}, ${endVar});`);
  emit(context, indent + 3, `${parentVar}.insertBefore(${recordEndVar}, ${endVar});`);
  emit(context, indent + 3, `{`);
  emit(context, indent + 4, `const ${itemName} = ${itemRefVar};`);

  if (indexName) {
    emit(context, indent + 4, `const ${indexName} = ${indexRefVar};`);
  }

  withTemplateRefMode(context, "array", () => {
    generateChildren(context, node.children, parentVar, recordCleanupVar, indent + 4, recordEndVar);
  });
  emit(context, indent + 4, `${recordVar} = { start: ${recordStartVar}, end: ${recordEndVar}, cleanups: ${recordCleanupVar}, item: ${itemRefVar}${indexName ? `, index: ${indexRefVar}` : ""}${compiledMemo && memoVar ? `, memo: ${memoVar}` : ""} };`);
  emit(context, indent + 3, `}`);
  emit(context, indent + 2, `} else {`);
  if (compiledMemo && memoVar && memoChangedVar) {
    emit(context, indent + 3, `const ${memoChangedVar} = !__mikuru_memoEqual(${recordVar}.memo, ${memoVar});`);
    emit(context, indent + 3, `if (${memoChangedVar}) {`);
    emit(context, indent + 4, `${recordVar}.memo = ${memoVar};`);
    emit(context, indent + 4, `${recordVar}.item.value = ${rawItemVar};`);

    if (indexName) {
      emit(context, indent + 4, `${recordVar}.index.value = ${rawIndexVar};`);
    }

    emit(context, indent + 3, "}");
  } else {
    emit(context, indent + 3, `${recordVar}.item.value = ${rawItemVar};`);

    if (indexName) {
      emit(context, indent + 3, `${recordVar}.index.value = ${rawIndexVar};`);
    }
  }
  emitMoveRangeBefore(context, indent + 3, `${recordVar}.start`, `${recordVar}.end`, parentVar, endVar);
  emit(context, indent + 2, `}`);
  emit(context, indent + 2, `${nextRecordsVar}.set(${keyVar}, ${recordVar});`);
  emit(context, indent + 1, `}`);
  emit(context, indent + 1, `for (const [${keyVar}, ${recordVar}] of ${recordsVar}) {`);
  emit(context, indent + 2, `if (!${nextRecordsVar}.has(${keyVar})) {`);
  emit(context, indent + 3, `__mikuru_runCleanup(${recordVar}.cleanups);`);
  emitRemoveRange(context, indent + 3, `${recordVar}.start`, `${recordVar}.end`);
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
  beforeVar?: string,
  transitionVar?: string
): string {
  const startVar = nextVar(context, "forStart");
  const endVar = nextVar(context, "forEnd");
  const recordsVar = nextVar(context, "forRecords");
  const stopVar = nextVar(context, "stop");
  const compiledSource = compileTemplateExpression(sourceExpression, "v-for source", toExpressionContext(context, getStringAttrLocation(node, "v-for")));
  const compiledKey = compileTemplateExpression(keyExpression, "v-for key", toExpressionContext(context, getKeyAttrLocation(node)));
  const compiledMemo = getMemoExpression(context, node) ?? getOnceMemoExpression(context, node);
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
  const memoVar = compiledMemo ? nextVar(context, "forMemo") : undefined;
  const memoChangedVar = compiledMemo ? nextVar(context, "forMemoChanged") : undefined;
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
  if (compiledMemo && memoVar) {
    emit(context, indent + 2, `const ${memoVar} = ${compiledMemo};`);
  }
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
  if (transitionVar) {
    emitTransitionRegistration(context, elementVar, transitionVar, indent + 4);
  }
  emit(context, indent + 4, `${recordVar} = { element: ${elementVar}, cleanups: ${recordCleanupVar}, item: ${itemRefVar}${indexName ? `, index: ${indexRefVar}` : ""}${compiledMemo && memoVar ? `, memo: ${memoVar}` : ""} };`);
  emit(context, indent + 3, `}`);
  emit(context, indent + 2, `} else {`);
  if (compiledMemo && memoVar && memoChangedVar) {
    emit(context, indent + 3, `const ${memoChangedVar} = !__mikuru_memoEqual(${recordVar}.memo, ${memoVar});`);
    emit(context, indent + 3, `if (${memoChangedVar}) {`);
    emit(context, indent + 4, `${recordVar}.memo = ${memoVar};`);
    emit(context, indent + 4, `${recordVar}.item.value = ${rawItemVar};`);

    if (indexName) {
      emit(context, indent + 4, `${recordVar}.index.value = ${rawIndexVar};`);
    }

    emit(context, indent + 3, "}");
  } else {
    emit(context, indent + 3, `${recordVar}.item.value = ${rawItemVar};`);

    if (indexName) {
      emit(context, indent + 3, `${recordVar}.index.value = ${rawIndexVar};`);
    }
  }

  emit(context, indent + 3, `${parentVar}.insertBefore(${recordVar}.element, ${endVar});`);
  if (transitionVar) {
    emit(context, indent + 3, `__mikuru_applyTransitionMove(${recordVar}.element, ${transitionVar});`);
  }
  emit(context, indent + 2, `}`);
  emit(context, indent + 2, `${nextRecordsVar}.set(${keyVar}, ${recordVar});`);
  emit(context, indent + 1, `}`);
  emit(context, indent + 1, `for (const [${keyVar}, ${recordVar}] of ${recordsVar}) {`);
  emit(context, indent + 2, `if (!${nextRecordsVar}.has(${keyVar})) {`);
  emit(context, indent + 3, `__mikuru_runCleanup(${recordVar}.cleanups);`);
  emit(context, indent + 3, `__mikuru_removeNode(${recordVar}.element);`);
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
  emit(context, indent + 1, `__mikuru_removeNode(${currentVar});`);
  emit(context, indent + 1, `${currentVar} = ${nextVarName};`);
  emit(context, indent, "}");
}

function emitRemoveRange(context: GenerateContext, indent: number, startExpression: string, endExpression: string): void {
  const currentVar = nextVar(context, "current");
  const nextVarName = nextVar(context, "next");
  emit(context, indent, `let ${currentVar} = ${startExpression};`);
  emit(context, indent, `while (${currentVar}) {`);
  emit(context, indent + 1, `const ${nextVarName} = ${currentVar}.nextSibling;`);
  emit(context, indent + 1, `__mikuru_removeNode(${currentVar});`);
  emit(context, indent + 1, `if (${currentVar} === ${endExpression}) { break; }`);
  emit(context, indent + 1, `${currentVar} = ${nextVarName};`);
  emit(context, indent, "}");
}

function emitMoveRangeBefore(
  context: GenerateContext,
  indent: number,
  startExpression: string,
  endExpression: string,
  parentVar: string,
  beforeExpression: string
): void {
  const fragmentVar = nextVar(context, "fragment");
  const currentVar = nextVar(context, "current");
  const nextVarName = nextVar(context, "next");
  emit(context, indent, `const ${fragmentVar} = document.createDocumentFragment();`);
  emit(context, indent, `let ${currentVar} = ${startExpression};`);
  emit(context, indent, `while (${currentVar}) {`);
  emit(context, indent + 1, `const ${nextVarName} = ${currentVar}.nextSibling;`);
  emit(context, indent + 1, `${fragmentVar}.appendChild(${currentVar});`);
  emit(context, indent + 1, `if (${currentVar} === ${endExpression}) { break; }`);
  emit(context, indent + 1, `${currentVar} = ${nextVarName};`);
  emit(context, indent, "}");
  emit(context, indent, `${parentVar}.insertBefore(${fragmentVar}, ${beforeExpression});`);
}

function emitTransitionRegistration(context: GenerateContext, nodeVar: string, transitionVar: string, indent: number): void {
  emit(context, indent, `if (${nodeVar}?.nodeType === 1) {`);
  emit(context, indent + 1, `${nodeVar}.__mikuru_transition = ${transitionVar};`);
  emit(context, indent + 1, `${nodeVar}.__mikuru_transitionLeaving = false;`);
  emit(context, indent + 1, `__mikuru_applyTransitionEnter(${nodeVar}, ${transitionVar});`);
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

function withOnceMode<T>(context: GenerateContext, callback: () => T): T {
  const previousOnce = context.once;
  context.once = true;

  try {
    return callback();
  } finally {
    context.once = previousOnce;
  }
}

function splitTopLevel(source: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoteChar = "";
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const previous = source[index - 1];

    if (quoteChar) {
      if (char === quoteChar && previous !== "\\") {
        quoteChar = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quoteChar = char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }

    if (depth === 0 && char === delimiter) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
}

function findTopLevelToken(source: string, token: string): number {
  let depth = 0;
  let quoteChar = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const previous = source[index - 1];

    if (quoteChar) {
      if (char === quoteChar && previous !== "\\") {
        quoteChar = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quoteChar = char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }

    if (depth === 0 && char === token) {
      return index;
    }
  }

  return -1;
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
  const validatedExpression = validateEventHandlerExpression(expression, context, location);

  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(validatedExpression)) {
    return validatedExpression;
  }

  return `($event) => { return (${compileEventHandlerExpression(validatedExpression, context, location)}); }`;
}

function validateEventHandlerExpression(expression: string, context: GenerateContext, location: SourceLocation | undefined): string {
  const source = expression.trim().replace(/;\s*$/, "");

  if (!source) {
    throwTemplateError("Invalid template expression for event handler: expression is empty", context, location);
  }

  try {
    const ast = parseExpressionAt(source, 0, { ecmaVersion: "latest" }) as ScriptNode;
    if (ast.end !== source.length) {
      throw new Error("Unexpected trailing content");
    }
    validateEventHandlerNode(ast, context, source, location);
    return source;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unsupported event handler")) {
      throwTemplateError(error.message, context, location);
    }

    try {
      return validateTemplateExpression(source, "event handler", toExpressionContext(context, location));
    } catch {
      const message = error instanceof Error ? error.message : String(error);
      throwTemplateError(`Invalid template expression for event handler: ${source} (${message})`, context, location);
    }
  }
}

function compileEventHandlerExpression(expression: string, context: GenerateContext, location: SourceLocation | undefined): string {
  const ast = parseExpressionAt(expression, 0, { ecmaVersion: "latest" }) as ScriptNode;
  const edits: ScriptEdit[] = [];
  collectEventHandlerEdits(ast, expression, edits, "read");
  return applyScriptEdits(expression, edits);
}

function validateEventHandlerNode(node: ScriptNode, context: GenerateContext, source: string, location: SourceLocation | undefined): void {
  switch (node.type) {
    case "Identifier":
    case "Literal":
    case "TemplateElement":
      return;

    case "ThisExpression":
    case "NewExpression":
      throw new Error(`Unsupported event handler expression: ${source} (${node.type})`);

    case "AssignmentExpression":
      validateEventAssignmentTarget(node.left as ScriptNode, context, source, location);
      validateEventHandlerNode(node.right as ScriptNode, context, source, location);
      return;

    case "UpdateExpression":
      validateEventAssignmentTarget(node.argument as ScriptNode, context, source, location);
      return;

    case "CallExpression":
      validateEventCallExpression(node, context, source, location);
      return;

    case "MemberExpression":
      validateEventMemberExpression(node, context, source, location);
      return;

    case "ChainExpression":
      validateEventHandlerNode(node.expression as ScriptNode, context, source, location);
      return;

    case "UnaryExpression":
      validateEventHandlerNode(node.argument as ScriptNode, context, source, location);
      return;

    case "BinaryExpression":
    case "LogicalExpression":
      validateEventHandlerNode(node.left as ScriptNode, context, source, location);
      validateEventHandlerNode(node.right as ScriptNode, context, source, location);
      return;

    case "ConditionalExpression":
      validateEventHandlerNode(node.test as ScriptNode, context, source, location);
      validateEventHandlerNode(node.consequent as ScriptNode, context, source, location);
      validateEventHandlerNode(node.alternate as ScriptNode, context, source, location);
      return;

    case "ArrayExpression":
      for (const element of node.elements ?? []) {
        if (element) {
          validateEventHandlerNode(element, context, source, location);
        }
      }
      return;

    case "ObjectExpression":
      for (const property of node.properties ?? []) {
        validateEventHandlerNode(property, context, source, location);
      }
      return;

    case "Property":
      if (node.computed) {
        validateEventHandlerNode(node.key as ScriptNode, context, source, location);
      }
      validateEventHandlerNode(node.value as ScriptNode, context, source, location);
      return;

    case "TemplateLiteral":
      for (const quasi of (node as ScriptNode & { quasis?: ScriptNode[] }).quasis ?? []) {
        validateEventHandlerNode(quasi, context, source, location);
      }
      for (const part of (node as ScriptNode & { expressions?: ScriptNode[] }).expressions ?? []) {
        validateEventHandlerNode(part, context, source, location);
      }
      return;

    default:
      throw new Error(`Unsupported event handler expression: ${source} (${node.type})`);
  }
}

function validateEventAssignmentTarget(node: ScriptNode, context: GenerateContext, source: string, location: SourceLocation | undefined): void {
  if (node.type === "Identifier") {
    return;
  }

  if (node.type === "MemberExpression") {
    validateEventMemberExpression(node, context, source, location);
    return;
  }

  throw new Error(`Unsupported event handler assignment target: ${source} (${node.type})`);
}

function validateEventCallExpression(node: ScriptNode, context: GenerateContext, source: string, location: SourceLocation | undefined): void {
  const callee = node.callee as ScriptNode;
  const calleeName = getEventStaticCalleeName(callee, source);

  if (calleeName === "eval" || calleeName === "Function") {
    throw new Error(`Unsupported event handler expression: ${source} (${calleeName})`);
  }

  validateEventHandlerNode(callee, context, source, location);

  for (const argument of node.arguments ?? []) {
    validateEventHandlerNode(argument, context, source, location);
  }
}

function validateEventMemberExpression(node: ScriptNode, context: GenerateContext, source: string, location: SourceLocation | undefined): void {
  validateEventHandlerNode(node.object as ScriptNode, context, source, location);

  if (node.computed) {
    validateEventHandlerNode(node.property as ScriptNode, context, source, location);
    return;
  }

  const propertyName = getEventStaticPropertyName(node.property as ScriptNode, source);
  if (propertyName === "constructor" || propertyName === "__proto__" || propertyName === "prototype") {
    throw new Error(`Unsupported event handler expression: ${source} (${propertyName})`);
  }
}

type EventEditMode = "read" | "write" | "callee";

function collectEventHandlerEdits(node: ScriptNode | null | undefined, source: string, edits: ScriptEdit[], mode: EventEditMode): void {
  if (!node) {
    return;
  }

  switch (node.type) {
    case "Identifier":
      if (node.name === "$event") {
        return;
      }
      if (mode === "write") {
        edits.push({ start: node.start, end: node.end, replacement: `${node.name}.value` });
        return;
      }
      if (mode === "callee") {
        return;
      }
      edits.push({ start: node.start, end: node.end, replacement: `unwrap(${node.name})` });
      return;

    case "Literal":
    case "TemplateElement":
    case "ThisExpression":
      return;

    case "AssignmentExpression":
      collectEventHandlerEdits(node.left as ScriptNode, source, edits, "write");
      collectEventHandlerEdits(node.right as ScriptNode, source, edits, "read");
      return;

    case "UpdateExpression":
      collectEventHandlerEdits(node.argument as ScriptNode, source, edits, "write");
      return;

    case "CallExpression":
      collectEventHandlerEdits(node.callee as ScriptNode, source, edits, "callee");
      for (const argument of node.arguments ?? []) {
        collectEventHandlerEdits(argument, source, edits, "read");
      }
      return;

    case "MemberExpression":
      collectEventHandlerEdits(node.object as ScriptNode, source, edits, mode === "callee" ? "read" : mode);
      if (node.computed) {
        collectEventHandlerEdits(node.property as ScriptNode, source, edits, "read");
      }
      return;

    case "ChainExpression":
      collectEventHandlerEdits(node.expression as ScriptNode, source, edits, mode);
      return;

    case "UnaryExpression":
      collectEventHandlerEdits(node.argument as ScriptNode, source, edits, "read");
      return;

    case "BinaryExpression":
    case "LogicalExpression":
      collectEventHandlerEdits(node.left as ScriptNode, source, edits, "read");
      collectEventHandlerEdits(node.right as ScriptNode, source, edits, "read");
      return;

    case "ConditionalExpression":
      collectEventHandlerEdits(node.test as ScriptNode, source, edits, "read");
      collectEventHandlerEdits(node.consequent as ScriptNode, source, edits, "read");
      collectEventHandlerEdits(node.alternate as ScriptNode, source, edits, "read");
      return;

    case "ArrayExpression":
      for (const element of node.elements ?? []) {
        collectEventHandlerEdits(element, source, edits, "read");
      }
      return;

    case "ObjectExpression":
      for (const property of node.properties ?? []) {
        collectEventHandlerEdits(property, source, edits, "read");
      }
      return;

    case "Property":
      if (node.computed) {
        collectEventHandlerEdits(node.key as ScriptNode, source, edits, "read");
      }
      collectEventHandlerEdits(node.value as ScriptNode, source, edits, "read");
      return;

    case "TemplateLiteral":
      for (const part of (node as ScriptNode & { expressions?: ScriptNode[] }).expressions ?? []) {
        collectEventHandlerEdits(part, source, edits, "read");
      }
      return;
  }
}

function getEventStaticCalleeName(node: ScriptNode, source: string): string | undefined {
  if (node.type === "Identifier") {
    return source.slice(node.start, node.end);
  }

  if (node.type === "MemberExpression") {
    return getEventStaticPropertyName(node.property as ScriptNode, source);
  }

  return undefined;
}

function getEventStaticPropertyName(node: ScriptNode, source: string): string | undefined {
  if (node.type === "Identifier") {
    return source.slice(node.start, node.end);
  }

  if (node.type === "Literal") {
    return String(node.value);
  }

  return undefined;
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

function getMemoExpression(context: GenerateContext, node: ElementNode): string | undefined {
  const attr = node.attrs.find((candidate) => candidate.name === "v-memo");

  if (!attr) {
    return undefined;
  }

  const expression = validateTemplateExpression(requireAttrValue(attr), "v-memo", toExpressionContext(context, attr.valueLoc));

  if (!expression.trim().startsWith("[") || !expression.trim().endsWith("]")) {
    throwTemplateError("v-memo requires an array expression", context, attr.valueLoc ?? attr.loc);
  }

  return compileTemplateExpression(expression, "v-memo", toExpressionContext(context, attr.valueLoc));
}

function getOnceMemoExpression(context: GenerateContext, node: ElementNode): string | undefined {
  if (!hasAttr(node, "v-once")) {
    return undefined;
  }

  validateOnceAttribute(context, node);
  return "[]";
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

export function withoutForAttrs(node: ElementNode): ElementNode {
  return withoutAttrs(node, ["v-for", "key", ":key", "v-bind:key", "v-memo", "v-once"]);
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
  for (const attr of objectBindAttrs) {
    validateObjectBindModifiers(parseObjectBindDirective(attr.name) ?? { modifiers: [] }, attr, context, "component");
  }
  for (const attr of objectOnAttrs) {
    validateObjectOnModifiers(parseObjectOnDirective(attr.name) ?? { modifiers: [] }, attr, context, "component");
  }
  const slots = collectComponentSlots(context, node);
  const defaultSlot = slots.find((slot) => !slot.nameExpression && slot.name === "default");
  const needsProxy = objectBindAttrs.length > 0 || objectOnAttrs.length > 0;
  const propsTargetVar = needsProxy ? nextVar(context, "propsBase") : propsVar;

  emit(context, indent, `const ${propsTargetVar} = {`);
  emit(context, indent + 1, `__mikuru_context: ${context.componentContextVar ?? "__mikuru_context"},`);
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

    if (binding.kind === "rest") {
      emit(context, indent, `const ${binding.alias} = { get value() { const rest = { ...${slotPropsVar} }; ${binding.exclude.map((key) => `delete rest[${quote(key)}];`).join(" ")} return rest; } };`);
      continue;
    }

    const valueExpression = slotScopePathExpression(slotPropsVar, binding.path);

    if (binding.defaultValue) {
      emit(context, indent, `const ${binding.alias} = { get value() { const value = ${valueExpression}; return value === undefined ? (${binding.defaultValue}) : value; } };`);
      continue;
    }

    emit(context, indent, `const ${binding.alias} = { get value() { return ${valueExpression}; } };`);
  }
}

function slotScopePathExpression(rootVar: string, path: string[]): string {
  return path.reduce((expression, key, index) => {
    const property = /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${quote(key)}]`;
    return `${expression}${index === 0 ? property : `?.${property.slice(1)}`}`;
  }, rootVar);
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

  return parseSlotScopeObjectPattern(body, context, location, []);
}

function parseSlotScopeObjectPattern(
  body: string,
  context: GenerateContext,
  location: SourceLocation | undefined,
  pathPrefix: string[]
): SlotScopeBinding[] {
  const bindings: SlotScopeBinding[] = [];
  const excludedTopLevelKeys: string[] = [];

  for (const part of splitTopLevel(body, ",")) {
    const sourcePart = part.trim();

    if (!sourcePart) {
      continue;
    }

    if (sourcePart.startsWith("...")) {
      const alias = sourcePart.slice(3).trim();

      if (pathPrefix.length > 0) {
        throwTemplateError("Slot scope rest destructuring is only supported at the top level", context, location);
      }

      if (!isIdentifier(alias)) {
        throwTemplateError("Slot scope rest destructuring must use a simple identifier like ...rest", context, location);
      }

      bindings.push({ kind: "rest", alias, exclude: excludedTopLevelKeys });
      continue;
    }

    const { left, right } = splitSlotScopeEntry(sourcePart, context, location);

    if (!isIdentifier(left)) {
      throwTemplateError(`Unsupported slot scope key "${left}". Use identifier keys in slot scope destructuring`, context, location);
    }

    if (pathPrefix.length === 0) {
      excludedTopLevelKeys.push(left);
    }

    const path = [...pathPrefix, left];

    if (right === undefined) {
      bindings.push(...slotScopeLeafBindings(left, path, context, location));
      continue;
    }

    const value = right.trim();

    if (value.startsWith("{") && value.endsWith("}")) {
      bindings.push(...parseSlotScopeObjectPattern(value.slice(1, -1), context, location, path));
      continue;
    }

    if (value.startsWith("[") || value.includes("{")) {
      throwTemplateError("Slot scope destructuring supports nested object patterns only; array and mixed patterns are not supported", context, location);
    }

    bindings.push(...slotScopeLeafBindings(value, path, context, location));
  }

  return bindings;
}

function splitSlotScopeEntry(
  source: string,
  context: GenerateContext,
  location: SourceLocation | undefined
): { left: string; right?: string } {
  const colonIndex = findTopLevelToken(source, ":");

  if (colonIndex >= 0) {
    return {
      left: source.slice(0, colonIndex).trim(),
      right: source.slice(colonIndex + 1).trim()
    };
  }

  const equalsIndex = findTopLevelToken(source, "=");

  if (equalsIndex >= 0) {
    const left = source.slice(0, equalsIndex).trim();

    if (!isIdentifier(left)) {
      throwTemplateError("Slot scope default values can only be assigned to simple identifiers", context, location);
    }

    return { left, right: source };
  }

  return { left: source.trim() };
}

function slotScopeLeafBindings(
  source: string,
  path: string[],
  context: GenerateContext,
  location: SourceLocation | undefined
): SlotScopeBinding[] {
  const equalsIndex = findTopLevelToken(source, "=");
  const localSource = equalsIndex >= 0 ? source.slice(0, equalsIndex).trim() : source.trim();
  const defaultSource = equalsIndex >= 0 ? source.slice(equalsIndex + 1).trim() : undefined;

  if (!isIdentifier(localSource)) {
    throwTemplateError(`Unsupported slot scope binding "${source}". Use identifiers, aliases, defaults, nested objects, or top-level ...rest`, context, location);
  }

  return [
    {
      kind: "property",
      path,
      alias: localSource,
      defaultValue: defaultSource
        ? compileTemplateExpression(defaultSource, "slot scope default", toExpressionContext(context, location))
        : undefined
    }
  ];
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
    const propName = modelDirective.argument ?? "modelValue";
    const updatePropName = toComponentEventProp(`update:${propName}`);
    const modifiersPropName = modelDirective.argument ? `${propName}Modifiers` : "modelModifiers";

    const entries = [
      `get ${quotePropertyName(propName)}() { return unwrap(${valueExpression}); }`,
      `${quotePropertyName(updatePropName)}: __mikuru_guardEventHandler(($value) => { ${expression}.value = $value; })`
    ];

    if (modelDirective.modifiers.length > 0) {
      entries.push(`${quotePropertyName(modifiersPropName)}: { ${modelDirective.modifiers.map((modifier) => `${quotePropertyName(modifier)}: true`).join(", ")} }`);
    }

    return entries;
  }

  const event = parseEventDirective(attr.name);

  if (event) {
    validateComponentEventModifiers(event, attr, context);
    const handler = validateTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    const handlerExpression = componentEventHandlerExpression(
      event,
      eventHandlerExpression(handler, context, attr.valueLoc),
      context
    );

    if (event.nameExpression) {
      const eventNameExpression = compileTemplateExpression(event.nameExpression, attr.name, toExpressionContext(context, attr.loc));
      return [
        `[${componentEventPropRuntimeExpression(`String(unwrap(${eventNameExpression}) ?? "")`)}]: __mikuru_guardEventHandler(${handlerExpression})`
      ];
    }

    return [
      `${quotePropertyName(toComponentEventProp(event.name ?? ""))}: __mikuru_guardEventHandler(${componentEventHandlerExpression(
        event,
        eventHandlerExpression(handler, context, attr.valueLoc),
        context
      )})`
    ];
  }

  const bindDirective = parseBindDirective(attr.name);
  const dynamicBinding = bindDirective?.nameExpression ? bindDirective : undefined;

  if (dynamicBinding) {
    validateBindModifiers(dynamicBinding, attr, context, "component");
    const nameExpression = compileTemplateExpression(dynamicBinding.nameExpression ?? "", attr.name, toExpressionContext(context, attr.loc));
    const valueExpression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    const propertyName = bindNameExpression(`String(unwrap(${nameExpression}) ?? "")`, dynamicBinding);
    if (context.once) {
      return [`[${propertyName}]: unwrap(${valueExpression})`];
    }
    return [`get [${propertyName}]() { return unwrap(${valueExpression}); }`];
  }

  const bindingName = bindDirective?.name;

  if (bindingName && bindDirective) {
    validateBindModifiers(bindDirective, attr, context, "component");
    const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    if (context.once) {
      return [`${quotePropertyName(bindingName)}: unwrap(${expression})`];
    }
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

function getTransitionChildren(context: GenerateContext, node: ElementNode): ElementNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length === 0 || meaningful.some((child) => child.type !== "element")) {
    throwTemplateError("<Transition> requires exactly one element/component child or one v-if chain", context, node.loc);
  }

  const children = meaningful as ElementNode[];
  const first = children[0];

  if (children.length === 1) {
    return children;
  }

  if (!getStringAttr(first, "v-if")) {
    throwTemplateError("<Transition> requires exactly one element/component child or one v-if chain", context, node.loc);
  }

  for (const child of children.slice(1)) {
    if (!getStringAttr(child, "v-else-if") && !hasAttr(child, "v-else")) {
      throwTemplateError("<Transition> only accepts multiple children when they form a v-if chain", context, child.loc);
    }
  }

  return children;
}

function getTransitionBranches(context: GenerateContext, children: ElementNode[]): IfBranch[] {
  return children.map((child, index) => {
    if (index === 0) {
      return { node: child, condition: getStringAttr(child, "v-if"), directive: "v-if" };
    }

    const elseIfExpression = getStringAttr(child, "v-else-if");

    if (elseIfExpression) {
      return { node: child, condition: elseIfExpression, directive: "v-else-if" };
    }

    validateElseAttribute(child, context);
    return { node: child, directive: "v-else" };
  });
}

function getTransitionOptionsExpression(context: GenerateContext, node: ElementNode): string {
  const entries = [`name: String(unwrap(${getTransitionAttrExpression(context, node, "name", "v")}) ?? "v")`];
  const appearExpression = getTransitionAttrExpression(context, node, "appear");
  const modeExpression = getTransitionAttrExpression(context, node, "mode");

  if (appearExpression) {
    entries.push(`appear: Boolean(unwrap(${appearExpression}))`);
  }

  if (modeExpression) {
    entries.push(`mode: String(unwrap(${modeExpression}) ?? "")`);
  }

  const classAttrs = [
    ["enter-from-class", "enterFromClass"],
    ["enter-active-class", "enterActiveClass"],
    ["enter-to-class", "enterToClass"],
    ["leave-from-class", "leaveFromClass"],
    ["leave-active-class", "leaveActiveClass"],
    ["leave-to-class", "leaveToClass"],
    ["move-class", "moveClass"]
  ] as const;

  for (const [attrName, optionName] of classAttrs) {
    const expression = getTransitionAttrExpression(context, node, attrName);

    if (expression) {
      entries.push(`${optionName}: String(unwrap(${expression}) ?? "")`);
    }
  }

  return `{ ${entries.join(", ")} }`;
}

function getTransitionAttrExpression(context: GenerateContext, node: ElementNode, name: string, fallback?: string): string | undefined {
  const dynamicAttr = node.attrs.find((attr) => getBindingName(attr.name) === name);

  if (dynamicAttr) {
    return compileTemplateExpression(requireAttrValue(dynamicAttr), dynamicAttr.name, toExpressionContext(context, dynamicAttr.valueLoc));
  }

  if (hasStaticBooleanAttr(node, name)) {
    return "true";
  }

  const staticValue = getStaticAttrValue(node, name);

  if (staticValue !== undefined) {
    return quote(staticValue);
  }

  return fallback === undefined ? undefined : quote(fallback);
}

function validateTransitionAttributes(context: GenerateContext, node: ElementNode): void {
  const supported = [
    "name",
    "appear",
    "mode",
    "enter-from-class",
    "enter-active-class",
    "enter-to-class",
    "leave-from-class",
    "leave-active-class",
    "leave-to-class"
  ].map((name) => ({ name, display: name }));

  for (const attr of node.attrs) {
    const name = getBindingName(attr.name) ?? attr.name;

    if (supported.some((candidate) => candidate.name === name)) {
      continue;
    }

    throwUnsupportedSpecialAttribute(context, "Transition", attr, supported, "name, appear, mode, and CSS class override attributes");
  }
}

function validateTransitionGroupAttributes(context: GenerateContext, node: ElementNode): void {
  const supported = [
    "name",
    "tag",
    "enter-from-class",
    "enter-active-class",
    "enter-to-class",
    "leave-from-class",
    "leave-active-class",
    "leave-to-class",
    "move-class"
  ].map((name) => ({ name, display: name }));

  for (const attr of node.attrs) {
    const name = getBindingName(attr.name) ?? attr.name;

    if (supported.some((candidate) => candidate.name === name)) {
      continue;
    }

    throwUnsupportedSpecialAttribute(context, "TransitionGroup", attr, supported, "name, tag, and CSS class override attributes");
  }
}

function getSingleElementChild(context: GenerateContext, node: ElementNode, label: string): ElementNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length !== 1 || meaningful[0].type !== "element") {
    throwTemplateError(`${label} requires exactly one element or component child`, context, node.loc);
  }

  return [meaningful[0]];
}

function getAsyncBoundaryChildren(context: GenerateContext, node: ElementNode): TemplateNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length === 0) {
    throwTemplateError("<AsyncBoundary> requires at least one child", context, node.loc);
  }

  return node.children;
}

function getErrorBoundaryFallbackExpression(context: GenerateContext, node: ElementNode): string {
  const fallbackAttr = node.attrs.find((attr) => getBindingName(attr.name) === "fallback");

  if (!fallbackAttr) {
    throwTemplateError("<ErrorBoundary> requires :fallback to resolve to a component object", context, node.loc);
  }

  return compileTemplateExpression(requireAttrValue(fallbackAttr), fallbackAttr.name, toExpressionContext(context, fallbackAttr.valueLoc));
}

function getErrorBoundaryResetKeyExpression(context: GenerateContext, node: ElementNode): string | undefined {
  const resetKeyAttr = node.attrs.find((attr) => getBindingName(attr.name) === "reset-key");

  if (!resetKeyAttr) {
    return undefined;
  }

  return compileTemplateExpression(requireAttrValue(resetKeyAttr), resetKeyAttr.name, toExpressionContext(context, resetKeyAttr.valueLoc));
}

function getAsyncBoundaryLoadingExpression(context: GenerateContext, node: ElementNode): string {
  const loadingAttr = node.attrs.find((attr) => getBindingName(attr.name) === "loading");

  if (!loadingAttr) {
    throwTemplateError("<AsyncBoundary> requires :loading to resolve to a component object", context, node.loc);
  }

  return compileTemplateExpression(requireAttrValue(loadingAttr), loadingAttr.name, toExpressionContext(context, loadingAttr.valueLoc));
}

function getAsyncBoundaryFallbackExpression(context: GenerateContext, node: ElementNode): string {
  const fallbackAttr = node.attrs.find((attr) => getBindingName(attr.name) === "fallback");

  if (!fallbackAttr) {
    throwTemplateError("<AsyncBoundary> requires :fallback to resolve to a component object", context, node.loc);
  }

  return compileTemplateExpression(requireAttrValue(fallbackAttr), fallbackAttr.name, toExpressionContext(context, fallbackAttr.valueLoc));
}

function getAsyncBoundaryDelayExpression(context: GenerateContext, node: ElementNode): string {
  const delayAttr = node.attrs.find((attr) => getBindingName(attr.name) === "delay");

  if (!delayAttr) {
    return "0";
  }

  return compileTemplateExpression(requireAttrValue(delayAttr), delayAttr.name, toExpressionContext(context, delayAttr.valueLoc));
}

function getAsyncBoundaryTimeoutExpression(context: GenerateContext, node: ElementNode): string {
  const timeoutAttr = node.attrs.find((attr) => getBindingName(attr.name) === "timeout");

  if (!timeoutAttr) {
    return "undefined";
  }

  return compileTemplateExpression(requireAttrValue(timeoutAttr), timeoutAttr.name, toExpressionContext(context, timeoutAttr.valueLoc));
}

function getKeepAliveOptionExpression(context: GenerateContext, node: ElementNode, name: "include" | "exclude" | "max"): string | undefined {
  const dynamicAttr = node.attrs.find((attr) => getBindingName(attr.name) === name);

  if (dynamicAttr) {
    return compileTemplateExpression(requireAttrValue(dynamicAttr), dynamicAttr.name, toExpressionContext(context, dynamicAttr.valueLoc));
  }

  const staticValue = getStaticAttrValue(node, name);
  return staticValue === undefined ? undefined : quote(staticValue);
}

function validateErrorBoundaryAttributes(context: GenerateContext, node: ElementNode): void {
  const supported = [
    { name: "fallback", display: ":fallback" },
    { name: "reset-key", display: ":reset-key" }
  ];

  for (const attr of node.attrs) {
    const bindingName = getBindingName(attr.name);
    if (bindingName === "fallback" || bindingName === "reset-key") {
      continue;
    }

    throwUnsupportedSpecialAttribute(context, "ErrorBoundary", attr, supported);
  }
}

function validateAsyncBoundaryAttributes(context: GenerateContext, node: ElementNode): void {
  const supported = [
    { name: "loading", display: ":loading" },
    { name: "fallback", display: ":fallback" },
    { name: "delay", display: ":delay" },
    { name: "timeout", display: ":timeout" }
  ];

  for (const attr of node.attrs) {
    const bindingName = getBindingName(attr.name);
    if (bindingName === "loading" || bindingName === "fallback" || bindingName === "delay" || bindingName === "timeout") {
      continue;
    }

    throwUnsupportedSpecialAttribute(context, "AsyncBoundary", attr, supported);
  }
}

function validateKeepAliveAttributes(context: GenerateContext, node: ElementNode): void {
  const supported = [
    { name: "include", display: ":include" },
    { name: "exclude", display: ":exclude" },
    { name: "max", display: ":max" }
  ];

  for (const attr of node.attrs) {
    const name = getBindingName(attr.name) ?? attr.name;
    if (name === "include" || name === "exclude" || name === "max") {
      continue;
    }

    throwUnsupportedSpecialAttribute(context, "KeepAlive", attr, supported, "include, exclude, and max");
  }
}

function getTeleportToExpression(context: GenerateContext, node: ElementNode): string {
  const dynamicTo = node.attrs.find((attr) => getBindingName(attr.name) === "to");

  if (dynamicTo) {
    return compileTemplateExpression(requireAttrValue(dynamicTo), dynamicTo.name, toExpressionContext(context, dynamicTo.valueLoc));
  }

  const staticTo = getStaticAttrValue(node, "to");

  if (staticTo === undefined) {
    throwTemplateError("<Teleport> requires a to target", context, node.loc);
  }

  return quote(staticTo);
}

function getTeleportDisabledExpression(context: GenerateContext, node: ElementNode): string {
  const dynamicDisabled = node.attrs.find((attr) => getBindingName(attr.name) === "disabled");

  if (dynamicDisabled) {
    return compileTemplateExpression(requireAttrValue(dynamicDisabled), dynamicDisabled.name, toExpressionContext(context, dynamicDisabled.valueLoc));
  }

  return hasStaticBooleanAttr(node, "disabled") ? "true" : "false";
}

function validateTeleportAttributes(context: GenerateContext, node: ElementNode): void {
  const supported = [
    { name: "to", display: "to" },
    { name: "disabled", display: "disabled" }
  ];

  for (const attr of node.attrs) {
    const name = getBindingName(attr.name) ?? attr.name;

    if (name === "to" || name === "disabled") {
      continue;
    }

    throwUnsupportedSpecialAttribute(context, "Teleport", attr, supported);
  }
}

type SupportedSpecialAttribute = {
  name: string;
  display: string;
};

function throwUnsupportedSpecialAttribute(
  context: GenerateContext,
  tagName: string,
  attr: TemplateAttribute,
  supported: SupportedSpecialAttribute[],
  supportedLabel = supported.map((candidate) => candidate.display).join(", ")
): never {
  const normalizedName = getBindingName(attr.name) ?? attr.name;
  const suggestion = suggestAttributeName(normalizedName, supported);
  const suggestionMessage = suggestion ? ` Did you mean ${suggestion.display}?` : "";
  throwTemplateError(
    `Unsupported attribute ${quote(attr.name)} on <${tagName}>.${suggestionMessage} <${tagName}> only supports ${supportedLabel} in v1.`,
    context,
    attr.loc
  );
}

function suggestAttributeName(name: string, supported: SupportedSpecialAttribute[]): SupportedSpecialAttribute | undefined {
  return suggestName(name, supported);
}

function suggestName<T extends { name: string }>(name: string, supported: T[]): T | undefined {
  let best: { candidate: T; distance: number } | undefined;

  for (const candidate of supported) {
    const distance = editDistance(name, candidate.name);

    if (!best || distance < best.distance) {
      best = { candidate, distance };
    }
  }

  if (!best) {
    return undefined;
  }

  const maxDistance = Math.max(1, Math.floor(best.candidate.name.length / 3));
  return best.distance <= maxDistance ? best.candidate : undefined;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length] ?? 0;
}

function toComponentEventProp(eventName: string): string {
  return `on${eventName
    .split(/[-:]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("")}`;
}

function validateAttributes(context: GenerateContext, node: ElementNode): void {
  const htmlAttr = getAttr(node, "v-html");
  const textAttr = getAttr(node, "v-text");

  if (htmlAttr && textAttr) {
    throwTemplateError("v-html and v-text cannot be used on the same element", context, textAttr.loc);
  }

  for (const attr of node.attrs) {
    if (attr.name.startsWith("v-") && !isSupportedDirectiveAttr(attr)) {
      throwUnsupportedDirective(context, attr);
    }

    if ((attr.name === "v-html" || attr.name === "v-text") && attr.value === true) {
      throwTemplateError(`${attr.name} requires a value`, context, attr.loc);
    }

    if ((attr.name === "v-pre" || attr.name === "v-cloak") && attr.value !== true) {
      throwTemplateError(`${attr.name} does not accept a value`, context, attr.valueLoc ?? attr.loc);
    }

    if (attr.name === "v-once") {
      validateOnceAttribute(context, node);
    }

    if (attr.name === "v-memo") {
      getMemoExpression(context, node);
    }
  }
}

function validateOnceAttribute(context: GenerateContext, node: ElementNode): void {
  const attr = node.attrs.find((candidate) => candidate.name === "v-once");

  if (attr && attr.value !== true) {
    throwTemplateError("v-once does not accept a value", context, attr.valueLoc ?? attr.loc);
  }
}

function validatePreAttribute(context: GenerateContext, node: ElementNode): void {
  const attr = node.attrs.find((candidate) => candidate.name === "v-pre");

  if (attr && attr.value !== true) {
    throwTemplateError("v-pre does not accept a value", context, attr.valueLoc ?? attr.loc);
  }
}

function throwUnsupportedDirective(context: GenerateContext, attr: TemplateAttribute): never {
  const suggestion = suggestDirectiveName(attr.name);
  const suggestionMessage = suggestion ? ` Did you mean ${suggestion}?` : "";
  throwTemplateError(`Unsupported directive ${quote(attr.name)}.${suggestionMessage}`, context, attr.loc);
}

function suggestDirectiveName(name: string): string | undefined {
  const supported = ["v-if", "v-else-if", "v-else", "v-for", "v-show", "v-html", "v-text", "v-pre", "v-cloak", "v-once", "v-memo", "v-model", "v-bind", "v-on", "v-slot"];
  const directiveName = name.includes(":") ? name.slice(0, name.indexOf(":")) : name.includes(".") ? name.slice(0, name.indexOf(".")) : name;
  const suggestion = suggestName(directiveName, supported.map((candidate) => ({ name: candidate, display: candidate })));

  if (!suggestion) {
    return undefined;
  }

  if (suggestion.name === "v-bind" && name.includes(":")) {
    return `v-bind:${name.slice(name.indexOf(":") + 1)}`;
  }

  if (suggestion.name === "v-on" && name.includes(":")) {
    return `v-on:${name.slice(name.indexOf(":") + 1)}`;
  }

  return suggestion.display;
}

function isDirectiveAttr(attr: TemplateAttribute): boolean {
  return isSupportedDirectiveAttr(attr) || attr.name.startsWith("@") || attr.name.startsWith(":");
}

function isStructuralAttr(attr: TemplateAttribute): boolean {
  return attr.name === "v-if" || attr.name === "v-else-if" || attr.name === "v-else" || attr.name === "v-for" || attr.name === "v-once" || attr.name === "v-memo";
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
    attr.name === "v-html" ||
    attr.name === "v-text" ||
    attr.name === "v-pre" ||
    attr.name === "v-cloak" ||
    attr.name === "v-once" ||
    attr.name === "v-memo" ||
    Boolean(parseModelDirective(attr.name)) ||
    isObjectBindAttr(attr) ||
    isObjectOnAttr(attr) ||
    Boolean(getDynamicBindingArgument(attr.name)) ||
    Boolean(getDynamicEventArgument(attr.name)) ||
    Boolean(parseEventDirective(attr.name)) ||
    Boolean(getBindingName(attr.name))
  );
}

function isObjectBindAttr(attr: TemplateAttribute): boolean {
  return Boolean(parseObjectBindDirective(attr.name));
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

function getContentDirectiveAttr(node: ElementNode): TemplateAttribute | undefined {
  return getAttr(node, "v-html") ?? getAttr(node, "v-text");
}

function getAttr(node: ElementNode, name: string): TemplateAttribute | undefined {
  return node.attrs.find((attr) => attr.name === name);
}

function isObjectOnAttr(attr: TemplateAttribute): boolean {
  return Boolean(parseObjectOnDirective(attr.name));
}

function parseObjectOnDirective(name: string): EventDirective | undefined {
  if (name === "v-on") {
    return { modifiers: [] };
  }

  if (!name.startsWith("v-on.")) {
    return undefined;
  }

  return { modifiers: name.slice("v-on.".length).split(".").filter(Boolean) };
}

function parseEventDirective(name: string): EventDirective | undefined {
  const dynamic = getDynamicEventArgument(name);
  if (dynamic) {
    return dynamic;
  }

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

function parseModelDirective(name: string): { argument?: string; modifiers: string[] } | undefined {
  if (name === "v-model") {
    return { modifiers: [] };
  }

  if (!name.startsWith("v-model.") && !name.startsWith("v-model:")) {
    return undefined;
  }

  if (name.startsWith("v-model:")) {
    const raw = name.slice("v-model:".length);
    const [argument = "", ...modifiers] = raw.split(".");
    return { argument, modifiers: modifiers.filter(Boolean) };
  }

  return { modifiers: name.slice("v-model.".length).split(".").filter(Boolean) };
}

function validateModelModifiers(model: { argument?: string; modifiers: string[] }, attr: TemplateAttribute, context: GenerateContext): void {
  const supportedModifiers = ["trim", "number", "lazy"];

  if (model.argument !== undefined && !model.argument) {
    throwTemplateError("v-model argument must not be empty", context, attr.loc);
  }

  for (const modifier of model.modifiers) {
    if (!supportedModifiers.includes(modifier)) {
      const suggestion = suggestModifierName(modifier, supportedModifiers);
      const suggestionMessage = suggestion ? ` Did you mean .${suggestion}?` : "";
      throwTemplateError(`Unsupported v-model modifier .${modifier}.${suggestionMessage}`, context, attr.loc);
    }
  }
}

const modelValueProperty = "__mikuruModelValue";

function modelElementValueExpression(targetExpression: string, modifiers: string[]): string {
  const valueExpression = `(${quote(modelValueProperty)} in ${targetExpression} ? ${targetExpression}[${quote(modelValueProperty)}] : ${targetExpression}.getAttribute("value") ?? (${targetExpression}.tagName === "OPTION" ? (${targetExpression}.textContent ?? "") : "on"))`;
  return modifiers.includes("number") ? `Number(${valueExpression})` : valueExpression;
}

function modelAssignedValue(modelMode: string, modifiers: string[], expression: string): string {
  if (modelMode === "checkbox") {
    const valueExpression = modelElementValueExpression("$event.target", modifiers);
    return `(() => { const checked = $event.target.checked; const current = unwrap(${expression}); const value = ${valueExpression}; if (Array.isArray(current)) { const hasValue = current.some((item) => Object.is(item, value)); return checked ? (hasValue ? current : [...current, value]) : current.filter((item) => !Object.is(item, value)); } return checked; })()`;
  }

  if (modelMode === "radio") {
    return modelElementValueExpression("$event.target", modifiers);
  }

  if (modelMode === "select-multiple") {
    const valueExpression = `Array.from($event.target.options).filter((option) => option.selected).map((option) => ${modelElementValueExpression("option", modifiers)})`;
    return valueExpression;
  }

  if (modelMode === "select") {
    const valueExpression = `(() => { const option = $event.target.selectedOptions[0]; return option ? ${modelElementValueExpression("option", modifiers)} : ""; })()`;
    return valueExpression;
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
  const supportedModifiers = [...eventControlModifiers, ...eventOptionModifiers, ...eventSystemModifiers, ...eventMouseModifiers, ...eventKeyModifiers, "exact"];

  for (const modifier of event.modifiers) {
    if (!supportedModifiers.includes(modifier)) {
      const suggestion = suggestModifierName(modifier, supportedModifiers);
      const suggestionMessage = suggestion ? ` Did you mean .${suggestion}?` : "";
      throwTemplateError(`Unsupported event modifier .${modifier}.${suggestionMessage}`, context, attr.loc);
    }
  }

  if (event.modifiers.includes("passive") && event.modifiers.includes("prevent")) {
    throwTemplateError("Event modifiers .passive and .prevent cannot be combined", context, attr.loc);
  }
}

function validateComponentEventModifiers(event: EventDirective, attr: TemplateAttribute, context: GenerateContext): void {
  const supportedModifiers = ["once"];

  for (const modifier of event.modifiers) {
    if (modifier !== "once") {
      const suggestion = suggestModifierName(modifier, supportedModifiers);
      const suggestionMessage = suggestion ? ` Did you mean .${suggestion}?` : "";
      throwTemplateError(`Event modifier .${modifier} is only supported on DOM events.${suggestionMessage}`, context, attr.loc);
    }
  }
}

function validateObjectOnModifiers(event: EventDirective, attr: TemplateAttribute, context: GenerateContext, target: "element" | "component"): void {
  if (target === "component" && event.modifiers.length > 0) {
    throwTemplateError("Object v-on modifiers are only supported on native elements", context, attr.loc);
  }

  for (const modifier of event.modifiers) {
    if (!eventOptionModifiers.includes(modifier)) {
      const suggestion = suggestModifierName(modifier, eventOptionModifiers);
      const suggestionMessage = suggestion ? ` Did you mean .${suggestion}?` : "";
      throwTemplateError(`Object v-on modifier .${modifier} is not supported. Use .once, .capture, or .passive.${suggestionMessage}`, context, attr.loc);
    }
  }
}

function suggestModifierName(name: string, supported: string[]): string | undefined {
  return suggestName(name, supported.map((candidate) => ({ name: candidate, display: candidate })))?.name;
}

function eventListenerOptions(event: EventDirective): string | undefined {
  const options = [
    event.modifiers.includes("capture") ? "capture: true" : undefined,
    event.modifiers.includes("once") ? "once: true" : undefined,
    event.modifiers.includes("passive") ? "passive: true" : undefined
  ].filter(Boolean);

  return options.length ? `{ ${options.join(", ")} }` : undefined;
}

const eventControlModifiers = ["prevent", "stop", "self"];
const eventOptionModifiers = ["once", "capture", "passive"];
const eventSystemModifiers = ["ctrl", "shift", "alt", "meta"];
const eventMouseModifiers = ["left", "right", "middle"];
const eventKeyModifiers = ["enter", "escape", "esc", "space", "tab", "delete", "backspace", "up", "down", "left", "right"];

function eventModifierGuardExpression(event: EventDirective): string | undefined {
  const checks: string[] = [];
  const mouseEvent = isMouseEventName(event.name);

  for (const modifier of event.modifiers) {
    if (eventSystemModifiers.includes(modifier)) {
      checks.push(`!$event.${modifier}Key`);
      continue;
    }

    const mouseExpression = mouseEvent ? eventMouseButtonExpression(modifier) : undefined;
    if (mouseExpression) {
      checks.push(`$event.button !== ${mouseExpression}`);
      continue;
    }

    const keyExpression = eventKeyExpression(modifier);
    if (keyExpression) {
      checks.push(`!${keyExpression}.includes($event.key)`);
    }
  }

  if (event.modifiers.includes("exact")) {
    for (const modifier of eventSystemModifiers) {
      if (!event.modifiers.includes(modifier)) {
        checks.push(`$event.${modifier}Key`);
      }
    }
  }

  return checks.length ? checks.join(" || ") : undefined;
}

function isMouseEventName(name: string | undefined): boolean {
  return !!name && /^(?:click|dblclick|auxclick|contextmenu|mousedown|mouseup|mousemove|mouseover|mouseout|mouseenter|mouseleave|pointerdown|pointerup|pointermove|pointerover|pointerout|pointerenter|pointerleave)$/.test(name);
}

function eventMouseButtonExpression(modifier: string): string | undefined {
  const mouseButtons: Record<string, string> = {
    left: "0",
    middle: "1",
    right: "2"
  };
  return mouseButtons[modifier];
}

function eventKeyExpression(modifier: string): string | undefined {
  const keyAliases: Record<string, string[]> = {
    enter: ["Enter"],
    escape: ["Escape"],
    esc: ["Escape"],
    space: [" ", "Spacebar"],
    tab: ["Tab"],
    delete: ["Delete"],
    backspace: ["Backspace"],
    up: ["ArrowUp", "Up"],
    down: ["ArrowDown", "Down"],
    left: ["ArrowLeft", "Left"],
    right: ["ArrowRight", "Right"]
  };
  const keys = keyAliases[modifier];
  return keys ? JSON.stringify(keys) : undefined;
}

function componentEventHandlerExpression(event: EventDirective, handlerExpression: string, context: GenerateContext): string {
  if (!event.modifiers.includes("once")) {
    return handlerExpression;
  }

  const calledVar = nextVar(context, "called");
  const handlerVar = nextVar(context, "handler");
  return `(() => { let ${calledVar} = false; const ${handlerVar} = ${handlerExpression}; return (...$args) => { if (${calledVar}) { return; } ${calledVar} = true; return ${handlerVar}(...$args); }; })()`;
}

function componentEventPropRuntimeExpression(eventNameExpression: string): string {
  return `"on" + ${eventNameExpression}.split(/[-:]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("")`;
}

function getEventName(name: string): string | undefined {
  if (name.startsWith("@[") || name.startsWith("v-on:[")) {
    return undefined;
  }

  if (name.startsWith("@")) {
    return name.slice(1);
  }

  if (name.startsWith("v-on:")) {
    return name.slice("v-on:".length);
  }

  return undefined;
}

function getBindingName(name: string): string | undefined {
  const binding = parseBindDirective(name);
  if (!binding || binding.nameExpression) {
    return undefined;
  }

  return binding.name;
}

function getDynamicBindingArgument(name: string): { expression: string } | undefined {
  const binding = parseBindDirective(name);
  if (!binding?.nameExpression) {
    return undefined;
  }
  return { expression: binding.nameExpression };
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

function validateBindModifiers(binding: BindDirective, attr: TemplateAttribute, context: GenerateContext, target: "element" | "component"): void {
  const allowed = new Set(["camel", "prop", "attr"]);
  for (const modifier of binding.modifiers) {
    if (!allowed.has(modifier)) {
      throwTemplateError(`Unsupported v-bind modifier ".${modifier}". Use .camel, .prop, or .attr.`, context, attr.loc);
    }
  }

  if (binding.modifiers.includes("prop") && binding.modifiers.includes("attr")) {
    throwTemplateError("v-bind modifiers .prop and .attr cannot be used together", context, attr.loc);
  }

  if (target === "component" && (binding.modifiers.includes("prop") || binding.modifiers.includes("attr"))) {
    throwTemplateError("v-bind .prop and .attr modifiers are only supported on native elements", context, attr.loc);
  }
}

function validateObjectBindModifiers(binding: BindDirective, attr: TemplateAttribute, context: GenerateContext, target: "element" | "component"): void {
  const allowed = new Set(["camel", "prop", "attr"]);
  for (const modifier of binding.modifiers) {
    if (!allowed.has(modifier)) {
      throwTemplateError(`Unsupported object v-bind modifier ".${modifier}". Use .camel, .prop, or .attr.`, context, attr.loc);
    }
  }

  if (binding.modifiers.includes("prop") && binding.modifiers.includes("attr")) {
    throwTemplateError("Object v-bind modifiers .prop and .attr cannot be used together", context, attr.loc);
  }

  if (target === "component" && binding.modifiers.length > 0) {
    throwTemplateError("Object v-bind modifiers are only supported on native elements", context, attr.loc);
  }
}

function bindOptionsExpression(binding: BindDirective): string {
  if (binding.modifiers.includes("prop")) {
    return ", { property: true }";
  }

  if (binding.modifiers.includes("attr")) {
    return ", { attribute: true }";
  }

  return "";
}

function bindNameExpression(expression: string, binding: BindDirective): string {
  return binding.modifiers.includes("camel") ? `(${expression}).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())` : expression;
}

function objectBindKeyExpression(keyExpression: string, binding: BindDirective): string {
  return bindNameExpression(`String(${keyExpression})`, binding);
}

function camelize(value: string): string {
  return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}


function getDynamicEventArgument(name: string): EventDirective | undefined {
  const dynamic = parseDynamicArgument(name, ["@", "v-on:"]);
  if (!dynamic) {
    return undefined;
  }
  return { nameExpression: dynamic.expression, modifiers: dynamic.modifiers };
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

export function createScopeAttr(descriptor: SfcDescriptor): string {
  return `data-mikuru-scope-${hash(`${descriptor.filename ?? ""}\n${descriptor.style ?? ""}`)}`;
}

function hash(value: string): string {
  let result = 5381;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33) ^ value.charCodeAt(index);
  }

  return (result >>> 0).toString(36);
}
