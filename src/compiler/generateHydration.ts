import { createCompileError, type SourceLocation } from "./errors.js";
import { componentPropEntries, createScopeAttr, emitComponentAttrs, emitComponentFallthrough, emitComponentProps, emitComponentPropsProxy, emitComponentRangeHelpers, emitComponentShow, emitTemplateRef, emitTransitionRegistration, eventHandlerExpression, generateChildren as generateDomChildren, generateNode as generateDomNode, getKeepAliveOptionExpression, getMemoExpression, getOnceMemoExpression, getTransitionOptionsExpression, normalizeScript, withoutForAttrs as withoutDomForAttrs } from "./generate.js";
import type { GenerateContext } from "./generate.js";
import { compileTemplateExpression, parseForExpression, validateAssignableExpression } from "./parseExpression.js";
import type { ExpressionLocationContext } from "./parseExpression.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TemplateRoot, TextNode } from "./types.js";

type HydrationContext = {
  lines: string[];
  index: number;
  teleportIndex: number;
  scopeAttr?: string;
  templateRefMode?: "single" | "array";
  componentContextVar?: string;
  debug?: boolean;
  batchedUpdates?: boolean;
  once?: boolean;
  source?: string;
  filename?: string;
};

type BindDirective = {
  name?: string;
  nameExpression?: string;
  modifiers: string[];
};

type EventDirective = {
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

type IfBranch = {
  node: ElementNode;
  condition?: string;
  directive: "v-if" | "v-else-if" | "v-else";
};

type SlotScopeBinding =
  | { kind: "props"; alias: string }
  | { kind: "property"; path: string[]; alias: string; defaultValue?: string }
  | { kind: "rest"; alias: string; exclude: string[] };

type GenerateHydrationOptions = {
  includeImports?: boolean;
  batchedUpdates?: boolean;
  debug?: boolean;
};

export function generateHydration(descriptor: SfcDescriptor, root: TemplateRoot, options: GenerateHydrationOptions = {}): string {
  const context: HydrationContext = {
    lines: [],
    index: 0,
    teleportIndex: 0,
    batchedUpdates: options.batchedUpdates === true,
    debug: options.debug === true,
    source: descriptor.source,
    filename: descriptor.filename
  };
  context.scopeAttr = descriptor.styleScoped ? createScopeAttr(descriptor) : undefined;
  const script = normalizeScript(descriptor, options.debug === true);

  if (options.includeImports !== false) {
    for (const importLine of script.imports) {
      emit(context, 0, importLine);
    }
    emit(context, 0, `import { effect, ref, setAttribute, unwrap${context.batchedUpdates ? ", queueJob" : ""} } from "mikuru/runtime";`);
    if (context.batchedUpdates) {
      emit(context, 0, "const __mikuru_effect = (fn) => effect(fn, { scheduler: queueJob });");
    }
    emit(context, 0, "");
  }

  emit(context, 0, "export function hydrate(target, props = {}) {");
  emit(context, 1, `const __mikuru_componentInfo = { component: ${quote(descriptor.filename ?? "anonymous.mikuru")}, filename: ${quote(descriptor.filename ?? "anonymous.mikuru")} };`);
  emit(context, 1, "const __mikuru_cleanup = [];");
  emit(context, 1, "let __mikuru_activeCleanup = __mikuru_cleanup;");
  emit(context, 1, "const __mikuru_afterUnmount = [];");
  emit(context, 1, "const __mikuru_mounted = [];");
  emit(context, 1, "const __mikuru_activated = [];");
  emit(context, 1, "const __mikuru_deactivated = [];");
  emit(context, 1, "const __mikuru_context = { parent: props.__mikuru_context, provides: new Map(), errorHandler: props.__mikuru_context?.errorHandler, ...__mikuru_componentInfo };");
  emit(context, 1, "const __mikuru_errorInfo = (phase) => ({ ...__mikuru_componentInfo, phase });");
  emit(context, 1, "const __mikuru_reportError = (error, errorHandler = __mikuru_context.errorHandler, phase = \"runtime\") => { if (typeof errorHandler === \"function\") { Promise.resolve().then(() => errorHandler(error, __mikuru_errorInfo(phase))); return; } setTimeout(() => { throw error; }); };");
  emit(context, 1, "const __mikuru_try = (fn, errorHandler, phase) => { try { return fn(); } catch (error) { __mikuru_reportError(error, errorHandler, phase); } };");
  emit(context, 1, "const __mikuru_memoEqual = (previous, next) => Array.isArray(previous) && Array.isArray(next) && previous.length === next.length && previous.every((value, index) => Object.is(value, next[index]));");
  emit(context, 1, "const __mikuru_guardEventHandler = (fn, errorHandler = __mikuru_context.errorHandler) => (...args) => __mikuru_try(() => fn(...args), errorHandler, \"event\");");
  emit(context, 1, "const __mikuru_runCleanup = (cleanups) => { for (const cleanup of cleanups.splice(0).reverse()) __mikuru_try(cleanup, undefined, \"cleanup\"); };");
  emit(context, 1, "const __mikuru_transitionFrame = (fn) => { const raf = globalThis.requestAnimationFrame; if (typeof raf === \"function\") { raf(() => raf(fn)); } else { setTimeout(fn, 0); } };");
  emit(context, 1, 'const __mikuru_transitionDone = (element, cleanup) => { let done = false; const finish = (event) => { if (event && event.target !== element) return; if (done) return; done = true; element.removeEventListener("transitionend", finish); element.removeEventListener("animationend", finish); cleanup(); }; element.addEventListener("transitionend", finish); element.addEventListener("animationend", finish); const style = globalThis.getComputedStyle?.(element); const times = (value) => String(value ?? "0s").split(",").map((part) => { const n = parseFloat(part); return Number.isFinite(n) ? n * (part.trim().endsWith("ms") ? 1 : 1000) : 0; }); const maxTime = (duration, delay) => duration.reduce((max, time, index) => Math.max(max, time + (delay[index % delay.length] ?? 0)), 0); const timeout = style ? Math.max(maxTime(times(style.transitionDuration), times(style.transitionDelay)), maxTime(times(style.animationDuration), times(style.animationDelay))) : 0; setTimeout(finish, Math.max(50, timeout + 20)); };');
  emit(context, 1, "const __mikuru_applyTransitionEnter = (element, transition) => { if (!element || element.nodeType !== 1 || !transition?.name) return; if (transition.appear === false && !transition.__mikuru_hasAppeared) { transition.__mikuru_hasAppeared = true; return; } transition.__mikuru_hasAppeared = true; const from = transition.enterFromClass || `${transition.name}-enter-from`; const active = transition.enterActiveClass || `${transition.name}-enter-active`; const to = transition.enterToClass || `${transition.name}-enter-to`; element.classList.add(from, active); __mikuru_transitionFrame(() => { element.classList.remove(from); element.classList.add(to); __mikuru_transitionDone(element, () => element.classList.remove(active, to)); }); };");
  emit(context, 1, 'const __mikuru_applyTransitionMove = (element, transition) => { if (!element || !transition?.name) return; const move = transition.moveClass || `${transition.name}-move`; for (const root of __mikuru_rangeElements(element)) { root.classList.add(move); __mikuru_transitionFrame(() => __mikuru_transitionDone(root, () => root.classList.remove(move))); } };');
  emit(context, 1, "const __mikuru_leavePromises = new Set();");
  emit(context, 1, "const __mikuru_removeNode = (node) => { if (!node?.parentNode) return Promise.resolve(); if (node.__mikuru_transitionLeaving) return node.__mikuru_leavePromise ?? Promise.resolve(); if (node.nodeType !== 1 || !node.__mikuru_transition) { node.remove(); return Promise.resolve(); } node.__mikuru_transitionLeaving = true; const transition = node.__mikuru_transition; const from = transition.leaveFromClass || `${transition.name}-leave-from`; const active = transition.leaveActiveClass || `${transition.name}-leave-active`; const to = transition.leaveToClass || `${transition.name}-leave-to`; node.classList.add(from, active); const pending = new Promise((resolve) => __mikuru_transitionFrame(() => { node.classList.remove(from); node.classList.add(to); __mikuru_transitionDone(node, () => { node.classList.remove(active, to); node.remove(); resolve(); }); })); node.__mikuru_leavePromise = pending; __mikuru_leavePromises.add(pending); pending.then(() => __mikuru_leavePromises.delete(pending)); return pending; };");
  emitComponentRangeHelpers(context as GenerateContext, 1);
  emit(context, 1, "const __mikuru_previousRegistrar = globalThis.__mikuru_currentRegistrar;");
  emit(context, 1, "globalThis.__mikuru_currentRegistrar = {");
  emit(context, 2, "registerMounted: (fn) => __mikuru_mounted.push(fn),");
  emit(context, 2, "registerBeforeUnmount: (fn) => __mikuru_cleanup.push(fn),");
  emit(context, 2, "registerUnmounted: (fn) => __mikuru_afterUnmount.push(fn),");
  emit(context, 2, "registerActivated: (fn) => __mikuru_activated.push(fn),");
  emit(context, 2, "registerDeactivated: (fn) => __mikuru_deactivated.push(fn),");
  emit(context, 2, "provide: (key, value) => __mikuru_context.provides.set(key, value),");
  emit(context, 2, "inject: (key) => {");
  emit(context, 3, "for (let context = __mikuru_context; context; context = context.parent) {");
  emit(context, 4, "if (context.provides?.has(key)) return { found: true, value: context.provides.get(key) };");
  emit(context, 3, "}");
  emit(context, 3, "return { found: false };");
  emit(context, 2, "},");
  emit(context, 2, "registerEffect: (fn) => Promise.resolve().then(fn)");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_emitDebug = (type, payload) => { const hook = globalThis.__MIKURU_DEVTOOLS__; if (!hook) return; const event = { version: 1, type, timestamp: Date.now(), payload }; hook.events ??= []; hook.events.push(event); if (typeof hook.emit === \"function\") hook.emit(event); for (const listener of hook.listeners ?? []) { try { listener(event); } catch (error) { setTimeout(() => { throw error; }); } } };");
  emit(context, 1, "const __mikuru_domPath = (node) => { if (!node) return \"missing\"; const parts = []; for (let cursor = node.nodeType === 1 ? node : node.parentElement; cursor && cursor.nodeType === 1; cursor = cursor.parentElement) { const tag = cursor.tagName.toLowerCase(); const siblings = cursor.parentElement ? Array.from(cursor.parentElement.children).filter((child) => child.tagName === cursor.tagName) : []; const index = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(cursor) + 1})` : \"\"; parts.unshift(`${tag}${index}`); } return parts.join(\" > \") || __mikuru_describeNode(node); };");
  emit(context, 1, "const __mikuru_inferDiagnostic = (message) => { const action = message.includes(\"falling back to mount\") ? \"mount-fallback\" : message.includes(\"remounting\") ? \"remount\" : message.includes(\"Recovery was disabled\") || message.endsWith(\".\") ? \"warn-only\" : \"sync-dom\"; const kind = message.startsWith(\"Root mismatch\") ? \"root\" : message.startsWith(\"Element mismatch\") ? \"element\" : message.startsWith(\"Text mismatch\") || message.startsWith(\"Text content mismatch\") ? \"text\" : message.startsWith(\"Attribute mismatch\") ? \"attribute\" : message.startsWith(\"v-model\") ? \"model\" : message.startsWith(\"Extra DOM nodes\") ? \"extra-node\" : message.startsWith(\"Teleport\") ? \"teleport\" : message.startsWith(\"Component\") || message.startsWith(\"Dynamic component\") ? \"component\" : message.startsWith(\"Branch\") ? \"branch\" : message.startsWith(\"List\") ? \"list\" : \"hydration\"; const match = message.match(/expected\\s+(.+?),\\s+got\\s+(.+?)(?:[.;]|$)/); return { action, kind, expected: match?.[1], actual: match?.[2] }; };");
  emit(context, 1, "const __mikuru_hydrationDiagnostic = (message, details = {}) => { const inferred = __mikuru_inferDiagnostic(message); const node = details.node; const diagnostic = { ...__mikuru_componentInfo, source: \"hydration\", level: \"warning\", phase: \"hydration\", message, ...inferred, ...details }; delete diagnostic.node; if (!diagnostic.domPath && node) diagnostic.domPath = __mikuru_domPath(node); return diagnostic; };");
  emit(context, 1, "const __mikuru_warn = (message, details = {}) => { const diagnostic = __mikuru_hydrationDiagnostic(message, details); __mikuru_emitDebug(\"hydration:warning\", { ...diagnostic, diagnostic }); if (typeof console !== \"undefined\" && console.warn) console.warn(`[Mikuru hydration] ${message} (phase: ${diagnostic.phase}, component: ${diagnostic.component}, file: ${diagnostic.filename})`); };");
  emit(context, 1, "const __mikuru_describeNode = (node) => { if (!node) return \"missing\"; if (node.nodeType === 1) return `<${node.tagName?.toLowerCase?.() ?? \"element\"}>`; if (node.nodeType === 3) return `text(${JSON.stringify(node.nodeValue ?? \"\")})`; if (node.nodeType === 8) return `comment(${JSON.stringify(node.nodeValue ?? \"\")})`; return `nodeType(${node.nodeType})`; };");
  emit(context, 1, "const __mikuru_restoreRegistrar = () => { if (__mikuru_previousRegistrar === undefined) { delete globalThis.__mikuru_currentRegistrar; } else { globalThis.__mikuru_currentRegistrar = __mikuru_previousRegistrar; } };");
  emit(context, 1, "const __mikuru_recovery = {};");
  emit(context, 1, "let __mikuru_recovered;");
  emit(context, 1, "const __mikuru_recover = (message, details = {}) => {");
  emit(context, 2, "if (props.__mikuru_hydration?.recover === false) { __mikuru_warn(message + \".\", { action: \"warn-only\", ...details }); return; }");
  emit(context, 2, "__mikuru_warn(message + \"; remounting.\", { action: \"remount\", ...details });");
  emit(context, 2, "for (const cleanup of __mikuru_cleanup.splice(0).reverse()) __mikuru_try(cleanup);");
  emit(context, 2, "for (const cb of __mikuru_afterUnmount.splice(0).reverse()) __mikuru_try(cb);");
  emit(context, 2, "__mikuru_restoreRegistrar();");
  emit(context, 2, 'if (target.nodeType === 8 && target.nodeValue === "mikuru-fragment") {');
  emit(context, 3, 'const end = __mikuru_findRangeEnd(target);');
  emit(context, 3, 'const parent = target.parentNode;');
  emit(context, 3, 'const anchor = document.createComment("mikuru-recover-fragment");');
  emit(context, 3, 'parent?.insertBefore(anchor, target);');
  emit(context, 3, 'if (end) __mikuru_removeRange(target, end); else target.remove();');
  emit(context, 3, 'const fragment = document.createDocumentFragment();');
  emit(context, 3, '__mikuru_recovered = mount(fragment, props);');
  emit(context, 3, 'parent?.insertBefore(fragment, anchor);');
  emit(context, 3, 'anchor.remove();');
  emit(context, 3, 'target.__mikuru_replacementEnd = __mikuru_recovered.__mikuru_end ?? __mikuru_recovered.element;');
  emit(context, 2, '} else {');
  emit(context, 3, 'if (target.nodeType === 1) target.innerHTML = "";');
  emit(context, 3, '__mikuru_recovered = mount(target, props);');
  emit(context, 2, '}');
  emit(context, 2, "throw __mikuru_recovery;");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_findComment = (parent, value) => Array.from(parent.childNodes ?? []).find((node) => node.nodeType === 8 && node.nodeValue === value);");
  emit(context, 1, "const __mikuru_findNextComment = (node, value) => { for (let cursor = node.nextSibling; cursor; cursor = cursor.nextSibling) { if (cursor.nodeType === 8 && cursor.nodeValue === value) return cursor; } return undefined; };");
  emit(context, 1, 'const __mikuru_isComponentRoot = (node) => node?.nodeType === 1 || (node?.nodeType === 8 && node.nodeValue === "mikuru-fragment");');
  emit(context, 1, 'const __mikuru_advanceComponent = (parent, index, node) => { const end = node?.__mikuru_replacementEnd ?? (node?.nodeType === 8 && node.nodeValue === "mikuru-fragment" ? __mikuru_findRangeEnd(node) : undefined); const endIndex = end ? Array.prototype.indexOf.call(parent.childNodes, end) : -1; return endIndex >= 0 ? endIndex + 1 : index + 1; };');
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
      emit(context, 2, "if (handler) __mikuru_try(() => handler(...args), undefined, \"emit\");");
      emit(context, 1, "};");
    }
    emitRaw(context, script.body.trim(), 1);
    emit(context, 1, "");
  }
  const generatedEffectsStart = context.lines.length;
  if (root.type === "fragment") {
    emit(context, 1, 'const __mikuru_root = target.nodeType === 8 && target.nodeValue === "mikuru-fragment" ? target : __mikuru_findComment(target, "mikuru-fragment");');
    emit(context, 1, 'const __mikuru_rootEnd = __mikuru_root && __mikuru_findRangeEnd(__mikuru_root);');
    emit(context, 1, 'if (__mikuru_root && __mikuru_rootEnd) __mikuru_root.__mikuru_end = __mikuru_rootEnd;');
    emit(context, 1, 'if (!__mikuru_root || !__mikuru_rootEnd) { __mikuru_warn("Root fragment marker mismatch; falling back to mount()."); __mikuru_restoreRegistrar(); if (target.nodeType === 1) target.innerHTML = ""; return mount(target, props); }');
    emit(context, 1, 'const __mikuru_rootParent = __mikuru_root.parentNode;');
    emit(context, 1, 'const __mikuru_rootProxy = { get childNodes() { const nodes = []; for (let node = __mikuru_root.nextSibling; node && node !== __mikuru_rootEnd; node = node.nextSibling) nodes.push(node); return nodes; }, insertBefore(child, before) { __mikuru_rootParent.insertBefore(child, before ?? __mikuru_rootEnd); }, appendChild(child) { __mikuru_rootParent.insertBefore(child, __mikuru_rootEnd); }, __mikuru_parent: __mikuru_rootParent, __mikuru_after: __mikuru_rootEnd };');
  } else {
    emit(context, 1, "const __mikuru_root = target.nodeType === 1 && target.tagName?.toLowerCase() === " + quote(root.tag.toLowerCase()) + " ? target : target.firstElementChild;");
    emit(context, 1, `if (!__mikuru_root || __mikuru_root.tagName?.toLowerCase() !== ${quote(root.tag.toLowerCase())}) { __mikuru_warn("Root mismatch: expected <${root.tag.toLowerCase()}>, got " + __mikuru_describeNode(__mikuru_root) + "; falling back to mount().", { kind: "root", expected: "<${root.tag.toLowerCase()}>", actual: __mikuru_describeNode(__mikuru_root), action: "mount-fallback", node: __mikuru_root }); __mikuru_restoreRegistrar(); return mount(target, props); }`);
  }
  emit(context, 1, "try {");
  if (root.type === "fragment") hydrateChildren(context, root.children, "__mikuru_rootProxy", 2);
  else hydrateElement(context, root, "__mikuru_root", 2);
  emit(context, 1, "} catch (error) {");
  emit(context, 2, "if (error === __mikuru_recovery) { return __mikuru_recovered; }");
  emit(context, 2, "throw error;");
  emit(context, 1, "}");
  emit(context, 1, "for (const cb of __mikuru_mounted.splice(0)) { __mikuru_try(cb); }");
  emit(context, 1, "__mikuru_restoreRegistrar();");
  emit(context, 1, "return {");
  if (root.type === "fragment") {
    emit(context, 2, "__mikuru_start: __mikuru_root, __mikuru_end: __mikuru_rootEnd,");
    emit(context, 2, "get element() { return __mikuru_root.nextSibling && __mikuru_root.nextSibling !== __mikuru_rootEnd ? __mikuru_root.nextSibling : __mikuru_root; },");
    emit(context, 2, "get roots() { return __mikuru_rootProxy.childNodes; },");
  } else {
    emit(context, 2, "element: __mikuru_root,");
    emit(context, 2, "get roots() { return [__mikuru_root]; },");
  }
  emit(context, 2, 'activate() { for (const cb of __mikuru_activated) __mikuru_try(cb, undefined, "activated"); },');
  emit(context, 2, 'deactivate() { for (const cb of __mikuru_deactivated) __mikuru_try(cb, undefined, "deactivated"); },');
  emit(context, 2, `unmount() { for (const cleanup of __mikuru_cleanup.splice(0).reverse()) __mikuru_try(cleanup); for (const cb of __mikuru_afterUnmount.splice(0).reverse()) __mikuru_try(cb); ${root.type === "fragment" ? "__mikuru_removeRange(__mikuru_root, __mikuru_rootEnd);" : ""} }`);
  emit(context, 1, "};");
  emit(context, 0, "}");

  const lines = context.batchedUpdates
    ? context.lines.map((line, index) => index >= generatedEffectsStart ? line.replaceAll("effect(() =>", "__mikuru_effect(() =>") : line)
    : context.lines;
  return `${lines.join("\n")}\n`;
}

function hydrateNode(context: HydrationContext, node: TemplateNode, nodeVar: string, indent: number): void {
  if (node.type === "text") {
    hydrateText(context, node, nodeVar, indent);
    return;
  }
  hydrateElement(context, node, nodeVar, indent);
}

function hydrateElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  if (getAttr(node, "v-pre")) {
    hydratePreElement(context, node, elementVar, indent);
    return;
  }

  if (node.tag === "Teleport") {
    hydrateTeleport(context, node, elementVar, indent);
    return;
  }

  if (node.tag === "KeepAlive") {
    hydrateKeepAliveElement(context, node, elementVar, indent);
    return;
  }

  if (node.tag === "AsyncBoundary") {
    hydrateAsyncBoundaryElement(context, node, elementVar, indent);
    return;
  }

  if (node.tag === "ErrorBoundary") {
    hydrateErrorBoundaryElement(context, node, elementVar, indent);
    return;
  }

  if (node.tag === "TransitionGroup") {
    hydrateTransitionGroupElement(context, node, elementVar, indent);
    return;
  }

  if (node.tag === "Transition") {
    hydrateTransitionElement(context, node, elementVar, indent);
    return;
  }

  if (isComponentTag(node.tag)) {
    hydrateComponent(context, node, elementVar, indent);
    return;
  }

  hydrateAttrs(context, node, elementVar, indent);
  hydrateEvents(context, node, elementVar, indent);
  const contentDirective = getContentDirectiveAttr(node);
  const textareaModel = node.tag === "textarea" && hasElementModel(node);
  const hydrateChildrenBeforeModel = node.tag === "select" && !contentDirective;
  if (hydrateChildrenBeforeModel) {
    hydrateChildren(context, node.children, elementVar, indent);
  }
  hydrateModelAndShow(context, node, elementVar, indent);
  hydrateContentDirective(context, node, elementVar, indent);
  hydrateTemplateRef(context, node, elementVar, indent);
  if (textareaModel) {
    emit(context, indent, `if (${elementVar}.childNodes.length > 0) { const __mikuru_textarea_value = ${elementVar}.value; ${elementVar}.textContent = ""; ${elementVar}.value = __mikuru_textarea_value; }`);
  }
  if (!contentDirective && !hydrateChildrenBeforeModel && !textareaModel) {
    hydrateChildren(context, node.children, elementVar, indent);
  }
}

function hydrateChildren(context: HydrationContext, rawChildren: TemplateNode[], parentVar: string, indent: number): void {
  const children = rawChildren.filter(isHydratableNode);
  const domIndexVar = nextName(context, "domIndex");
  emit(context, indent, `let ${domIndexVar} = 0;`);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    if (child.type === "element" && child.tag === "Teleport") {
      hydrateTeleportAtIndex(context, child, parentVar, domIndexVar, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "component") {
      hydrateDynamicComponentAtIndex(context, child, parentVar, domIndexVar, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "KeepAlive") {
      hydrateKeepAliveAtIndex(context, child, parentVar, domIndexVar, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "AsyncBoundary") {
      hydrateAsyncBoundaryAtIndex(context, child, parentVar, domIndexVar, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "ErrorBoundary") {
      hydrateErrorBoundaryAtIndex(context, child, parentVar, domIndexVar, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "TransitionGroup") {
      hydrateTransitionGroupAtIndex(context, child, parentVar, domIndexVar, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "Transition") {
      hydrateTransitionAtIndex(context, child, parentVar, domIndexVar, indent);
      continue;
    }

    if (child.type === "element" && getAttr(child, "v-if") && !getAttr(child, "v-pre")) {
      const { branches, nextIndex } = collectIfBranches(children, index);
      hydrateIfChain(context, branches, parentVar, domIndexVar, indent);
      index = nextIndex - 1;
      continue;
    }

    if (child.type === "element" && (getAttr(child, "v-else-if") || getAttr(child, "v-else"))) {
      continue;
    }

    if (child.type === "element" && getAttr(child, "v-for") && !getAttr(child, "v-pre")) {
      hydrateFor(context, child, parentVar, domIndexVar, indent, domIndexVar);
      continue;
    }

    if (child.type === "element" && child.tag === "template") {
      hydrateFragmentChildrenAtIndex(context, child.children, parentVar, domIndexVar, indent);
      continue;
    }

    const childVar = nextName(context, "node");
    emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndexVar}];`);
    if (child.type === "element") {
      const elementCheck = isComponentTag(child.tag)
        ? `!__mikuru_isComponentRoot(${childVar})`
        : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(child.tag.toLowerCase())}`;
      emit(context, indent, `if (${elementCheck}) { __mikuru_recover(${quote(`Element mismatch: expected <${child.tag.toLowerCase()}>, got `)} + __mikuru_describeNode(${childVar}), { kind: "element", expected: "<${child.tag.toLowerCase()}>", actual: __mikuru_describeNode(${childVar}), node: ${childVar} }); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    } else {
      emit(context, indent, `if (!${childVar} || ${childVar}.nodeType !== 3) { __mikuru_recover("Text mismatch: expected text, got " + __mikuru_describeNode(${childVar}), { kind: "text", expected: "text", actual: __mikuru_describeNode(${childVar}), node: ${childVar} }); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    }
    emit(context, indent, child.type === "element" && isComponentTag(child.tag)
      ? `${domIndexVar} = __mikuru_advanceComponent(${parentVar}, ${domIndexVar}, ${childVar});`
      : `${domIndexVar} += 1;`);
  }
  emit(context, indent, `if (${parentVar}.childNodes.length > ${domIndexVar}) { __mikuru_warn("Extra DOM nodes after hydration: " + Array.from(${parentVar}.childNodes).slice(${domIndexVar}).map(__mikuru_describeNode).join(", ") + "."); }`);
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
  const parentProxyVar = nextName(context, "teleportParent");
  const toExpression = getTeleportToExpression(context, node);
  const disabledExpression = getTeleportDisabledExpression(context, node);

  emit(context, indent, `const ${startVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent, `const ${endVar} = ${startVar} ? __mikuru_findNextComment(${startVar}, ${quote(`/teleport:${id}`)}) : undefined;`);
  emit(context, indent, `if (!${startVar} || ${startVar}.nodeType !== 8 || ${startVar}.nodeValue !== ${quote(`teleport:${id}`)} || !${endVar}) {`);
  emit(context, indent + 1, "__mikuru_recover(\"Teleport marker mismatch\");");
  emit(context, indent, "} else {");
  emit(context, indent + 1, `const ${disabledVar} = Boolean(unwrap(${disabledExpression}));`);
  emit(context, indent + 1, `const ${targetVar} = ${disabledVar} ? undefined : (typeof unwrap(${toExpression}) === "string" ? document.querySelector(unwrap(${toExpression})) : unwrap(${toExpression}));`);
  emit(context, indent + 1, `if (!${disabledVar} && !${targetVar}) { __mikuru_warn("Teleport target was not found."); } else {`);
  emit(context, indent + 2, `const ${contentStartVar} = ${disabledVar} ? ${startVar} : __mikuru_findComment(${targetVar}, ${quote(`teleport content:${id}`)});`);
  emit(context, indent + 2, `const ${contentEndVar} = ${disabledVar} ? ${endVar} : __mikuru_findComment(${targetVar}, ${quote(`/teleport content:${id}`)});`);
  emit(context, indent + 2, `if (!${contentStartVar} || !${contentEndVar}) { __mikuru_recover("Teleport content marker mismatch"); } else {`);
  emit(context, indent + 3, `const ${parentProxyVar} = {`);
  emit(context, indent + 4, `get childNodes() { const nodes = []; for (let cursor = ${contentStartVar}.nextSibling; cursor && cursor !== ${contentEndVar}; cursor = cursor.nextSibling) nodes.push(cursor); return nodes; },`);
  emit(context, indent + 4, `insertBefore(child, before) { ${contentEndVar}.parentNode?.insertBefore(child, before ?? ${contentEndVar}); },`);
  emit(context, indent + 4, `appendChild(child) { ${contentEndVar}.parentNode?.insertBefore(child, ${contentEndVar}); },`);
  emit(context, indent + 4, `__mikuru_parent: ${contentEndVar}.parentNode, __mikuru_after: ${contentEndVar}`);
  emit(context, indent + 3, `};`);
  hydrateChildren(context, node.children, parentProxyVar, indent + 3);
  emit(context, indent + 3, `if (!${disabledVar}) __mikuru_activeCleanup.push(() => { ${contentStartVar}.remove(); ${contentEndVar}.remove(); });`);
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
  const elementCheck = isComponentTag(node.tag)
    ? `!__mikuru_isComponentRoot(${childVar})`
    : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(node.tag.toLowerCase())}`;
  emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent, `if (unwrap(${compileHydrationExpression(context, condition, "v-if")})) {`);
  emit(context, indent + 1, `if (${elementCheck}) { __mikuru_recover("Branch mismatch: dynamic v-if expected " + __mikuru_describeNode(${childVar})); } else {`);
  hydrateElement(context, withoutAttrs(node, ["v-if"]), childVar, indent + 2);
  emit(context, indent + 1, "}");
  emit(context, indent, `} else if (${childVar}) {`);
  emit(context, indent + 1, "__mikuru_recover(\"Branch mismatch: expected no v-if DOM for initial state\");");
  emit(context, indent, "}");
}

function hydrateIfChain(context: HydrationContext, branches: IfBranch[], parentVar: string, domIndex: string, indent: number, transitionNode?: ElementNode): void {
  const startIndexVar = nextName(context, "ifStartIndex");
  const firstVar = nextName(context, "ifFirst");
  const afterVar = nextName(context, "ifAfter");
  const startAnchorVar = nextName(context, "ifStart");
  const endAnchorVar = nextName(context, "ifEnd");
  const branchCleanupVar = nextName(context, "ifCleanup");
  const ownerCleanupVar = nextName(context, "ifOwnerCleanup");
  const selectedVar = nextName(context, "ifSelected");
  const nextVar = nextName(context, "ifNext");
  const parentNodeVar = nextName(context, "ifParent");
  const stopVar = nextName(context, "stop");
  const selectVar = nextName(context, "selectIf");
  const updateVar = nextName(context, "updateIf");
  const disposedVar = nextName(context, "ifDisposed");
  const transitionVar = transitionNode ? nextName(context, "ifTransition") : undefined;
  const renderTokenVar = transitionNode ? nextName(context, "ifRenderToken") : undefined;
  const hadBranchVar = transitionNode ? nextName(context, "ifHadBranch") : undefined;
  const renderVar = transitionNode ? nextName(context, "renderIf") : undefined;
  emit(context, indent, `const ${startIndexVar} = ${domIndex};`);
  emit(context, indent, `const ${branchCleanupVar} = [];`);
  emit(context, indent, `const ${ownerCleanupVar} = __mikuru_activeCleanup;`);
  emit(context, indent, `let ${startAnchorVar};`);
  emit(context, indent, `let ${endAnchorVar};`);
  emit(context, indent, `let ${selectedVar} = -1;`);
  emit(context, indent, `let ${disposedVar} = false;`);
  if (transitionVar && transitionNode && renderTokenVar) {
    emit(context, indent, `const ${transitionVar} = ${getTransitionOptionsExpression(context as GenerateContext, transitionNode)};`);
    emit(context, indent, `${transitionVar}.__mikuru_hasAppeared = true;`);
    emit(context, indent, `let ${renderTokenVar} = 0;`);
  }
  emit(context, indent, `${ownerCleanupVar}.push(() => { ${disposedVar} = true; ${renderTokenVar ? `++${renderTokenVar}; ` : ""}${stopVar}?.(); __mikuru_runCleanup(${branchCleanupVar}); ${startAnchorVar}?.remove(); ${endAnchorVar}?.remove(); });`);
  emit(context, indent, `let ${stopVar};`);
  emit(context, indent, `__mikuru_activeCleanup = ${branchCleanupVar};`);
  branches.forEach((branch, index) => {
    if (index === 0) {
      emit(context, indent, `if (unwrap(${compileHydrationExpression(context, branch.condition ?? "", "v-if")})) {`);
    } else if (branch.directive === "v-else-if") {
      emit(context, indent, `else if (unwrap(${compileHydrationExpression(context, branch.condition ?? "", "v-else-if")})) {`);
    } else {
      emit(context, indent, "else {");
    }

    emit(context, indent + 1, `${selectedVar} = ${index};`);
    hydrateFragmentChildrenAtIndex(context, ifBranchChildren(branch.node), parentVar, domIndex, indent + 1);
    emit(context, indent, "}");
  });
  emit(context, indent, `__mikuru_activeCleanup = ${ownerCleanupVar};`);
  emit(context, indent, `const ${firstVar} = ${parentVar}.childNodes[${startIndexVar}] ?? null;`);
  emit(context, indent, `const ${afterVar} = ${parentVar}.childNodes[${domIndex}] ?? ${parentVar}.__mikuru_after ?? null;`);
  emit(context, indent, `${startAnchorVar} = document.createComment("if");`);
  emit(context, indent, `${endAnchorVar} = document.createComment("/if");`);
  emit(context, indent, `${parentVar}.insertBefore(${startAnchorVar}, ${firstVar} ?? ${afterVar});`);
  emit(context, indent, `${parentVar}.insertBefore(${endAnchorVar}, ${afterVar});`);
  emit(context, indent, `${domIndex} += 2;`);
  if (transitionVar) {
    emit(context, indent, `if (${selectedVar} >= 0) for (let node = ${startAnchorVar}.nextSibling; node && node !== ${endAnchorVar}; node = node.nextSibling) { if (node.nodeType === 1) { node.__mikuru_transition = ${transitionVar}; node.__mikuru_transitionLeaving = false; } }`);
  }
  emit(context, indent, `let ${nextVar} = -1;`);
  emit(context, indent, `const ${selectVar} = () => {`);
  emit(context, indent + 1, `${nextVar} = -1;`);
  branches.forEach((branch, index) => {
    if (branch.directive === "v-else") {
      emit(context, indent + 1, `${index === 0 ? "if (true)" : "else"} { ${nextVar} = ${index}; }`);
    } else {
      const condition = compileHydrationExpression(context, branch.condition ?? "", branch.directive);
      emit(context, indent + 1, `${index === 0 ? "if" : "else if"} (unwrap(${condition})) { ${nextVar} = ${index}; }`);
    }
  });
  emit(context, indent, `};`);
  emit(context, indent, `const ${updateVar} = () => {`);
  emit(context, indent + 1, `if (${nextVar} === ${selectedVar}) return;`);
  emit(context, indent + 1, `const ${parentNodeVar} = ${startAnchorVar}.parentNode;`);
  if (hadBranchVar) {
    emit(context, indent + 1, `const ${hadBranchVar} = ${startAnchorVar}.nextSibling !== ${endAnchorVar};`);
    emit(context, indent + 1, `const __mikuru_previousLeaves = new Set(__mikuru_leavePromises);`);
  }
  emit(context, indent + 1, `__mikuru_runCleanup(${branchCleanupVar});`);
  emitHydrationRemoveBetween(context, indent + 1, startAnchorVar, endAnchorVar);
  emit(context, indent + 1, `${selectedVar} = ${nextVar};`);
  if (renderVar && renderTokenVar) {
    const currentTokenVar = nextName(context, "ifCurrentToken");
    emit(context, indent + 1, `const ${currentTokenVar} = ++${renderTokenVar};`);
    emit(context, indent + 1, `const ${renderVar} = () => {`);
    emit(context, indent + 2, `if (${disposedVar} || ${currentTokenVar} !== ${renderTokenVar}) return;`);
  }
  const branchIndent = renderVar ? indent + 2 : indent + 1;
  branches.forEach((branch, index) => {
    emit(context, branchIndent, `if (${nextVar} === ${index}) {`);
    const node = withoutAttrs(branch.node, ["v-if", "v-else-if", "v-else"]);
    if (node.tag === "template") {
      const beforeNew = transitionVar ? nextName(context, "ifPrevious") : undefined;
      if (beforeNew) emit(context, branchIndent + 1, `const ${beforeNew} = ${endAnchorVar}.previousSibling;`);
      generateDomChildren(context as GenerateContext, node.children, parentNodeVar, branchCleanupVar, branchIndent + 1, endAnchorVar);
      if (beforeNew && transitionVar) {
        emit(context, branchIndent + 1, `for (let node = ${beforeNew}?.nextSibling; node && node !== ${endAnchorVar}; node = node.nextSibling) { if (node.nodeType === 1) { node.__mikuru_transition = ${transitionVar}; node.__mikuru_transitionLeaving = false; __mikuru_applyTransitionEnter(node, ${transitionVar}); } }`);
      }
    } else {
      const branchVar = generateDomNode(context as GenerateContext, node, parentNodeVar, branchCleanupVar, branchIndent + 1, endAnchorVar);
      if (transitionVar) {
        emitTransitionRegistration(context as GenerateContext, branchVar, transitionVar, branchIndent + 1);
      }
    }
    emit(context, branchIndent, `}`);
  });
  if (renderVar && transitionVar && hadBranchVar) {
    emit(context, indent + 1, `};`);
    emit(context, indent + 1, `if (${transitionVar}.mode === "out-in" && ${hadBranchVar}) Promise.all(Array.from(__mikuru_leavePromises).filter((pending) => !__mikuru_previousLeaves.has(pending))).then(${renderVar}); else ${renderVar}();`);
  }
  emit(context, indent, `};`);
  if (context.batchedUpdates) {
    const runnerVar = nextName(context, "ifRunner");
    const jobVar = nextName(context, "ifJob");
    emit(context, indent, `let ${runnerVar};`);
    emit(context, indent, `const ${jobVar} = () => { if (${disposedVar}) return; ${runnerVar}(); ${updateVar}(); };`);
    emit(context, indent, `${stopVar} = effect(${selectVar}, { scheduler: (runner) => { ${runnerVar} = runner; queueJob(${jobVar}); } });`);
  } else {
    emit(context, indent, `${stopVar} = effect(${selectVar}, { scheduler: (runner) => { if (${disposedVar}) return; runner(); ${updateVar}(); } });`);
  }
}

function ifBranchChildren(node: ElementNode): TemplateNode[] {
  if (node.tag === "template") {
    return node.children;
  }

  return [withoutAttrs(node, ["v-if", "v-else-if", "v-else"])];
}

function collectIfBranches(children: TemplateNode[], startIndex: number): { branches: IfBranch[]; nextIndex: number } {
  const first = children[startIndex];
  if (first?.type !== "element") {
    return { branches: [], nextIndex: startIndex + 1 };
  }

  const branches: IfBranch[] = [{ node: first, condition: getAttrValue(first, "v-if"), directive: "v-if" }];
  let cursor = startIndex + 1;

  while (cursor < children.length) {
    const candidate = children[cursor];
    if (candidate?.type !== "element") {
      break;
    }

    if (getAttr(candidate, "v-else-if")) {
      branches.push({ node: candidate, condition: getAttrValue(candidate, "v-else-if"), directive: "v-else-if" });
      cursor += 1;
      continue;
    }

    if (getAttr(candidate, "v-else")) {
      branches.push({ node: candidate, directive: "v-else" });
      cursor += 1;
    }

    break;
  }

  return { branches, nextIndex: cursor };
}

function hydrateFor(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number, _advanceVar?: string, transitionNode?: ElementNode): void {
  const attr = getAttr(node, "v-for");
  if (!attr || attr.value === true) {
    return;
  }

  const forExpression = parseForExpression(String(attr.value));
  if (getKeyExpression(node)) {
    hydrateKeyedFor(context, node, parentVar, domIndex, indent, forExpression, transitionNode);
    return;
  }
  const positionName = forExpression.index ?? nextName(context, "forPosition");
  hydrateKeyedFor(context, node, parentVar, domIndex, indent, { ...forExpression, index: positionName }, transitionNode, true);
}

function hydrateKeyedFor(
  context: HydrationContext,
  node: ElementNode,
  parentVar: string,
  domIndex: string,
  indent: number,
  forExpression: { item: string; index?: string; source: string },
  transitionNode?: ElementNode,
  positional = false
): void {
  const template = node.tag === "template";
  const compiledSource = compileHydrationExpression(context, forExpression.source, "v-for source");
  const compiledKey = positional ? forExpression.index! : compileHydrationExpression(context, getKeyExpression(node)!, "v-for key");
  const compiledMemo = getMemoExpression(context as GenerateContext, node) ?? getOnceMemoExpression(context as GenerateContext, node);
  const recordsVar = nextName(context, "forRecords");
  const ownerCleanupVar = nextName(context, "forOwnerCleanup");
  const pendingCleanupVar = nextName(context, "forPendingCleanup");
  const startIndexVar = nextName(context, "forStartIndex");
  const startAnchorVar = nextName(context, "forStart");
  const endAnchorVar = nextName(context, "forEnd");
  const stopVar = nextName(context, "stop");
  const listVar = nextName(context, "forList");
  const rawItemVar = nextName(context, "forRawItem");
  const indexVar = nextName(context, "forIndex");
  const itemRefVar = nextName(context, "forItemRef");
  const indexRefVar = forExpression.index ? nextName(context, "forIndexRef") : undefined;
  const keyVar = nextName(context, "forKey");
  const memoVar = compiledMemo ? nextName(context, "forMemo") : undefined;
  const recordCleanupVar = nextName(context, "forRecordCleanup");
  const recordVar = nextName(context, "forRecord");
  const transitionVar = transitionNode ? nextName(context, "forTransition") : undefined;

  emit(context, indent, `const ${recordsVar} = new Map();`);
  emit(context, indent, `const ${ownerCleanupVar} = __mikuru_activeCleanup;`);
  emit(context, indent, `let ${pendingCleanupVar} = null;`);
  emit(context, indent, `let ${startAnchorVar}, ${endAnchorVar}, ${stopVar};`);
  emit(context, indent, `${ownerCleanupVar}.push(() => {`);
  emit(context, indent + 1, `${stopVar}?.();`);
  emit(context, indent + 1, `if (${pendingCleanupVar}) __mikuru_runCleanup(${pendingCleanupVar});`);
  emit(context, indent + 1, `for (const ${recordVar} of ${recordsVar}.values()) __mikuru_runCleanup(${recordVar}.cleanups);`);
  emit(context, indent + 1, `${recordsVar}.clear();`);
  emit(context, indent + 1, `${startAnchorVar}?.remove(); ${endAnchorVar}?.remove();`);
  emit(context, indent, `});`);
  if (transitionNode && transitionVar) {
    emit(context, indent, `const ${transitionVar} = ${getTransitionOptionsExpression(context as GenerateContext, transitionNode)};`);
    emit(context, indent, `${transitionVar}.__mikuru_hasAppeared = true;`);
  }
  emit(context, indent, `const ${startIndexVar} = ${domIndex};`);
  emit(context, indent, `const ${listVar} = Array.from(unwrap(${compiledSource}) ?? []);`);
  emit(context, indent, `for (const [${indexVar}, ${rawItemVar}] of ${listVar}.entries()) {`);
  emit(context, indent + 1, `const ${itemRefVar} = ref(${rawItemVar});`);
  emit(context, indent + 1, `const ${forExpression.item} = ${itemRefVar};`);
  if (forExpression.index && indexRefVar) {
    emit(context, indent + 1, `const ${indexRefVar} = ref(${indexVar});`);
    emit(context, indent + 1, `const ${forExpression.index} = ${indexRefVar};`);
  }
  emit(context, indent + 1, `const ${keyVar} = unwrap(${compiledKey});`);
  if (compiledMemo && memoVar) {
    emit(context, indent + 1, `const ${memoVar} = ${compiledMemo};`);
  }
  emit(context, indent + 1, `const ${recordCleanupVar} = [];`);
  emit(context, indent + 1, `${pendingCleanupVar} = ${recordCleanupVar};`);
  emit(context, indent + 1, `__mikuru_activeCleanup = ${recordCleanupVar};`);
  if (template) {
    const rowIndexVar = nextName(context, "forRowIndex");
    const rowFirstVar = nextName(context, "forRowFirst");
    const rowAfterVar = nextName(context, "forRowAfter");
    const rowStartVar = nextName(context, "forRowStart");
    const rowEndVar = nextName(context, "forRowEnd");
    emit(context, indent + 1, `const ${rowIndexVar} = ${domIndex};`);
    withTemplateRefMode(context, "array", () => {
      hydrateFragmentChildrenAtIndex(context, node.children, parentVar, domIndex, indent + 1);
    });
    emit(context, indent + 1, `const ${rowFirstVar} = ${parentVar}.childNodes[${rowIndexVar}] ?? null;`);
    emit(context, indent + 1, `const ${rowAfterVar} = ${parentVar}.childNodes[${domIndex}] ?? null;`);
    emit(context, indent + 1, `const ${rowStartVar} = document.createComment("for item");`);
    emit(context, indent + 1, `const ${rowEndVar} = document.createComment("/for item");`);
    emit(context, indent + 1, `${parentVar}.insertBefore(${rowStartVar}, ${rowFirstVar} ?? ${rowAfterVar} ?? ${parentVar}.__mikuru_after ?? null);`);
    emit(context, indent + 1, `${parentVar}.insertBefore(${rowEndVar}, ${rowAfterVar} ?? ${parentVar}.__mikuru_after ?? null);`);
    emit(context, indent + 1, `${domIndex} += 2;`);
    emit(context, indent + 1, `${recordsVar}.set(${keyVar}, { start: ${rowStartVar}, end: ${rowEndVar}, cleanups: ${recordCleanupVar}, item: ${itemRefVar}${indexRefVar ? `, index: ${indexRefVar}` : ""}${memoVar ? `, memo: ${memoVar}` : ""} });`);
  } else {
    const rowVar = nextName(context, "forRow");
    const actualRowVar = nextName(context, "forActualRow");
    const elementCheck = isComponentTag(node.tag)
      ? `!__mikuru_isComponentRoot(${rowVar})`
      : `!${rowVar} || ${rowVar}.nodeType !== 1 || ${rowVar}.tagName?.toLowerCase() !== ${quote(node.tag.toLowerCase())}`;
    emit(context, indent + 1, `const ${rowVar} = ${parentVar}.childNodes[${domIndex}];`);
    emit(context, indent + 1, `if (${elementCheck}) { __mikuru_recover("List mismatch: dynamic v-for expected row, got " + __mikuru_describeNode(${rowVar})); } else {`);
    withTemplateRefMode(context, "array", () => {
      hydrateElement(context, withoutDomForAttrs(node), rowVar, indent + 2);
    });
    emit(context, indent + 1, `}`);
    emit(context, indent + 1, `const ${actualRowVar} = ${parentVar}.childNodes[${domIndex}];`);
    if (transitionVar) {
      emit(context, indent + 1, `if (${actualRowVar}?.nodeType === 1) { ${actualRowVar}.__mikuru_transition = ${transitionVar}; ${actualRowVar}.__mikuru_transitionLeaving = false; }`);
    }
    emit(context, indent + 1, isComponentTag(node.tag)
      ? `${domIndex} = __mikuru_advanceComponent(${parentVar}, ${domIndex}, ${rowVar});`
      : `${domIndex} += 1;`);
    emit(context, indent + 1, `${recordsVar}.set(${keyVar}, { element: ${actualRowVar}, cleanups: ${recordCleanupVar}, item: ${itemRefVar}${indexRefVar ? `, index: ${indexRefVar}` : ""}${memoVar ? `, memo: ${memoVar}` : ""} });`);
  }
  emit(context, indent + 1, `__mikuru_activeCleanup = ${ownerCleanupVar};`);
  emit(context, indent + 1, `${pendingCleanupVar} = null;`);
  emit(context, indent, `}`);

  const firstVar = nextName(context, "forFirst");
  const afterVar = nextName(context, "forAfter");
  emit(context, indent, `const ${firstVar} = ${parentVar}.childNodes[${startIndexVar}] ?? null;`);
  emit(context, indent, `const ${afterVar} = ${parentVar}.childNodes[${domIndex}] ?? null;`);
  emit(context, indent, `${startAnchorVar} = document.createComment("for");`);
  emit(context, indent, `${endAnchorVar} = document.createComment("/for");`);
  emit(context, indent, `${parentVar}.insertBefore(${startAnchorVar}, ${firstVar} ?? ${afterVar} ?? ${parentVar}.__mikuru_after ?? null);`);
  emit(context, indent, `${parentVar}.insertBefore(${endAnchorVar}, ${afterVar} ?? ${parentVar}.__mikuru_after ?? null);`);
  emit(context, indent, `${domIndex} += 2;`);

  const initializedVar = nextName(context, "forInitialized");
  const sourceVar = nextName(context, "forSource");
  const nextRecordsVar = nextName(context, "forNextRecords");
  const nextIndexVar = nextName(context, "forNextIndex");
  const nextRawItemVar = nextName(context, "forNextItem");
  const nextKeyVar = nextName(context, "forNextKey");
  const nextRecordVar = nextName(context, "forNextRecord");
  const nextCleanupVar = nextName(context, "forNextCleanup");
  const nextItemRefVar = nextName(context, "forNextItemRef");
  const nextIndexRefVar = forExpression.index ? nextName(context, "forNextIndexRef") : undefined;
  const nextMemoVar = compiledMemo ? nextName(context, "forNextMemo") : undefined;
  emit(context, indent, `let ${initializedVar} = false;`);
  emit(context, indent, `${stopVar} = effect(() => {`);
  emit(context, indent + 1, `const ${sourceVar} = Array.from(unwrap(${compiledSource}) ?? []);`);
  emit(context, indent + 1, `if (!${initializedVar}) { ${initializedVar} = true; return; }`);
  emit(context, indent + 1, `const ${nextRecordsVar} = new Map();`);
  emit(context, indent + 1, `for (let ${nextIndexVar} = 0; ${nextIndexVar} < ${sourceVar}.length; ${nextIndexVar} += 1) {`);
  emit(context, indent + 2, `const ${nextRawItemVar} = ${sourceVar}[${nextIndexVar}];`);
  emit(context, indent + 2, `const ${forExpression.item} = ${nextRawItemVar};`);
  if (forExpression.index) {
    emit(context, indent + 2, `const ${forExpression.index} = ${nextIndexVar};`);
  }
  emit(context, indent + 2, `const ${nextKeyVar} = unwrap(${compiledKey});`);
  if (compiledMemo && nextMemoVar) {
    emit(context, indent + 2, `const ${nextMemoVar} = ${compiledMemo};`);
  }
  emit(context, indent + 2, `let ${nextRecordVar} = ${recordsVar}.get(${nextKeyVar});`);
  emit(context, indent + 2, `if (!${nextRecordVar}) {`);
  emit(context, indent + 3, `const ${nextCleanupVar} = [];`);
  emit(context, indent + 3, `const ${nextItemRefVar} = ref(${nextRawItemVar});`);
  if (nextIndexRefVar) {
    emit(context, indent + 3, `const ${nextIndexRefVar} = ref(${nextIndexVar});`);
  }
  emit(context, indent + 3, `{`);
  emit(context, indent + 4, `const ${forExpression.item} = ${nextItemRefVar};`);
  if (forExpression.index && nextIndexRefVar) {
    emit(context, indent + 4, `const ${forExpression.index} = ${nextIndexRefVar};`);
  }
  if (template) {
    const rowStartVar = nextName(context, "forNewRowStart");
    const rowEndVar = nextName(context, "forNewRowEnd");
    emit(context, indent + 4, `const ${rowStartVar} = document.createComment("for item");`);
    emit(context, indent + 4, `const ${rowEndVar} = document.createComment("/for item");`);
    emit(context, indent + 4, `${parentVar}.insertBefore(${rowStartVar}, ${endAnchorVar});`);
    emit(context, indent + 4, `${parentVar}.insertBefore(${rowEndVar}, ${endAnchorVar});`);
    withTemplateRefMode(context, "array", () => {
      generateDomChildren(context as GenerateContext, node.children, parentVar, nextCleanupVar, indent + 4, rowEndVar);
    });
    emit(context, indent + 4, `${nextRecordVar} = { start: ${rowStartVar}, end: ${rowEndVar}, cleanups: ${nextCleanupVar}, item: ${nextItemRefVar}${nextIndexRefVar ? `, index: ${nextIndexRefVar}` : ""}${nextMemoVar ? `, memo: ${nextMemoVar}` : ""} };`);
  } else {
    const elementVar = withTemplateRefMode(context, "array", () =>
      generateDomNode(context as GenerateContext, withoutDomForAttrs(node), parentVar, nextCleanupVar, indent + 4, endAnchorVar)
    );
    if (transitionVar) {
      emitTransitionRegistration(context as GenerateContext, elementVar, transitionVar, indent + 4);
    }
    emit(context, indent + 4, `${nextRecordVar} = { element: ${elementVar}, cleanups: ${nextCleanupVar}, item: ${nextItemRefVar}${nextIndexRefVar ? `, index: ${nextIndexRefVar}` : ""}${nextMemoVar ? `, memo: ${nextMemoVar}` : ""} };`);
  }
  emit(context, indent + 3, `}`);
  emit(context, indent + 2, `} else {`);
  if (nextMemoVar) {
    emit(context, indent + 3, `if (!__mikuru_memoEqual(${nextRecordVar}.memo, ${nextMemoVar})) {`);
    emit(context, indent + 4, `${nextRecordVar}.memo = ${nextMemoVar};`);
    emit(context, indent + 4, `${nextRecordVar}.item.value = ${nextRawItemVar};`);
    if (nextIndexRefVar) {
      emit(context, indent + 4, `${nextRecordVar}.index.value = ${nextIndexVar};`);
    }
    emit(context, indent + 3, `}`);
  } else {
    emit(context, indent + 3, `${nextRecordVar}.item.value = ${nextRawItemVar};`);
    if (nextIndexRefVar) {
      emit(context, indent + 3, `${nextRecordVar}.index.value = ${nextIndexVar};`);
    }
  }
  if (template) {
    if (!positional) emit(context, indent + 3, `__mikuru_moveRangeBefore(${nextRecordVar}.start, ${nextRecordVar}.end, ${parentVar}, ${endAnchorVar});`);
  } else {
    if (!positional) emit(context, indent + 3, `if (${nextRecordVar}.element?.__mikuru_end || (${nextRecordVar}.element?.nodeType === 8 && ${nextRecordVar}.element.nodeValue === "mikuru-fragment")) __mikuru_moveRangeBefore(${nextRecordVar}.element, __mikuru_rangeEnd(${nextRecordVar}.element), ${parentVar}.__mikuru_parent ?? ${parentVar}, ${endAnchorVar}); else ${parentVar}.insertBefore(${nextRecordVar}.element, ${endAnchorVar});`);
    if (transitionVar) {
      emit(context, indent + 3, `__mikuru_applyTransitionMove(${nextRecordVar}.element, ${transitionVar});`);
    }
  }
  emit(context, indent + 2, `}`);
  emit(context, indent + 2, `${nextRecordsVar}.set(${nextKeyVar}, ${nextRecordVar});`);
  emit(context, indent + 1, `}`);
  emit(context, indent + 1, `for (const [${nextKeyVar}, ${nextRecordVar}] of ${recordsVar}) {`);
  emit(context, indent + 2, `if (!${nextRecordsVar}.has(${nextKeyVar})) {`);
  emit(context, indent + 3, `__mikuru_runCleanup(${nextRecordVar}.cleanups);`);
  emit(context, indent + 3, template
    ? `__mikuru_removeRange(${nextRecordVar}.start, ${nextRecordVar}.end);`
    : `__mikuru_removeRange(${nextRecordVar}.element);`);
  emit(context, indent + 2, `}`);
  emit(context, indent + 1, `}`);
  emit(context, indent + 1, `${recordsVar}.clear();`);
  emit(context, indent + 1, `for (const [${nextKeyVar}, ${nextRecordVar}] of ${nextRecordsVar}) ${recordsVar}.set(${nextKeyVar}, ${nextRecordVar});`);
  emit(context, indent, `});`);
}

function hydrateAttrs(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  const staticClass = getStaticAttrValue(node, "class");
  const staticStyle = getStaticAttrValue(node, "style");
  const hasObjectBind = node.attrs.some((attr) => Boolean(parseObjectBindDirective(attr.name)));
  const hasDynamicClass = node.attrs.some((attr) => getDynamicAttrName(attr.name) === "class");
  const hasDynamicStyle = node.attrs.some((attr) => getDynamicAttrName(attr.name) === "style");
  for (const attr of node.attrs) {
    if (attr.name === "v-cloak") {
      emit(context, indent, `${elementVar}.removeAttribute("v-cloak");`);
      continue;
    }

    if (shouldSkipAttr(attr)) {
      continue;
    }

    const bindDirective = parseBindDirective(attr.name);
    const dynamicArgument = bindDirective?.nameExpression ? bindDirective : undefined;
    if (dynamicArgument) {
      validateBindModifiers(dynamicArgument, attr);
      const nameExpression = compileHydrationExpression(context, dynamicArgument.nameExpression ?? "", attr.name);
      const valueExpression = compileHydrationExpression(context, String(attr.value), attr.name);
      const previousNameVar = nextName(context, "attrName");
      const nextNameVar = nextName(context, "attrName");
      const valueVar = nextName(context, "attrValue");
      emit(context, indent, `let ${previousNameVar};`);
      emit(context, indent, `__mikuru_activeCleanup.push(effect(() => {`);
      emit(context, indent + 1, `const ${nextNameVar} = ${bindNameExpression(`String(unwrap(${nameExpression}) ?? "")`, dynamicArgument)};`);
      emit(context, indent + 1, `if (!${nextNameVar}) { if (${previousNameVar}) setAttribute(${elementVar}, ${previousNameVar}, null); ${previousNameVar} = undefined; return; }`);
      emit(context, indent + 1, `if (${previousNameVar} && ${previousNameVar} !== ${nextNameVar}) setAttribute(${elementVar}, ${previousNameVar}, null);`);
      emit(context, indent + 1, `const ${valueVar} = unwrap(${valueExpression});`);
      emit(context, indent + 1, `setAttribute(${elementVar}, ${nextNameVar}, ${nextNameVar} === "class" && ${staticClass ? "true" : "false"} ? [${quote(staticClass ?? "")}, ${valueVar}] : ${nextNameVar} === "style" && ${staticStyle ? "true" : "false"} ? [${quote(staticStyle ?? "")}, ${valueVar}] : ${valueVar}${bindOptionsExpression(dynamicArgument)});`);
      emit(context, indent + 1, `${previousNameVar} = ${nextNameVar};`);
      emit(context, indent, `}));`);
      continue;
    }

    const dynamicName = bindDirective?.name;
    if (dynamicName) {
      validateBindModifiers(bindDirective, attr);
      const expression = compileHydrationExpression(context, String(attr.value), attr.name);
      const valueExpression =
        dynamicName === "class" && staticClass
          ? `[${quote(staticClass)}, unwrap(${expression})]`
          : dynamicName === "style" && staticStyle
          ? `[${quote(staticStyle)}, unwrap(${expression})]`
            : `unwrap(${expression})`;
      emit(context, indent, `__mikuru_activeCleanup.push(effect(() => setAttribute(${elementVar}, ${quote(dynamicName)}, ${valueExpression}${bindOptionsExpression(bindDirective)})));`);
      continue;
    }

    const objectBindDirective = parseObjectBindDirective(attr.name);
    if (objectBindDirective) {
      validateObjectBindModifiers(objectBindDirective, attr);
      const prevKeysVar = nextName(context, "attrsPrevKeys");
      const nextKeysVar = nextName(context, "attrsNextKeys");
      const attrsVar = nextName(context, "attrs");
      const keyVar = nextName(context, "key");
      const boundKeyVar = nextName(context, "key");
      const valueVar = nextName(context, "value");
      const staleKeyVar = nextName(context, "staleKey");
      emit(context, indent, `const ${prevKeysVar} = new Set();`);
      emit(context, indent, "__mikuru_activeCleanup.push(effect(() => {");
      emit(context, indent + 1, `const ${attrsVar} = unwrap(${compileHydrationExpression(context, String(attr.value), attr.name)}) ?? {};`);
      emit(context, indent + 1, `const ${nextKeysVar} = new Set();`);
      emit(context, indent + 1, `if (${attrsVar} && typeof ${attrsVar} === "object") {`);
      emit(context, indent + 2, `for (const [${keyVar}, ${valueVar}] of Object.entries(${attrsVar})) {`);
      emit(context, indent + 3, `const ${boundKeyVar} = ${objectBindKeyExpression(keyVar, objectBindDirective)};`);
      emit(context, indent + 3, `${nextKeysVar}.add(${boundKeyVar});`);
      if (staticClass || staticStyle) {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${boundKeyVar}, ${boundKeyVar} === "class" && ${staticClass ? "true" : "false"} ? [${quote(staticClass ?? "")}, unwrap(${valueVar})] : ${boundKeyVar} === "style" && ${staticStyle ? "true" : "false"} ? [${quote(staticStyle ?? "")}, unwrap(${valueVar})] : unwrap(${valueVar})${bindOptionsExpression(objectBindDirective)});`);
      } else {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${boundKeyVar}, unwrap(${valueVar})${bindOptionsExpression(objectBindDirective)});`);
      }
      emit(context, indent + 2, "}");
      emit(context, indent + 1, "}");
      emit(context, indent + 1, `for (const ${staleKeyVar} of ${prevKeysVar}) {`);
      emit(context, indent + 2, `if (!${nextKeysVar}.has(${staleKeyVar})) {`);
      if (staticClass || staticStyle) {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, ${staleKeyVar} === "class" && ${staticClass ? "true" : "false"} ? ${quote(staticClass ?? "")} : ${staleKeyVar} === "style" && ${staticStyle ? "true" : "false"} ? ${quote(staticStyle ?? "")} : null${bindOptionsExpression(objectBindDirective)});`);
      } else {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, null${bindOptionsExpression(objectBindDirective)});`);
      }
      emit(context, indent + 2, "}");
      emit(context, indent + 1, "}");
      emit(context, indent + 1, `${prevKeysVar}.clear();`);
      emit(context, indent + 1, `for (const ${keyVar} of ${nextKeysVar}) { ${prevKeysVar}.add(${keyVar}); }`);
      emit(context, indent, "}));");
      continue;
    }

    if (!isDirectiveAttr(attr) && !((attr.name === "class" && (hasDynamicClass || hasObjectBind)) || (attr.name === "style" && (hasDynamicStyle || hasObjectBind)))) {
      emitStaticAttrMismatchWarning(context, elementVar, attr, indent);
    }
    emit(context, indent, `setAttribute(${elementVar}, ${quote(attr.name)}, ${attr.value === true ? "true" : quote(attr.value)});`);
  }
}

function emitStaticAttrMismatchWarning(context: HydrationContext, elementVar: string, attr: TemplateAttribute, indent: number): void {
  const expected = attr.value === true ? expectedStaticAttributeValue(attr.name) : String(attr.value);
  emit(context, indent, `if (${elementVar}.getAttribute(${quote(attr.name)}) !== ${quote(expected)}) { __mikuru_warn(${quote(`Attribute mismatch on ${attr.name}: expected `)} + ${quote(expected)} + ${quote(", got ")} + JSON.stringify(${elementVar}.getAttribute(${quote(attr.name)})) + "."); }`);
}

function hydratePreElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  for (const attr of node.attrs) {
    if (attr.name === "v-pre") {
      continue;
    }

    emit(context, indent, `setAttribute(${elementVar}, ${quote(attr.name)}, ${attr.value === true ? "true" : quote(attr.value)});`);
  }

  const children = node.children.filter(isHydratableNode);
  const domIndexVar = nextName(context, "preIndex");
  emit(context, indent, `let ${domIndexVar} = 0;`);
  children.forEach((child) => {
    const childVar = nextName(context, "preNode");
    emit(context, indent, `const ${childVar} = ${elementVar}.childNodes[${domIndexVar}];`);
    if (child.type === "element") {
      emit(context, indent, `if (${childVar} && ${childVar}.nodeType === 1) {`);
      hydratePreElement(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    } else {
      const text = child.parts.map((part) => part.value).join("");
      emit(context, indent, `if (${childVar} && ${childVar}.nodeType === 3 && ${childVar}.textContent !== ${quote(text)}) { ${childVar}.textContent = ${quote(text)}; }`);
    }
    emit(context, indent, `${domIndexVar} += 1;`);
  });
}

function hydrateComponent(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  const propsVar = nextName(context, "props");
  hydrateComponentProps(context, node, propsVar, indent);
  emitHydrationComponentSlots(context, node, propsVar, indent);
  emitRouterViewRouteSlot(context, node, propsVar, indent);
  emit(context, indent, `if (${node.tag} && typeof ${node.tag}.hydrate === "function") {`);
  emit(context, indent + 1, `const __mikuru_child = ${node.tag}.hydrate(${elementVar}, ${propsVar});`);
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_activeCleanup.push(() => __mikuru_child.unmount());`);
  emit(context, indent + 1, `if (${node.tag}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context as GenerateContext, node, "__mikuru_child", "__mikuru_activeCleanup", indent + 2, true);
  emit(context, indent + 1, `}`);
  emitComponentShow(context as GenerateContext, node, "__mikuru_child", "__mikuru_activeCleanup", indent + 1);
  hydrateTemplateRef(context, node, "__mikuru_child", indent + 1);
  emit(context, indent, `} else if (${node.tag} && typeof ${node.tag}.mount === "function") {`);
  emit(context, indent + 1, "__mikuru_warn(\"Component hydration fallback; child component does not expose hydrate().\");");
  emit(context, indent + 1, `const __mikuru_parent = ${elementVar}.parentNode;`);
  emit(context, indent + 1, "const __mikuru_anchor = document.createComment(\"mikuru-hydrate-component\");");
  emit(context, indent + 1, `__mikuru_parent?.insertBefore(__mikuru_anchor, ${elementVar});`);
  emit(context, indent + 1, `__mikuru_removeRange(${elementVar});`);
  emit(context, indent + 1, "const __mikuru_fragment = document.createDocumentFragment();");
  emit(context, indent + 1, `const __mikuru_child = ${node.tag}.mount(__mikuru_fragment, ${propsVar});`);
  emit(context, indent + 1, "__mikuru_parent?.insertBefore(__mikuru_fragment, __mikuru_anchor);");
  emit(context, indent + 1, "__mikuru_anchor.remove();");
  emit(context, indent + 1, `${elementVar}.__mikuru_replacementEnd = __mikuru_child.__mikuru_end ?? __mikuru_child.element;`);
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_activeCleanup.push(() => __mikuru_child.unmount());`);
  emit(context, indent + 1, `if (${node.tag}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context as GenerateContext, node, "__mikuru_child", "__mikuru_activeCleanup", indent + 2, true);
  emit(context, indent + 1, `}`);
  emitComponentShow(context as GenerateContext, node, "__mikuru_child", "__mikuru_activeCleanup", indent + 1);
  hydrateTemplateRef(context, node, "__mikuru_child", indent + 1);
  emit(context, indent, "} else {");
  emit(context, indent + 1, `__mikuru_recover(${quote(`Component mismatch at <${node.tag}>`)});`);
  emit(context, indent, "}");
}

function emitRouterViewRouteSlot(context: HydrationContext, node: ElementNode, propsVar: string, indent: number): void {
  if (node.tag !== "RouterView") return;
  emit(context, indent, `if (typeof props.children === "function") { ${propsVar}.children = props.children; ${propsVar}.slots = { ...(${propsVar}.slots ?? {}), default: props.children }; }`);
  emit(context, indent, `if (props.__mikuru_routeViewDepth !== undefined && ${propsVar}.depth === undefined) ${propsVar}.depth = props.__mikuru_routeViewDepth;`);
}

function emitHydrationComponentSlots(context: HydrationContext, node: ElementNode, propsVar: string, indent: number): void {
  const slots = collectHydrationComponentSlots(context, node);

  if (slots.length === 0) {
    return;
  }

  const defaultSlot = slots.find((slot) => !slot.nameExpression && slot.name === "default");

  if (defaultSlot) {
    emitHydrationSlotFunction(context, `${propsVar}.children`, defaultSlot, indent);
  }

  emit(context, indent, `${propsVar}.slots = { ...(${propsVar}.slots ?? {}) };`);

  for (const slot of slots) {
    const property = slot.nameExpression ? `[${slot.nameExpression}]` : `[${quote(slot.name)}]`;
    emitHydrationSlotFunction(context, `${propsVar}.slots${property}`, slot, indent);
  }
}

function emitHydrationSlotFunction(context: HydrationContext, target: string, slot: SlotDefinition, indent: number): void {
  const slotTargetVar = nextName(context, "slotTarget");
  const slotPropsVar = nextName(context, "slotProps");
  emit(context, indent, `${target} = (${slotTargetVar}, ${slotPropsVar} = {}) => {`);
  emitHydrationSlotScopeBindings(context, slot, slotPropsVar, indent + 1);
  hydrateChildren(context, slot.children, slotTargetVar, indent + 1);
  emit(context, indent, "};");
}

function emitHydrationSlotScopeBindings(context: HydrationContext, slot: SlotDefinition, slotPropsVar: string, indent: number): void {
  for (const binding of parseHydrationSlotScopeBindings(slot.scope, context, slot.scopeLoc ?? slot.loc)) {
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

function collectHydrationComponentSlots(context: HydrationContext, node: ElementNode): SlotDefinition[] {
  const slots: SlotDefinition[] = [];
  const usedNames = new Set<string>();
  const defaultChildren: TemplateNode[] = [];

  for (const child of node.children) {
    if (child.type === "element" && child.tag === "template") {
      const slotDirective = getHydrationSlotTemplateDirective(child, context);

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

  if (hasMeaningfulHydrationChildren(defaultChildren)) {
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

function getHydrationSlotTemplateDirective(node: ElementNode, context: HydrationContext): SlotTemplateDirective | undefined {
  const slotAttrs = node.attrs.filter((attr) => isSlotTemplateAttr(attr));

  if (slotAttrs.length === 0) {
    return undefined;
  }

  if (slotAttrs.length > 1) {
    throwTemplateError("A slot template can only declare one slot target", context, slotAttrs[1]?.loc);
  }

  const attr = slotAttrs[0]!;
  const name = getHydrationSlotTemplateName(attr, context);

  return {
    ...name,
    scope: attr.value,
    loc: attr.loc,
    scopeLoc: attr.valueLoc
  };
}

function getHydrationSlotTemplateName(attr: TemplateAttribute, context: HydrationContext): { name: string; nameExpression?: string } {
  if (attr.name === "v-slot") {
    return { name: "default" };
  }

  if (attr.name.startsWith("v-slot:")) {
    return parseHydrationSlotTemplateName(attr.name.slice("v-slot:".length) || "default", attr, context);
  }

  if (attr.name.startsWith("#")) {
    return parseHydrationSlotTemplateName(attr.name.slice(1) || "default", attr, context);
  }

  return { name: "default" };
}

function parseHydrationSlotTemplateName(rawName: string, attr: TemplateAttribute, context: HydrationContext): { name: string; nameExpression?: string } {
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

function isSlotTemplateAttr(attr: TemplateAttribute): boolean {
  return attr.name === "v-slot" || attr.name.startsWith("v-slot:") || attr.name.startsWith("#");
}

function hasMeaningfulHydrationChildren(children: TemplateNode[]): boolean {
  return children.some((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));
}

function parseHydrationSlotScopeBindings(scope: string | true, context: HydrationContext, location: SourceLocation | undefined): SlotScopeBinding[] {
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

  return parseHydrationSlotScopeObjectPattern(body, context, location, []);
}

function parseHydrationSlotScopeObjectPattern(
  body: string,
  context: HydrationContext,
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

    const { left, right } = splitHydrationSlotScopeEntry(sourcePart, context, location);

    if (!isIdentifier(left)) {
      throwTemplateError(`Unsupported slot scope key "${left}". Use identifier keys in slot scope destructuring`, context, location);
    }

    if (pathPrefix.length === 0) {
      excludedTopLevelKeys.push(left);
    }

    const path = [...pathPrefix, left];

    if (right === undefined) {
      bindings.push(...hydrationSlotScopeLeafBindings(left, path, context, location));
      continue;
    }

    const value = right.trim();

    if (value.startsWith("{") && value.endsWith("}")) {
      bindings.push(...parseHydrationSlotScopeObjectPattern(value.slice(1, -1), context, location, path));
      continue;
    }

    if (value.startsWith("[") || value.includes("{")) {
      throwTemplateError("Slot scope destructuring supports nested object patterns only; array and mixed patterns are not supported", context, location);
    }

    bindings.push(...hydrationSlotScopeLeafBindings(value, path, context, location));
  }

  return bindings;
}

function splitHydrationSlotScopeEntry(
  source: string,
  context: HydrationContext,
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

function hydrationSlotScopeLeafBindings(
  source: string,
  path: string[],
  context: HydrationContext,
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

function hydrateDynamicComponentAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number, keepAliveNode?: ElementNode, transitionNode?: ElementNode): void {
  const isAttr = getDynamicComponentIsAttr(node);

  if (!isAttr) {
    throw new Error("Dynamic component requires :is to resolve to a component object");
  }

  const dynamicNode = withoutDynamicComponentIs(node);
  const expression = compileHydrationExpression(context, requireAttrValue(isAttr), isAttr.name);
  const initialType = nextName(context, "dynamicType");
  const currentType = nextName(context, "currentType");
  const currentRecord = nextName(context, "currentRecord");
  const startIndex = nextName(context, "dynamicIndex");
  const childVar = nextName(context, "node");
  const start = nextName(context, "dynamicStart");
  const end = nextName(context, "dynamicEnd");
  const after = nextName(context, "dynamicAfter");
  const first = nextName(context, "dynamicFirst");
  const ownerCleanup = nextName(context, "dynamicOwnerCleanup");
  const initialCleanup = nextName(context, "dynamicCleanup");
  const initialInstance = nextName(context, "dynamicInstance");
  const stop = nextName(context, "dynamicStop");
  const nextType = nextName(context, "dynamicNextType");
  const branchCleanup = nextName(context, "dynamicBranchCleanup");
  const fragment = nextName(context, "dynamicFragment");
  const attrs = nextName(context, "dynamicAttrs");
  const componentProps = nextName(context, "dynamicProps");
  const instance = nextName(context, "dynamicInstance");
  const cache = keepAliveNode ? nextName(context, "keepAliveCache") : undefined;
  const cached = keepAliveNode ? nextName(context, "keepAliveCached") : undefined;
  const record = nextName(context, "dynamicRecord");
  const cacheable = keepAliveNode ? nextName(context, "keepAliveCacheable") : undefined;
  const maxVar = keepAliveNode ? nextName(context, "keepAliveMax") : undefined;
  const transition = transitionNode ? nextName(context, "dynamicTransition") : undefined;
  const renderToken = transitionNode ? nextName(context, "dynamicRenderToken") : undefined;
  const renderBranch = transitionNode ? nextName(context, "dynamicRender") : undefined;
  const include = keepAliveNode ? getKeepAliveOptionExpression(context as GenerateContext, keepAliveNode, "include") : undefined;
  const exclude = keepAliveNode ? getKeepAliveOptionExpression(context as GenerateContext, keepAliveNode, "exclude") : undefined;
  const max = keepAliveNode ? getKeepAliveOptionExpression(context as GenerateContext, keepAliveNode, "max") : undefined;
  emit(context, indent, `const ${startIndex} = ${domIndex};`);
  emit(context, indent, `const ${initialType} = unwrap(${expression});`);
  emit(context, indent, `let ${currentType} = ${initialType};`);
  emit(context, indent, `let ${currentRecord};`);
  emit(context, indent, `const ${ownerCleanup} = __mikuru_activeCleanup;`);
  emit(context, indent, `const ${initialCleanup} = [];`);
  emit(context, indent, `let ${initialInstance};`);
  if (transition && transitionNode && renderToken) {
    emit(context, indent, `const ${transition} = ${getTransitionOptionsExpression(context as GenerateContext, transitionNode)};`);
    emit(context, indent, `${transition}.__mikuru_hasAppeared = true;`);
    emit(context, indent, `let ${renderToken} = 0;`);
  }
  if (cache) emit(context, indent, `const ${cache} = new Map();`);
  emit(context, indent, `__mikuru_activeCleanup = ${initialCleanup};`);
  emit(context, indent, `if (${initialType}) {`);
  emit(context, indent + 1, `const ${childVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent + 1, `if (!__mikuru_isComponentRoot(${childVar})) __mikuru_recover("Element mismatch: expected dynamic component root, got " + __mikuru_describeNode(${childVar}));`);
  hydrateDynamicComponent(context, node, childVar, initialType, indent + 1, initialInstance);
  emit(context, indent + 1, `${domIndex} = __mikuru_advanceComponent(${parentVar}, ${domIndex}, ${childVar});`);
  emit(context, indent, "}");
  emit(context, indent, `__mikuru_activeCleanup = ${ownerCleanup};`);
  emit(context, indent, `const ${first} = ${parentVar}.childNodes[${startIndex}] ?? null;`);
  emit(context, indent, `const ${after} = ${parentVar}.childNodes[${domIndex}] ?? ${parentVar}.__mikuru_after ?? null;`);
  emit(context, indent, `const ${start} = document.createComment(${keepAliveNode ? '"keep-alive"' : '"component"'});`);
  emit(context, indent, `const ${end} = document.createComment(${keepAliveNode ? '"/keep-alive"' : '"/component"'});`);
  emit(context, indent, `${start}.__mikuru_end = ${end};`);
  emit(context, indent, `${parentVar}.insertBefore(${start}, ${first} ?? ${after});`);
  emit(context, indent, `${parentVar}.insertBefore(${end}, ${after});`);
  emit(context, indent, `${domIndex} += 2;`);
  if (transition) emit(context, indent, `for (const element of __mikuru_rangeElements(${start})) { element.__mikuru_transition = ${transition}; element.__mikuru_transitionLeaving = false; }`);
  emit(context, indent, `if (${initialInstance}) {`);
  emit(context, indent + 1, `${currentRecord} = { instance: ${initialInstance}, cleanups: ${initialCleanup}, nodes: [], active: true, transient: true };`);
  if (cache) {
    emit(context, indent + 1, `const __mikuru_initialName = ${initialType}.name ?? ${initialType}.displayName ?? ${initialType}.__name ?? ${initialType}.constructor?.name ?? "";`);
    emit(context, indent + 1, `const __mikuru_initialMatches = (pattern) => pattern == null ? false : typeof pattern === "string" ? pattern.split(",").map((part) => part.trim()).includes(__mikuru_initialName) : Array.isArray(pattern) ? pattern.some(__mikuru_initialMatches) : pattern instanceof RegExp ? pattern.test(__mikuru_initialName) : false;`);
    emit(context, indent + 1, `if ((unwrap(${include ?? "undefined"}) == null || __mikuru_initialMatches(unwrap(${include ?? "undefined"}))) && !__mikuru_initialMatches(unwrap(${exclude ?? "undefined"}))) { ${currentRecord}.transient = false; ${cache}.set(${initialType}, ${currentRecord}); ${initialInstance}.activate?.(); }`);
  }
  emit(context, indent, "}");
  emit(context, indent, `const ${stop} = effect(() => {`);
  emit(context, indent + 1, `const ${nextType} = unwrap(${expression});`);
  emit(context, indent + 1, `if (${nextType} === ${currentType}) return;`);
  if (transition) emit(context, indent + 1, `const __mikuru_hadBranch = ${start}.nextSibling !== ${end};`);
  if (transition) emit(context, indent + 1, `const __mikuru_previousLeaves = new Set(__mikuru_leavePromises);`);
  if (cache) {
    emit(context, indent + 1, `if (${currentRecord}) { ${currentRecord}.nodes = Array.from((function* () { for (let node = ${start}.nextSibling; node && node !== ${end}; node = node.nextSibling) yield node; })()); if (${currentRecord}.transient) __mikuru_runCleanup(${currentRecord}.cleanups); else { ${currentRecord}.active = false; ${currentRecord}.instance.deactivate?.(); } }`);
    emit(context, indent + 1, `for (const node of ${currentRecord}?.nodes ?? []) node.remove();`);
  } else {
    emit(context, indent + 1, `__mikuru_runCleanup(${currentRecord}?.cleanups ?? []);`);
    emit(context, indent + 1, `__mikuru_removeBetween(${start}, ${end});`);
  }
  emit(context, indent + 1, `${currentType} = ${nextType};`);
  emit(context, indent + 1, `${currentRecord} = undefined;`);
  if (renderToken) emit(context, indent + 1, `++${renderToken};`);
  emit(context, indent + 1, `if (!${nextType}) return;`);
  emit(context, indent + 1, `if (typeof ${nextType}.mount !== "function") throw new Error("Dynamic component :is must resolve to a component object with mount()");`);
  if (renderBranch && renderToken) {
    emit(context, indent + 1, `const __mikuru_currentToken = ${renderToken};`);
    emit(context, indent + 1, `const ${renderBranch} = () => {`);
    emit(context, indent + 2, `if (__mikuru_currentToken !== ${renderToken}) return;`);
  }
  if (cache && cached && cacheable && keepAliveNode) {
    const name = nextName(context, "keepAliveName");
    const includeVar = nextName(context, "keepAliveInclude");
    const excludeVar = nextName(context, "keepAliveExclude");
    emit(context, indent + 1, `const ${name} = ${nextType}.name ?? ${nextType}.displayName ?? ${nextType}.__name ?? ${nextType}.constructor?.name ?? "";`);
    emit(context, indent + 1, `const ${includeVar} = unwrap(${include ?? "undefined"});`);
    emit(context, indent + 1, `const ${excludeVar} = unwrap(${exclude ?? "undefined"});`);
    emit(context, indent + 1, `const ${maxVar} = Number(unwrap(${max ?? "undefined"}));`);
    emit(context, indent + 1, `const __mikuru_matches = (pattern) => pattern == null ? false : typeof pattern === "string" ? pattern.split(",").map((part) => part.trim()).includes(${name}) : Array.isArray(pattern) ? pattern.some(__mikuru_matches) : pattern instanceof RegExp ? pattern.test(${name}) : false;`);
    emit(context, indent + 1, `const ${cacheable} = (${includeVar} == null || __mikuru_matches(${includeVar})) && !__mikuru_matches(${excludeVar});`);
    emit(context, indent + 1, `let ${cached} = ${cacheable} ? ${cache}.get(${nextType}) : undefined;`);
    emit(context, indent + 1, `if (${cached}) { ${cache}.delete(${nextType}); ${cache}.set(${nextType}, ${cached}); for (const node of ${cached}.nodes) ${parentVar}.insertBefore(node, ${end}); ${cached}.active = true; ${cached}.instance.__mikuru_refreshShow?.(); ${cached}.instance.activate?.(); ${currentRecord} = ${cached}; return; }`);
  }
  emit(context, indent + 1, `const ${branchCleanup} = [];`);
  emit(context, indent + 1, `const ${fragment} = document.createDocumentFragment();`);
  emitComponentAttrs(context as GenerateContext, dynamicNode, attrs, indent + 1);
  emitComponentProps(context as GenerateContext, dynamicNode, componentProps, attrs, indent + 1);
  emit(context, indent + 1, `const ${instance} = ${nextType}.mount(${fragment}, ${componentProps});`);
  emit(context, indent + 1, `${branchCleanup}.push(() => ${instance}.unmount());`);
  if (context.scopeAttr) emit(context, indent + 1, `if (${instance}.element?.nodeType === 1) ${instance}.element.setAttribute(${JSON.stringify(context.scopeAttr)}, "");`);
  emit(context, indent + 1, `if (${nextType}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context as GenerateContext, dynamicNode, instance, branchCleanup, indent + 2);
  emit(context, indent + 1, "}");
  emitComponentShow(context as GenerateContext, dynamicNode, instance, branchCleanup, indent + 1);
  emitTemplateRef(context as GenerateContext, dynamicNode, instance, branchCleanup, indent + 1);
  emit(context, indent + 1, `${parentVar}.insertBefore(${fragment}, ${end});`);
  if (transition) emitTransitionRegistration(context as GenerateContext, `(${instance}.__mikuru_start ?? ${instance}.element)`, transition, indent + 1);
  emit(context, indent + 1, `const ${record} = { instance: ${instance}, cleanups: ${branchCleanup}, nodes: [], active: true, transient: ${cacheable ? `!${cacheable}` : "true"} };`);
  emit(context, indent + 1, `${currentRecord} = ${record};`);
  if (cache && cacheable) {
    emit(context, indent + 1, `if (${cacheable}) { ${cache}.set(${nextType}, ${record}); ${instance}.activate?.(); if (Number.isFinite(${maxVar}) && ${maxVar} > 0) while (${cache}.size > ${maxVar}) { const key = ${cache}.keys().next().value; if (key === ${nextType}) break; const stale = ${cache}.get(key); ${cache}.delete(key); if (stale) { if (stale.active) stale.instance.deactivate?.(); __mikuru_runCleanup(stale.cleanups); } } }`);
  }
  if (renderBranch && renderToken && transition) {
    emit(context, indent + 1, "};");
    emit(context, indent + 1, `if (${transition}.mode === "out-in" && __mikuru_hadBranch) Promise.all(Array.from(__mikuru_leavePromises).filter((pending) => !__mikuru_previousLeaves.has(pending))).then(${renderBranch}); else ${renderBranch}();`);
  }
  emit(context, indent, "});");
  emit(context, indent, `${ownerCleanup}.push(() => { ${stop}(); ${renderToken ? `++${renderToken};` : ""} if (${currentRecord}?.transient) __mikuru_runCleanup(${currentRecord}.cleanups); ${cache ? `for (const record of ${cache}.values()) { if (record.active) record.instance.deactivate?.(); __mikuru_runCleanup(record.cleanups); } ${cache}.clear();` : ""} ${start}.remove(); ${end}.remove(); });`);
}

function hydrateDynamicComponent(context: HydrationContext, node: ElementNode, elementVar: string, componentType: string, indent: number, instanceVar?: string): void {
  const dynamicNode = withoutDynamicComponentIs(node);
  const propsVar = nextName(context, "props");
  hydrateComponentProps(context, dynamicNode, propsVar, indent);
  emitHydrationComponentSlots(context, dynamicNode, propsVar, indent);
  emitRouterViewRouteSlot(context, dynamicNode, propsVar, indent);
  emit(context, indent, `if (${componentType} && typeof ${componentType}.hydrate === "function") {`);
  emit(context, indent + 1, `const __mikuru_child = ${componentType}.hydrate(${elementVar}, ${propsVar});`);
  if (instanceVar) emit(context, indent + 1, `${instanceVar} = __mikuru_child;`);
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_activeCleanup.push(() => __mikuru_child.unmount());`);
  emit(context, indent + 1, `if (${componentType}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context as GenerateContext, dynamicNode, "__mikuru_child", "__mikuru_activeCleanup", indent + 2, true);
  emit(context, indent + 1, `}`);
  emitComponentShow(context as GenerateContext, dynamicNode, "__mikuru_child", "__mikuru_activeCleanup", indent + 1);
  hydrateTemplateRef(context, dynamicNode, "__mikuru_child", indent + 1);
  emit(context, indent, `} else if (${componentType} && typeof ${componentType}.mount === "function") {`);
  emit(context, indent + 1, "__mikuru_warn(\"Dynamic component hydration fallback; child component does not expose hydrate().\");");
  emit(context, indent + 1, `const __mikuru_parent = ${elementVar}.parentNode;`);
  emit(context, indent + 1, "const __mikuru_anchor = document.createComment(\"mikuru-hydrate-dynamic-component\");");
  emit(context, indent + 1, `__mikuru_parent?.insertBefore(__mikuru_anchor, ${elementVar});`);
  emit(context, indent + 1, `__mikuru_removeRange(${elementVar});`);
  emit(context, indent + 1, "const __mikuru_fragment = document.createDocumentFragment();");
  emit(context, indent + 1, `const __mikuru_child = ${componentType}.mount(__mikuru_fragment, ${propsVar});`);
  emit(context, indent + 1, "__mikuru_parent?.insertBefore(__mikuru_fragment, __mikuru_anchor);");
  emit(context, indent + 1, "__mikuru_anchor.remove();");
  emit(context, indent + 1, `${elementVar}.__mikuru_replacementEnd = __mikuru_child.__mikuru_end ?? __mikuru_child.element;`);
  if (instanceVar) emit(context, indent + 1, `${instanceVar} = __mikuru_child;`);
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_activeCleanup.push(() => __mikuru_child.unmount());`);
  emit(context, indent + 1, `if (${componentType}.inheritAttrs !== false) {`);
  emitComponentFallthrough(context as GenerateContext, dynamicNode, "__mikuru_child", "__mikuru_activeCleanup", indent + 2, true);
  emit(context, indent + 1, `}`);
  emitComponentShow(context as GenerateContext, dynamicNode, "__mikuru_child", "__mikuru_activeCleanup", indent + 1);
  hydrateTemplateRef(context, dynamicNode, "__mikuru_child", indent + 1);
  emit(context, indent, "} else {");
  emit(context, indent + 1, "__mikuru_recover(\"Dynamic component mismatch: :is did not resolve to hydrate() or mount()\");");
  emit(context, indent, "}");
}

function hydrateKeepAliveAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  validateKeepAliveAttributes(node);
  const child = getSingleElementChild(node, "<KeepAlive>");

  if (child.tag !== "component") {
    throw new Error("<KeepAlive> requires a single <component :is=\"...\" /> child in v1");
  }

  if (!getDynamicComponentIsAttr(child)) {
    throw new Error("<KeepAlive> dynamic child requires :is to resolve to a component object");
  }

  hydrateDynamicComponentAtIndex(context, child, parentVar, domIndex, indent, node);
}

function hydrateKeepAliveElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  validateKeepAliveAttributes(node);
  const child = getSingleElementChild(node, "<KeepAlive>");
  const isAttr = getDynamicComponentIsAttr(child);

  if (child.tag !== "component" || !isAttr) {
    throw new Error("<KeepAlive> requires a single <component :is=\"...\" /> child in v1");
  }

  const parent = nextName(context, "keepAliveParent");
  const index = nextName(context, "keepAliveIndex");
  emit(context, indent, `const ${parent} = ${elementVar}.parentNode;`);
  emit(context, indent, `let ${index} = ${parent} ? Array.prototype.indexOf.call(${parent}.childNodes, ${elementVar}) : 0;`);
  emit(context, indent, `if (${parent}) {`);
  hydrateDynamicComponentAtIndex(context, child, parent, index, indent + 1, node);
  emit(context, indent, "}");
}

function hydrateAsyncBoundaryAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  validateAsyncBoundaryAttributes(node);
  hydrateFragmentChildrenAtIndex(context, getAsyncBoundaryChildren(node), parentVar, domIndex, indent);
}

function hydrateAsyncBoundaryElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  validateAsyncBoundaryAttributes(node);
  const parentVar = nextName(context, "asyncBoundaryParent");
  const indexVar = nextName(context, "asyncBoundaryIndex");
  emit(context, indent, `const ${parentVar} = ${elementVar}.parentNode;`);
  emit(context, indent, `let ${indexVar} = ${parentVar} ? Array.prototype.indexOf.call(${parentVar}.childNodes, ${elementVar}) : 0;`);
  emit(context, indent, `if (${parentVar}) {`);
  hydrateFragmentChildrenAtIndex(context, getAsyncBoundaryChildren(node), parentVar, indexVar, indent + 1);
  emit(context, indent, "}");
}

function hydrateErrorBoundaryAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  validateErrorBoundaryAttributes(node);
  getErrorBoundaryFallbackAttr(node);
  hydrateFragmentChildrenAtIndex(context, [getSingleElementChild(node, "<ErrorBoundary>")], parentVar, domIndex, indent);
}

function hydrateErrorBoundaryElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  validateErrorBoundaryAttributes(node);
  getErrorBoundaryFallbackAttr(node);
  const parentVar = nextName(context, "errorBoundaryParent");
  const indexVar = nextName(context, "errorBoundaryIndex");
  emit(context, indent, `const ${parentVar} = ${elementVar}.parentNode;`);
  emit(context, indent, `let ${indexVar} = ${parentVar} ? Array.prototype.indexOf.call(${parentVar}.childNodes, ${elementVar}) : 0;`);
  emit(context, indent, `if (${parentVar}) {`);
  hydrateFragmentChildrenAtIndex(context, [getSingleElementChild(node, "<ErrorBoundary>")], parentVar, indexVar, indent + 1);
  emit(context, indent, "}");
}

function hydrateTransitionAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  validateTransitionAttributes(node);
  const children = getTransitionChildren(node);

  if (getAttr(children[0], "v-if")) {
    hydrateTransitionIfChainAtIndex(context, node, children, parentVar, domIndex, indent);
    return;
  }

  if (children[0].tag === "component") {
    hydrateDynamicComponentAtIndex(context, children[0], parentVar, domIndex, indent, undefined, node);
    return;
  }

  const startIndex = nextName(context, "transitionIndex");
  const transition = nextName(context, "transition");
  emit(context, indent, `const ${startIndex} = ${domIndex};`);
  emit(context, indent, `const ${transition} = ${getTransitionOptionsExpression(context as GenerateContext, node)};`);
  emit(context, indent, `${transition}.__mikuru_hasAppeared = true;`);
  hydrateFragmentChildrenAtIndex(context, [children[0]], parentVar, domIndex, indent);
  emit(context, indent, `for (let index = ${startIndex}; index < ${domIndex}; index++) { const element = ${parentVar}.childNodes[index]; if (element?.nodeType === 1) { element.__mikuru_transition = ${transition}; element.__mikuru_transitionLeaving = false; } }`);
}

function hydrateTransitionElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  validateTransitionAttributes(node);
  const parentVar = nextName(context, "transitionParent");
  const indexVar = nextName(context, "transitionIndex");
  emit(context, indent, `const ${parentVar} = ${elementVar}.parentNode;`);
  emit(context, indent, `let ${indexVar} = ${parentVar} ? Array.prototype.indexOf.call(${parentVar}.childNodes, ${elementVar}) : 0;`);
  emit(context, indent, `if (${parentVar}) {`);
  hydrateTransitionAtIndex(context, node, parentVar, indexVar, indent + 1);
  emit(context, indent, "}");
}

function hydrateTransitionIfChainAtIndex(context: HydrationContext, transitionNode: ElementNode, children: ElementNode[], parentVar: string, domIndex: string, indent: number): void {
  hydrateIfChain(context, children.map((child) => ({
    node: child,
    directive: getAttr(child, "v-if") ? "v-if" : getAttr(child, "v-else-if") ? "v-else-if" : "v-else",
    condition: getAttrValue(child, getAttr(child, "v-if") ? "v-if" : "v-else-if")
  })), parentVar, domIndex, indent, transitionNode);
}

function hydrateTransitionGroupAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  validateTransitionGroupAttributes(node);
  const child = getTransitionGroupChild(node);
  const groupVar = nextName(context, "transitionGroup");
  const expectedTagVar = nextName(context, "transitionGroupTag");
  const groupIndexVar = nextName(context, "transitionGroupIndex");
  emit(context, indent, `const ${groupVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent, `const ${expectedTagVar} = String(unwrap(${getTransitionGroupTagExpression(context, node)}) ?? "span").toLowerCase();`);
  emit(context, indent, `if (!${groupVar} || ${groupVar}.nodeType !== 1 || ${groupVar}.tagName?.toLowerCase() !== ${expectedTagVar}) {`);
  emit(context, indent + 1, `__mikuru_recover("TransitionGroup mismatch: expected <" + ${expectedTagVar} + ">, got " + __mikuru_describeNode(${groupVar}));`);
  emit(context, indent, "} else {");
  emit(context, indent + 1, `let ${groupIndexVar} = 0;`);
  hydrateFor(context, child, groupVar, groupIndexVar, indent + 1, groupIndexVar, node);
  emit(context, indent + 1, `if (${groupVar}.childNodes.length > ${groupIndexVar}) { __mikuru_warn("Extra DOM nodes after TransitionGroup hydration: " + Array.from(${groupVar}.childNodes).slice(${groupIndexVar}).map(__mikuru_describeNode).join(", ") + "."); }`);
  emit(context, indent, "}");
  emit(context, indent, `${domIndex} += 1;`);
}

function hydrateTransitionGroupElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  validateTransitionGroupAttributes(node);
  const child = getTransitionGroupChild(node);
  const expectedTagVar = nextName(context, "transitionGroupTag");
  const groupIndexVar = nextName(context, "transitionGroupIndex");
  emit(context, indent, `const ${expectedTagVar} = String(unwrap(${getTransitionGroupTagExpression(context, node)}) ?? "span").toLowerCase();`);
  emit(context, indent, `if (${elementVar}.tagName?.toLowerCase() !== ${expectedTagVar}) { __mikuru_recover("TransitionGroup mismatch: expected <" + ${expectedTagVar} + ">, got " + __mikuru_describeNode(${elementVar})); }`);
  emit(context, indent, `let ${groupIndexVar} = 0;`);
  hydrateFor(context, child, elementVar, groupIndexVar, indent, groupIndexVar, node);
  emit(context, indent, `if (${elementVar}.childNodes.length > ${groupIndexVar}) { __mikuru_warn("Extra DOM nodes after TransitionGroup hydration: " + Array.from(${elementVar}.childNodes).slice(${groupIndexVar}).map(__mikuru_describeNode).join(", ") + "."); }`);
}

function hydrateFragmentChildrenAtIndex(context: HydrationContext, rawChildren: TemplateNode[], parentVar: string, domIndex: string, indent: number): void {
  const children = rawChildren.filter(isHydratableNode);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    if (child.type === "element" && child.tag === "Teleport") {
      hydrateTeleportAtIndex(context, child, parentVar, domIndex, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "component") {
      hydrateDynamicComponentAtIndex(context, child, parentVar, domIndex, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "KeepAlive") {
      hydrateKeepAliveAtIndex(context, child, parentVar, domIndex, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "AsyncBoundary") {
      hydrateAsyncBoundaryAtIndex(context, child, parentVar, domIndex, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "ErrorBoundary") {
      hydrateErrorBoundaryAtIndex(context, child, parentVar, domIndex, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "TransitionGroup") {
      hydrateTransitionGroupAtIndex(context, child, parentVar, domIndex, indent);
      continue;
    }

    if (child.type === "element" && child.tag === "Transition") {
      hydrateTransitionAtIndex(context, child, parentVar, domIndex, indent);
      continue;
    }

    if (child.type === "element" && getAttr(child, "v-if") && !getAttr(child, "v-pre")) {
      const { branches, nextIndex } = collectIfBranches(children, index);
      hydrateIfChain(context, branches, parentVar, domIndex, indent);
      index = nextIndex - 1;
      continue;
    }

    if (child.type === "element" && (getAttr(child, "v-else-if") || getAttr(child, "v-else"))) {
      continue;
    }

    if (child.type === "element" && getAttr(child, "v-for") && !getAttr(child, "v-pre")) {
      hydrateFor(context, child, parentVar, domIndex, indent, domIndex);
      continue;
    }

    if (child.type === "element" && child.tag === "template") {
      hydrateFragmentChildrenAtIndex(context, child.children, parentVar, domIndex, indent);
      continue;
    }

    const childVar = nextName(context, "node");
    emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndex}];`);
    if (child.type === "element") {
      const elementCheck = isComponentTag(child.tag)
        ? `!__mikuru_isComponentRoot(${childVar})`
        : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(child.tag.toLowerCase())}`;
      emit(context, indent, `if (${elementCheck}) { __mikuru_recover(${quote(`Element mismatch: expected <${child.tag.toLowerCase()}>, got `)} + __mikuru_describeNode(${childVar}), { kind: "element", expected: "<${child.tag.toLowerCase()}>", actual: __mikuru_describeNode(${childVar}), node: ${childVar} }); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    } else {
      emit(context, indent, `if (!${childVar} || ${childVar}.nodeType !== 3) { __mikuru_recover("Text mismatch: expected text, got " + __mikuru_describeNode(${childVar}), { kind: "text", expected: "text", actual: __mikuru_describeNode(${childVar}), node: ${childVar} }); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    }
    emit(context, indent, child.type === "element" && isComponentTag(child.tag)
      ? `${domIndex} = __mikuru_advanceComponent(${parentVar}, ${domIndex}, ${childVar});`
      : `${domIndex} += 1;`);
  }
}

function hydrateComponentProps(context: HydrationContext, node: ElementNode, propsVar: string, indent: number): void {
  const attrsVar = nextName(context, "attrs");
  emitComponentAttrs(context as GenerateContext, node, attrsVar, indent);
  const objectBindAttrs = node.attrs.filter((attr) => Boolean(parseObjectBindDirective(attr.name)));
  const objectOnAttrs = node.attrs.filter((attr) => Boolean(parseObjectOnDirective(attr.name)));
  const needsProxy = objectBindAttrs.length > 0 || objectOnAttrs.length > 0;
  const propsTargetVar = needsProxy ? nextName(context, "propsBase") : propsVar;
  const previousOnce = context.once;
  context.once = context.once || Boolean(getAttr(node, "v-once") && !getAttr(node, "v-for"));
  let entries: string[];
  try {
    entries = node.attrs
      .filter((attr) => !["v-if", "v-else-if", "v-else", "v-for", "v-once", "v-memo"].includes(attr.name))
      .flatMap((attr) => componentPropEntries(context as GenerateContext, attr));
  } finally {
    context.once = previousOnce;
  }
  emit(context, indent, `const ${propsTargetVar} = {`);
  emit(context, indent + 1, `__mikuru_context: __mikuru_context,`);
  emit(context, indent + 1, `__mikuru_attrs: ${attrsVar},`);
  for (const entry of entries) {
    emit(context, indent + 1, `${entry},`);
  }
  emit(context, indent, `};`);
  if (needsProxy) {
    emitComponentPropsProxy(context as GenerateContext, propsVar, propsTargetVar, objectBindAttrs, objectOnAttrs, indent);
  }
}

function emitHydrationRemoveBetween(context: HydrationContext, indent: number, startVar: string, endVar: string): void {
  const currentVar = nextName(context, "current");
  const nextVarName = nextName(context, "next");
  emit(context, indent, `let ${currentVar} = ${startVar}.nextSibling;`);
  emit(context, indent, `while (${currentVar} && ${currentVar} !== ${endVar}) {`);
  emit(context, indent + 1, `const ${nextVarName} = ${currentVar}.nextSibling;`);
  emit(context, indent + 1, `__mikuru_removeNode(${currentVar});`);
  emit(context, indent + 1, `${currentVar} = ${nextVarName};`);
  emit(context, indent, `}`);
}

function hydrateEvents(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  for (const attr of node.attrs) {
    const objectEvent = parseObjectOnDirective(attr.name);
    if (objectEvent && attr.value !== true) {
      validateObjectOnModifiers(objectEvent, attr, "element");
      const eventOptions = eventListenerOptions(objectEvent);
      const expression = compileHydrationExpression(context, String(attr.value), attr.name);
      const listenersVar = nextName(context, "listeners");
      const stopVar = nextName(context, "stop");
      const sourceVar = nextName(context, "listeners");
      const eventVar = nextName(context, "event");
      const handlerVar = nextName(context, "handler");
      const wrappedHandlerVar = nextName(context, "handler");
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
      emit(context, indent + 4, `const ${wrappedHandlerVar} = ($event) => ${handlerVar}($event);`);
      emit(context, indent + 4, `${elementVar}.addEventListener(${eventVar}, ${wrappedHandlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
      emit(context, indent + 4, `${listenersVar}.set(${eventVar}, ${wrappedHandlerVar});`);
      emit(context, indent + 3, "}");
      emit(context, indent + 2, "}");
      emit(context, indent + 1, "}");
      emit(context, indent, "});");
      emit(context, indent, `__mikuru_activeCleanup.push(() => {`);
      emit(context, indent + 1, `${stopVar}();`);
      emit(context, indent + 1, `for (const [${eventVar}, ${handlerVar}] of ${listenersVar}) {`);
      emit(context, indent + 2, `${elementVar}.removeEventListener(${eventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
      emit(context, indent + 1, "}");
      emit(context, indent + 1, `${listenersVar}.clear();`);
      emit(context, indent, "});");
      continue;
    }

    const event = parseEventDirective(attr.name);
    const dynamicEvent = event?.nameExpression ? event : undefined;
    if (dynamicEvent && attr.value !== true) {
      validateEventModifiers(dynamicEvent, attr);
      const expression = compileHydrationExpression(context, dynamicEvent.nameExpression ?? "", attr.name);
      const eventOptions = eventListenerOptions(dynamicEvent);
      const handlerVar = nextName(context, "handler");
      const currentEventVar = nextName(context, "eventName");
      const nextEventVar = nextName(context, "eventName");
      emitHydrationEventHandler(context, indent, elementVar, handlerVar, String(attr.value).trim(), dynamicEvent);
      emit(context, indent, `let ${currentEventVar};`);
      emit(context, indent, "__mikuru_activeCleanup.push(effect(() => {");
      emit(context, indent + 1, `const ${nextEventVar} = String(unwrap(${expression}) ?? "");`);
      emit(context, indent + 1, `if (${nextEventVar} === ${currentEventVar}) return;`);
      emit(context, indent + 1, `if (${currentEventVar}) ${elementVar}.removeEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
      emit(context, indent + 1, `${currentEventVar} = ${nextEventVar};`);
      emit(context, indent + 1, `if (${currentEventVar}) ${elementVar}.addEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
      emit(context, indent, "}));");
      emit(context, indent, `__mikuru_activeCleanup.push(() => { if (${currentEventVar}) ${elementVar}.removeEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}); });`);
      continue;
    }

    if (!event?.name || attr.value === true) {
      continue;
    }

    validateEventModifiers(event, attr);
    const eventOptions = eventListenerOptions(event);
    const handlerVar = nextName(context, "handler");
    emitHydrationEventHandler(context, indent, elementVar, handlerVar, String(attr.value).trim(), event);
    emit(context, indent, `${elementVar}.addEventListener(${quote(event.name)}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
    emit(context, indent, `__mikuru_activeCleanup.push(() => ${elementVar}.removeEventListener(${quote(event.name)}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}));`);
  }
}

function emitHydrationEventHandler(context: HydrationContext, indent: number, elementVar: string, handlerVar: string, handlerExpression: string, event: EventDirective): void {
  const guard = eventModifierGuardExpression(event);
  const hasControl = event.modifiers.includes("prevent") || event.modifiers.includes("stop") || event.modifiers.includes("self") || guard;
  const compiledHandler = eventHandlerExpression(handlerExpression, context as GenerateContext, undefined);

  if (!hasControl) {
    emit(context, indent, `const ${handlerVar} = __mikuru_guardEventHandler(${compiledHandler});`);
    return;
  }

  const baseHandlerVar = nextName(context, "handler");
  emit(context, indent, `const ${baseHandlerVar} = ${compiledHandler};`);
  emit(context, indent, `const ${handlerVar} = ($event) => __mikuru_try(() => {`);
  if (event.modifiers.includes("self")) {
    emit(context, indent + 1, `if ($event.target !== ${elementVar}) { return; }`);
  }
  if (guard) {
    emit(context, indent + 1, `if (${guard}) { return; }`);
  }
  if (event.modifiers.includes("prevent")) {
    emit(context, indent + 1, "$event.preventDefault();");
  }
  if (event.modifiers.includes("stop")) {
    emit(context, indent + 1, "$event.stopPropagation();");
  }
  emit(context, indent + 1, `return ${baseHandlerVar}($event);`);
  emit(context, indent, `}, __mikuru_context.errorHandler, "event");`);
}

function hydrateModelAndShow(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  for (const attr of node.attrs) {
    const modelDirective = parseModelDirective(attr.name);
    if (modelDirective) {
      if (modelDirective.argument) {
        continue;
      }
      const expression = validateAssignableExpression(getAttrValueFromDirective(attr), attr.name, {
        source: context.source ?? String(attr.value),
        offset: attr.valueLoc?.offset ?? attr.loc?.offset ?? 0,
        filename: context.filename
      });
      const handlerVar = nextName(context, "handler");
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

      const warnedVar = nextName(context, "modelMismatchWarned");
      emit(context, indent, `let ${warnedVar} = false;`);
      emit(context, indent, "__mikuru_activeCleanup.push(effect(() => {");
      if (modelMode === "select-multiple") {
        const expectedValuesVar = nextName(context, "expectedValues");
        const actualValuesVar = nextName(context, "actualValues");
        const optionValueVar = nextName(context, "optionValue");
        emit(context, indent + 1, `const ${expectedValuesVar} = unwrap(${expression}) ?? [];`);
        emit(context, indent + 1, `const ${actualValuesVar} = Array.from(${elementVar}.selectedOptions).map((option) => ${modelElementValueExpression("option", modelDirective.modifiers)});`);
        emit(context, indent + 1, `if (${actualValuesVar}.length !== ${expectedValuesVar}.length || ${expectedValuesVar}.some((${optionValueVar}) => !${actualValuesVar}.some((actualValue) => Object.is(actualValue, ${optionValueVar}))) || ${actualValuesVar}.some((${optionValueVar}) => !${expectedValuesVar}.some((expectedValue) => Object.is(expectedValue, ${optionValueVar})))) {`);
        emit(context, indent + 2, `if (!${warnedVar}) { __mikuru_warn("v-model selected mismatch: expected " + JSON.stringify(${expectedValuesVar}) + ", got " + JSON.stringify(${actualValuesVar}) + "."); ${warnedVar} = true; }`);
        emit(context, indent + 1, "}");
        emit(context, indent + 1, renderedValue);
      } else if (modelMode === "select") {
        emit(context, indent + 1, `if (${elementVar}.selectedOptions.length === 0 || !Object.is(${modelElementValueExpression(`${elementVar}.selectedOptions[0]`, modelDirective.modifiers)}, unwrap(${expression}))) {`);
        emit(context, indent + 2, `if (!${warnedVar}) { __mikuru_warn("v-model selected mismatch: expected " + JSON.stringify(unwrap(${expression})) + ", got " + JSON.stringify(${elementVar}.selectedOptions.length === 0 ? "" : ${modelElementValueExpression(`${elementVar}.selectedOptions[0]`, modelDirective.modifiers)}) + "."); ${warnedVar} = true; }`);
        emit(context, indent + 2, renderedValue);
        emit(context, indent + 1, "}");
      } else {
        emit(context, indent + 1, `if (${elementVar}.${propertyName} !== ${renderedValue}) {`);
        emit(context, indent + 2, `if (!${warnedVar}) { __mikuru_warn(${quote(`v-model ${propertyName} mismatch: expected `)} + JSON.stringify(${renderedValue}) + ", got " + JSON.stringify(${elementVar}.${propertyName}) + "."); ${warnedVar} = true; }`);
        emit(context, indent + 2, `${elementVar}.${propertyName} = ${renderedValue};`);
        emit(context, indent + 1, "}");
      }
      emit(context, indent, "}));");
      emit(context, indent, `const ${handlerVar} = ($event) => { ${expression}.value = ${assignedValue}; };`);
      emit(context, indent, `${elementVar}.addEventListener(${quote(eventName)}, ${handlerVar});`);
      emit(context, indent, `__mikuru_activeCleanup.push(() => ${elementVar}.removeEventListener(${quote(eventName)}, ${handlerVar}));`);
      continue;
    }

    if (attr.name === "v-show") {
      emit(context, indent, `__mikuru_activeCleanup.push(effect(() => { ${elementVar}.style.display = unwrap(${compileHydrationExpression(context, getAttrValueFromDirective(attr), attr.name)}) ? "" : "none"; }));`);
    }
  }
}

function hydrateContentDirective(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  const attr = getContentDirectiveAttr(node);

  if (!attr || attr.value === true) {
    return;
  }

  const expression = compileHydrationExpression(context, String(attr.value), attr.name);
  const property = attr.name === "v-html" ? "innerHTML" : "textContent";
  const warnedVar = nextName(context, "contentMismatchWarned");
  emit(context, indent, `let ${warnedVar} = false;`);
  emit(context, indent, `__mikuru_activeCleanup.push(effect(() => { const __mikuru_content = String(unwrap(${expression}) ?? ""); if (${elementVar}.${property} !== __mikuru_content) { if (!${warnedVar}) { __mikuru_warn(${quote(`${attr.name} content mismatch: expected `)} + JSON.stringify(__mikuru_content) + ", got " + JSON.stringify(${elementVar}.${property} ?? "") + "."); ${warnedVar} = true; } ${elementVar}.${property} = __mikuru_content; } }));`);
}

function hydrateText(context: HydrationContext, node: TextNode, nodeVar: string, indent: number): void {
  const expression = node.parts.map((part) => {
    if (part.type === "static") {
      return quote(part.value);
    }
    return `String(unwrap(${compileHydrationExpression(context, part.value, "interpolation")}) ?? "")`;
  }).join(" + ");
  const warnedVar = nextName(context, "textMismatchWarned");
  emit(context, indent, `let ${warnedVar} = false;`);
  emit(context, indent, `__mikuru_activeCleanup.push(effect(() => { const __mikuru_text = ${expression || "\"\""}; if (${nodeVar}.textContent !== __mikuru_text) { if (!${warnedVar}) { __mikuru_warn("Text content mismatch: expected " + JSON.stringify(__mikuru_text) + ", got " + JSON.stringify(${nodeVar}.textContent ?? "") + "."); ${warnedVar} = true; } ${nodeVar}.textContent = __mikuru_text; } }));`);
}

function hydrateTemplateRef(context: HydrationContext, node: ElementNode, valueExpression: string, indent: number): void {
  const refAttr = getTemplateRefAttr(node);

  if (!refAttr) {
    return;
  }

  const targetExpression = templateRefTargetExpression(context, refAttr);
  const cleanupRefVar = nextName(context, "cleanupRef");
  const multiple = context.templateRefMode === "array";
  emit(context, indent, `const ${cleanupRefVar} = __mikuru_setRef(${targetExpression}, ${valueExpression}, ${multiple ? "true" : "false"});`);
  emit(context, indent, `__mikuru_activeCleanup.push(${cleanupRefVar});`);
}

function getTemplateRefAttr(node: ElementNode): TemplateAttribute | undefined {
  return node.attrs.find((attr) => attr.name === "ref" || getDynamicAttrName(attr.name) === "ref");
}

function templateRefTargetExpression(context: HydrationContext, attr: TemplateAttribute): string {
  if (getDynamicAttrName(attr.name) === "ref") {
    return compileHydrationExpression(context, requireAttrValue(attr), attr.name);
  }

  if (attr.value === true || !attr.value.trim()) {
    throw new Error("Template ref requires a ref object name, for example ref=\"inputEl\"");
  }

  const name = attr.value.trim();

  if (!isIdentifier(name)) {
    throw new Error("Template ref must be a simple identifier that points to a ref object");
  }

  return name;
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
    || attr.name === "v-html"
    || attr.name === "v-text"
    || attr.name === "v-pre"
    || attr.name === "v-cloak"
    || attr.name === "v-model"
    || attr.name.startsWith("v-model.")
    || attr.name.startsWith("v-model:")
    || attr.name === "ref"
    || getDynamicAttrName(attr.name) === "ref"
    || attr.name === "key"
    || Boolean(parseObjectOnDirective(attr.name))
    || attr.name.startsWith("@")
    || attr.name.startsWith("v-on:");
}

function isDirectiveAttr(attr: TemplateAttribute): boolean {
  return shouldSkipAttr(attr)
    || Boolean(parseBindDirective(attr.name))
    || Boolean(parseObjectBindDirective(attr.name));
}

function expectedStaticAttributeValue(name: string): string {
  return booleanAttributes.has(name.toLowerCase()) ? "" : "true";
}

const booleanAttributes = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected"
]);

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

function validateKeepAliveAttributes(node: ElementNode): void {
  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (name === "include" || name === "exclude" || name === "max") {
      continue;
    }

    throw new Error(`Unsupported attribute "${attr.name}" on <KeepAlive>. Supported attributes: include, exclude, and max.`);
  }
}

function validateAsyncBoundaryAttributes(node: ElementNode): void {
  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (name === "loading" || name === "fallback" || name === "delay" || name === "timeout") {
      continue;
    }

    throw new Error(`Unsupported attribute "${attr.name}" on <AsyncBoundary>. Supported attributes: loading, fallback, delay, and timeout.`);
  }
}

function validateErrorBoundaryAttributes(node: ElementNode): void {
  for (const attr of node.attrs) {
    const name = parseBindDirective(attr.name)?.name ?? attr.name;
    if (name === "fallback" || name === "reset-key") {
      continue;
    }

    throw new Error(`Unsupported attribute "${attr.name}" on <ErrorBoundary>. Supported attributes: fallback and reset-key.`);
  }
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

    throw new Error(`Unsupported attribute "${attr.name}" on <Transition>. Supported attributes: name, appear, mode, and CSS class override attributes.`);
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

    throw new Error(`Unsupported attribute "${attr.name}" on <TransitionGroup>. Supported attributes: name, tag, and CSS class override attributes.`);
  }
}

function getErrorBoundaryFallbackAttr(node: ElementNode): TemplateAttribute {
  const attr = node.attrs.find((candidate) => parseBindDirective(candidate.name)?.name === "fallback");
  if (!attr) {
    throw new Error("<ErrorBoundary> requires :fallback to resolve to a component object");
  }

  return attr;
}

function getAsyncBoundaryChildren(node: ElementNode): TemplateNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length === 0) {
    throw new Error("<AsyncBoundary> requires at least one child");
  }

  return node.children;
}

function getTransitionChildren(node: ElementNode): ElementNode[] {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length === 0 || meaningful.some((child) => child.type !== "element")) {
    throw new Error("<Transition> requires exactly one element/component child or one v-if chain");
  }

  const children = meaningful as ElementNode[];

  if (children.length === 1) {
    return children;
  }

  if (!getAttr(children[0], "v-if")) {
    throw new Error("<Transition> requires exactly one element/component child or one v-if chain");
  }

  for (const child of children.slice(1)) {
    if (!getAttr(child, "v-else-if") && !getAttr(child, "v-else")) {
      throw new Error("<Transition> only accepts multiple children when they form a v-if chain");
    }
  }

  return children;
}

function getTransitionGroupChild(node: ElementNode): ElementNode {
  const child = getSingleElementChild(node, "<TransitionGroup>");

  if (!getAttr(child, "v-for") || !getKeyExpression(child)) {
    throw new Error("<TransitionGroup> requires a single keyed v-for child in v1");
  }

  return child;
}

function getTransitionGroupTagExpression(context: HydrationContext, node: ElementNode): string {
  const dynamicTag = node.attrs.find((attr) => parseBindDirective(attr.name)?.name === "tag");
  if (dynamicTag) {
    return compileHydrationExpression(context, requireAttrValue(dynamicTag), dynamicTag.name);
  }

  return quote(getStaticAttrValue(node, "tag") ?? "span");
}

function getKeyExpression(node: ElementNode): string | undefined {
  return getStaticAttrValue(node, ":key") ?? getStaticAttrValue(node, "v-bind:key");
}

function getSingleElementChild(node: ElementNode, label: string): ElementNode {
  const meaningful = node.children.filter((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));

  if (meaningful.length !== 1 || meaningful[0]?.type !== "element") {
    throw new Error(`${label} requires exactly one element or component child`);
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

function getDynamicAttrName(name: string): string | undefined {
  const binding = parseBindDirective(name);
  return binding?.nameExpression ? undefined : binding?.name;
}

function getEventName(name: string): string | undefined {
  if (name.startsWith("@[") || name.startsWith("v-on:[")) return undefined;
  if (name.startsWith("@")) return name.slice(1).split(".")[0];
  if (name.startsWith("v-on:")) return name.slice("v-on:".length).split(".")[0];
  return undefined;
}

function parseEventDirective(name: string): EventDirective | undefined {
  const dynamic = getDynamicEventArgument(name);
  if (dynamic) {
    return { nameExpression: dynamic.expression, modifiers: dynamic.modifiers };
  }

  const rawName = name.startsWith("@")
    ? name.slice(1)
    : name.startsWith("v-on:")
      ? name.slice("v-on:".length)
      : undefined;

  if (!rawName || rawName.startsWith("[")) {
    return undefined;
  }

  const [eventName, ...modifiers] = rawName.split(".");
  return { name: eventName, modifiers };
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

function validateBindModifiers(binding: BindDirective, attr: TemplateAttribute): void {
  const allowed = new Set(["camel", "prop", "attr"]);
  for (const modifier of binding.modifiers) {
    if (!allowed.has(modifier)) {
      throw new Error(`Unsupported v-bind modifier ".${modifier}" on ${attr.name}. Use .camel, .prop, or .attr.`);
    }
  }

  if (binding.modifiers.includes("prop") && binding.modifiers.includes("attr")) {
    throw new Error(`v-bind modifiers .prop and .attr cannot be used together on ${attr.name}`);
  }
}

function validateObjectBindModifiers(binding: BindDirective, attr: TemplateAttribute): void {
  const allowed = new Set(["camel", "prop", "attr"]);
  for (const modifier of binding.modifiers) {
    if (!allowed.has(modifier)) {
      throw new Error(`Unsupported object v-bind modifier ".${modifier}" on ${attr.name}. Use .camel, .prop, or .attr.`);
    }
  }

  if (binding.modifiers.includes("prop") && binding.modifiers.includes("attr")) {
    throw new Error(`Object v-bind modifiers .prop and .attr cannot be used together on ${attr.name}`);
  }
}

function bindOptionsExpression(binding: BindDirective): string {
  if (binding.modifiers.includes("prop")) return ", { property: true }";
  if (binding.modifiers.includes("attr")) return ", { attribute: true }";
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

function parseObjectBindDirective(name: string): BindDirective | undefined {
  if (name === "v-bind") {
    return { modifiers: [] };
  }

  if (!name.startsWith("v-bind.")) {
    return undefined;
  }

  return { modifiers: name.slice("v-bind.".length).split(".").filter(Boolean) };
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

function validateEventModifiers(event: EventDirective, attr: TemplateAttribute): void {
  const supportedModifiers = [...eventControlModifiers, ...eventOptionModifiers, ...eventSystemModifiers, ...eventMouseModifiers, ...eventKeyModifiers, "exact"];

  for (const modifier of event.modifiers) {
    if (!supportedModifiers.includes(modifier)) {
      throw new Error(`Unsupported event modifier .${modifier} on ${attr.name}.`);
    }
  }

  if (event.modifiers.includes("passive") && event.modifiers.includes("prevent")) {
    throw new Error(`Event modifiers .passive and .prevent cannot be combined on ${attr.name}`);
  }
}

function validateObjectOnModifiers(event: EventDirective, attr: TemplateAttribute, target: "element" | "component"): void {
  if (target === "component" && event.modifiers.length > 0) {
    throw new Error(`Object v-on modifiers are only supported on native elements: ${attr.name}`);
  }

  for (const modifier of event.modifiers) {
    if (!eventOptionModifiers.includes(modifier)) {
      throw new Error(`Object v-on modifier .${modifier} is not supported on ${attr.name}. Use .once, .capture, or .passive.`);
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

function getDynamicEventArgument(name: string): { expression: string; modifiers: string[] } | undefined {
  const dynamic = parseDynamicArgument(name, ["@", "v-on:"]);
  if (!dynamic) return undefined;
  return { expression: dynamic.expression, modifiers: dynamic.modifiers };
}

function parseDynamicArgument(name: string, prefixes: string[]): { expression: string; modifiers: string[] } | undefined {
  for (const prefix of prefixes) {
    if (!name.startsWith(`${prefix}[`)) continue;
    const argumentStart = prefix.length + 1;
    const argumentEnd = name.indexOf("]", argumentStart);
    if (argumentEnd === -1) return undefined;
    const expression = name.slice(argumentStart, argumentEnd).trim();
    if (!expression) return undefined;
    const rest = name.slice(argumentEnd + 1);
    const modifiers = rest.startsWith(".") ? rest.slice(1).split(".").filter(Boolean) : [];
    return { expression, modifiers };
  }
  return undefined;
}

function parseModelDirective(name: string): { argument?: string; modifiers: string[] } | undefined {
  if (name === "v-model") return { modifiers: [] };
  if (name.startsWith("v-model.")) return { modifiers: name.slice("v-model.".length).split(".").filter(Boolean) };
  if (!name.startsWith("v-model:")) return undefined;
  const [argument = "", ...modifiers] = name.slice("v-model:".length).split(".");
  return { argument, modifiers: modifiers.filter(Boolean) };
}

function hasElementModel(node: ElementNode): boolean {
  return node.attrs.some((attr) => Boolean(parseModelDirective(attr.name)));
}

function getAttrValueFromDirective(attr: TemplateAttribute): string {
  return attr.value === true ? "" : String(attr.value);
}

function requireAttrValue(attr: TemplateAttribute): string {
  if (attr.value === true) {
    throw new Error(`Attribute ${attr.name} requires a value`);
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

function hasStaticBooleanAttr(node: ElementNode, name: string): boolean {
  const attr = getAttr(node, name);
  return !!attr && (attr.value === true || attr.value === "");
}

const modelValueProperty = "__mikuruModelValue";

function modelElementValueExpression(targetExpression: string, modifiers: string[]): string {
  const raw = `(${quote(modelValueProperty)} in ${targetExpression} ? ${targetExpression}[${quote(modelValueProperty)}] : ${targetExpression}.getAttribute("value") ?? (${targetExpression}.tagName === "OPTION" ? (${targetExpression}.textContent ?? "") : ${targetExpression}.value ?? ""))`;
  const trimmed = modifiers.includes("trim") ? `String(${raw}).trim()` : raw;
  return modifiers.includes("number") ? `Number(${trimmed})` : trimmed;
}

function modelAssignedValue(modelMode: string, modifiers: string[], expression: string): string {
  if (modelMode === "checkbox") {
    const valueExpression = modelElementValueExpression("$event.target", modifiers);
    return `(() => { const current = unwrap(${expression}); if (Array.isArray(current)) { return $event.target.checked ? [...current, ${valueExpression}] : current.filter((item) => !Object.is(item, ${valueExpression})); } return $event.target.checked; })()`;
  }
  if (modelMode === "radio") {
    return modelElementValueExpression("$event.target", modifiers);
  }
  if (modelMode === "select-multiple") {
    return `Array.from($event.target.selectedOptions).map((option) => ${modelElementValueExpression("option", modifiers)})`;
  }
  if (modelMode === "select") {
    return `(() => { const option = $event.target.selectedOptions[0]; return option ? ${modelElementValueExpression("option", modifiers)} : ""; })()`;
  }
  const raw = "$event.target.value";
  const trimmed = modifiers.includes("trim") ? `${raw}.trim()` : raw;
  return modifiers.includes("number") ? `Number(${trimmed})` : trimmed;
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

function toExpressionContext(
  context: HydrationContext,
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

function throwTemplateError(message: string, context: HydrationContext, location: SourceLocation | undefined): never {
  if (context.source && location) {
    throw createCompileError(message, context.source, location.offset, context.filename);
  }

  throw new Error(message);
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
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

    if (depth === 0 && source.startsWith(delimiter, index)) {
      parts.push(source.slice(start, index));
      start = index + delimiter.length;
      index += delimiter.length - 1;
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

    if (depth === 0 && source.startsWith(token, index)) {
      return index;
    }
  }

  return -1;
}

function withTemplateRefMode<T>(context: HydrationContext, mode: "single" | "array", callback: () => T): T {
  const previousMode = context.templateRefMode;
  context.templateRefMode = mode;

  try {
    return callback();
  } finally {
    context.templateRefMode = previousMode;
  }
}

function emit(context: HydrationContext, indent: number, line: string): void {
  context.lines.push(`${"  ".repeat(indent)}${line}`);
}

function emitRaw(context: HydrationContext, source: string, indent = 0): void {
  for (const line of source.split(/\r?\n/)) {
    context.lines.push(`${"  ".repeat(indent)}${line}`);
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
