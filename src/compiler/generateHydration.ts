import { compileTemplateExpression, parseForExpression, validateAssignableExpression } from "./parseExpression.js";
import type { ElementNode, SfcDescriptor, TemplateAttribute, TemplateNode, TextNode } from "./types.js";

type HydrationContext = {
  lines: string[];
  index: number;
  teleportIndex: number;
  templateRefMode?: "single" | "array";
  source?: string;
  filename?: string;
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

type EventDirective = {
  name?: string;
  nameExpression?: string;
  modifiers: string[];
};

type GenerateHydrationOptions = {
  includeImports?: boolean;
};

export function generateHydration(descriptor: SfcDescriptor, root: ElementNode, options: GenerateHydrationOptions = {}): string {
  const context: HydrationContext = {
    lines: [],
    index: 0,
    teleportIndex: 0,
    source: descriptor.source,
    filename: descriptor.filename
  };
  const script = splitScript(descriptor.script ?? "");

  if (options.includeImports !== false) {
    for (const importLine of script.imports) {
      emit(context, 0, importLine);
    }
    emit(context, 0, "import { effect, setAttribute, unwrap } from \"mikuru/runtime\";");
    emit(context, 0, "");
  }

  emit(context, 0, "export function hydrate(target, props = {}) {");
  emit(context, 1, `const __mikuru_componentInfo = { component: ${quote(descriptor.filename ?? "anonymous.mikuru")}, filename: ${quote(descriptor.filename ?? "anonymous.mikuru")} };`);
  emit(context, 1, "const __mikuru_cleanup = [];");
  emit(context, 1, "const __mikuru_afterUnmount = [];");
  emit(context, 1, "const __mikuru_mounted = [];");
  emit(context, 1, "const __mikuru_context = { parent: props.__mikuru_context, provides: new Map(), errorHandler: props.__mikuru_context?.errorHandler, ...__mikuru_componentInfo };");
  emit(context, 1, "const __mikuru_try = (fn) => { try { return fn(); } catch (error) { setTimeout(() => { throw error; }); } };");
  emit(context, 1, "const __mikuru_previousRegistrar = globalThis.__mikuru_currentRegistrar;");
  emit(context, 1, "globalThis.__mikuru_currentRegistrar = {");
  emit(context, 2, "registerMounted: (fn) => __mikuru_mounted.push(fn),");
  emit(context, 2, "registerBeforeUnmount: (fn) => __mikuru_cleanup.push(fn),");
  emit(context, 2, "registerUnmounted: (fn) => __mikuru_afterUnmount.push(fn),");
  emit(context, 2, "provide: (key, value) => __mikuru_context.provides.set(key, value),");
  emit(context, 2, "inject: (key) => {");
  emit(context, 3, "for (let context = __mikuru_context; context; context = context.parent) {");
  emit(context, 4, "if (context.provides?.has(key)) return { found: true, value: context.provides.get(key) };");
  emit(context, 3, "}");
  emit(context, 3, "return { found: false };");
  emit(context, 2, "},");
  emit(context, 2, "registerEffect: (fn) => Promise.resolve().then(fn)");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_warn = (message) => { if (typeof console !== \"undefined\" && console.warn) console.warn(`[Mikuru hydration] ${message}`); };");
  emit(context, 1, "const __mikuru_describeNode = (node) => { if (!node) return \"missing\"; if (node.nodeType === 1) return `<${node.tagName?.toLowerCase?.() ?? \"element\"}>`; if (node.nodeType === 3) return `text(${JSON.stringify(node.nodeValue ?? \"\")})`; if (node.nodeType === 8) return `comment(${JSON.stringify(node.nodeValue ?? \"\")})`; return `nodeType(${node.nodeType})`; };");
  emit(context, 1, "const __mikuru_restoreRegistrar = () => { if (__mikuru_previousRegistrar === undefined) { delete globalThis.__mikuru_currentRegistrar; } else { globalThis.__mikuru_currentRegistrar = __mikuru_previousRegistrar; } };");
  emit(context, 1, "const __mikuru_recovery = {};");
  emit(context, 1, "let __mikuru_recovered;");
  emit(context, 1, "const __mikuru_recover = (message) => {");
  emit(context, 2, "if (props.__mikuru_hydration?.recover === false) { __mikuru_warn(message + \".\"); return; }");
  emit(context, 2, "__mikuru_warn(message + \"; remounting.\");");
  emit(context, 2, "for (const cleanup of __mikuru_cleanup.splice(0).reverse()) __mikuru_try(cleanup);");
  emit(context, 2, "for (const cb of __mikuru_afterUnmount.splice(0).reverse()) __mikuru_try(cb);");
  emit(context, 2, "__mikuru_restoreRegistrar();");
  emit(context, 2, "if (target.nodeType === 1) { target.innerHTML = \"\"; }");
  emit(context, 2, "__mikuru_recovered = mount(target, props);");
  emit(context, 2, "throw __mikuru_recovery;");
  emit(context, 1, "};");
  emit(context, 1, "const __mikuru_findComment = (parent, value) => Array.from(parent.childNodes ?? []).find((node) => node.nodeType === 8 && node.nodeValue === value);");
  emit(context, 1, "const __mikuru_findNextComment = (node, value) => { for (let cursor = node.nextSibling; cursor; cursor = cursor.nextSibling) { if (cursor.nodeType === 8 && cursor.nodeValue === value) return cursor; } return undefined; };");
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
    emitRaw(context, script.body.trim(), 1);
    emit(context, 1, "");
  }
  emit(context, 1, "const __mikuru_root = target.nodeType === 1 && target.tagName?.toLowerCase() === " + quote(root.tag.toLowerCase()) + " ? target : target.firstElementChild;");
  emit(context, 1, `if (!__mikuru_root || __mikuru_root.tagName?.toLowerCase() !== ${quote(root.tag.toLowerCase())}) { __mikuru_warn("Root mismatch: expected <${root.tag.toLowerCase()}>, got " + __mikuru_describeNode(__mikuru_root) + "; falling back to mount()."); __mikuru_restoreRegistrar(); return mount(target, props); }`);
  emit(context, 1, "try {");
  hydrateElement(context, root, "__mikuru_root", 2);
  emit(context, 1, "} catch (error) {");
  emit(context, 2, "if (error === __mikuru_recovery) { return __mikuru_recovered; }");
  emit(context, 2, "throw error;");
  emit(context, 1, "}");
  emit(context, 1, "for (const cb of __mikuru_mounted.splice(0)) { __mikuru_try(cb); }");
  emit(context, 1, "__mikuru_restoreRegistrar();");
  emit(context, 1, "return {");
  emit(context, 2, "element: __mikuru_root,");
  emit(context, 2, "unmount() { for (const cleanup of __mikuru_cleanup.splice(0).reverse()) __mikuru_try(cleanup); for (const cb of __mikuru_afterUnmount.splice(0).reverse()) __mikuru_try(cb); }");
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
  const hydrateChildrenBeforeModel = node.tag === "select" && !contentDirective;
  if (hydrateChildrenBeforeModel) {
    hydrateChildren(context, node.children, elementVar, indent);
  }
  hydrateModelAndShow(context, node, elementVar, indent);
  hydrateContentDirective(context, node, elementVar, indent);
  hydrateTemplateRef(context, node, elementVar, indent);
  if (!contentDirective && !hydrateChildrenBeforeModel) {
    hydrateChildren(context, node.children, elementVar, indent);
  }
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

    if (child.type === "element" && child.tag === "component") {
      hydrateDynamicComponentAtIndex(context, child, parentVar, domIndexVar, indent);
      return;
    }

    if (child.type === "element" && child.tag === "KeepAlive") {
      hydrateKeepAliveAtIndex(context, child, parentVar, domIndexVar, indent);
      return;
    }

    if (child.type === "element" && child.tag === "AsyncBoundary") {
      hydrateAsyncBoundaryAtIndex(context, child, parentVar, domIndexVar, indent);
      return;
    }

    if (child.type === "element" && child.tag === "ErrorBoundary") {
      hydrateErrorBoundaryAtIndex(context, child, parentVar, domIndexVar, indent);
      return;
    }

    if (child.type === "element" && child.tag === "TransitionGroup") {
      hydrateTransitionGroupAtIndex(context, child, parentVar, domIndexVar, indent);
      return;
    }

    if (child.type === "element" && child.tag === "Transition") {
      hydrateTransitionAtIndex(context, child, parentVar, domIndexVar, indent);
      return;
    }

    if (child.type === "element" && getAttr(child, "v-if") && !getAttr(child, "v-pre")) {
      hydrateIf(context, child, parentVar, domIndexVar, indent);
      emit(context, indent, `${domIndexVar} += 1;`);
      return;
    }

    if (child.type === "element" && getAttr(child, "v-for") && !getAttr(child, "v-pre")) {
      hydrateFor(context, child, parentVar, domIndexVar, indent, domIndexVar);
      return;
    }

    const childVar = nextName(context, "node");
    emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndexVar}];`);
    if (child.type === "element") {
      const elementCheck = isComponentTag(child.tag)
        ? `!${childVar} || ${childVar}.nodeType !== 1`
        : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(child.tag.toLowerCase())}`;
      emit(context, indent, `if (${elementCheck}) { __mikuru_recover(${quote(`Element mismatch: expected <${child.tag.toLowerCase()}>, got `)} + __mikuru_describeNode(${childVar})); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    } else {
      emit(context, indent, `if (!${childVar} || ${childVar}.nodeType !== 3) { __mikuru_recover("Text mismatch: expected text, got " + __mikuru_describeNode(${childVar})); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    }
    emit(context, indent, `${domIndexVar} += 1;`);
  });
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
  const nodesVar = nextName(context, "teleportNodes");
  const cursorVar = nextName(context, "teleportCursor");
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
  const elementCheck = isComponentTag(node.tag)
    ? `!${childVar} || ${childVar}.nodeType !== 1`
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

function hydrateFor(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number, advanceVar?: string): void {
  const attr = getAttr(node, "v-for");
  if (!attr || attr.value === true) {
    return;
  }

  const forExpression = parseForExpression(String(attr.value));
  const listVar = nextName(context, "list");
  const itemVar = nextName(context, "item");
  const childVar = nextName(context, "row");
  const elementCheck = isComponentTag(node.tag)
    ? `!${childVar} || ${childVar}.nodeType !== 1`
    : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(node.tag.toLowerCase())}`;
  emit(context, indent, `const ${listVar} = Array.from(unwrap(${compileHydrationExpression(context, forExpression.source, "v-for source")}) ?? []);`);
  emit(context, indent, `for (const [__mikuru_index, ${itemVar}] of ${listVar}.entries()) {`);
  emit(context, indent + 1, `const ${forExpression.item} = ${itemVar};`);
  if (forExpression.index) {
    emit(context, indent + 1, `const ${forExpression.index} = __mikuru_index;`);
  }
  emit(context, indent + 1, `const ${childVar} = ${parentVar}.childNodes[${domIndex} + __mikuru_index];`);
  emit(context, indent + 1, `if (${elementCheck}) { __mikuru_recover("List mismatch: dynamic v-for expected row, got " + __mikuru_describeNode(${childVar})); } else {`);
  withTemplateRefMode(context, "array", () => {
    hydrateElement(context, withoutAttrs(node, ["v-for"]), childVar, indent + 2);
  });
  emit(context, indent + 1, "}");
  emit(context, indent, "}");
  if (advanceVar) {
    emit(context, indent, `${advanceVar} += ${listVar}.length;`);
  }
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
      emit(context, indent, `__mikuru_cleanup.push(effect(() => {`);
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
      emit(context, indent, `__mikuru_cleanup.push(effect(() => setAttribute(${elementVar}, ${quote(dynamicName)}, ${valueExpression}${bindOptionsExpression(bindDirective)})));`);
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
      emit(context, indent, "__mikuru_cleanup.push(effect(() => {");
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
  emit(context, indent, `const ${propsVar} = {};`);
  hydrateComponentProps(context, node, propsVar, indent);
  emit(context, indent, `${propsVar}.__mikuru_context = __mikuru_context;`);
  emitRouterViewRouteSlot(context, node, propsVar, indent);
  emit(context, indent, `if (${node.tag} && typeof ${node.tag}.hydrate === "function") {`);
  emit(context, indent + 1, `const __mikuru_child = ${node.tag}.hydrate(${elementVar}, ${propsVar});`);
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_cleanup.push(() => __mikuru_child.unmount());`);
  hydrateTemplateRef(context, node, "__mikuru_child", indent + 1);
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
  hydrateTemplateRef(context, node, "__mikuru_child", indent + 1);
  emit(context, indent, "} else {");
  emit(context, indent + 1, `__mikuru_recover(${quote(`Component mismatch at <${node.tag}>`)});`);
  emit(context, indent, "}");
}

function emitRouterViewRouteSlot(context: HydrationContext, node: ElementNode, propsVar: string, indent: number): void {
  if (node.tag !== "RouterView") return;
  emit(context, indent, `if (typeof props.children === "function") { ${propsVar}.children = props.children; ${propsVar}.slots = { ...(${propsVar}.slots ?? {}), default: props.children }; }`);
}

function hydrateDynamicComponentAtIndex(context: HydrationContext, node: ElementNode, parentVar: string, domIndex: string, indent: number): void {
  const isAttr = getDynamicComponentIsAttr(node);

  if (!isAttr) {
    throw new Error("Dynamic component requires :is to resolve to a component object");
  }

  const componentTypeVar = nextName(context, "dynamicComponent");
  const childVar = nextName(context, "node");
  emit(context, indent, `const ${componentTypeVar} = unwrap(${compileHydrationExpression(context, requireAttrValue(isAttr), isAttr.name)});`);
  emit(context, indent, `if (${componentTypeVar}) {`);
  emit(context, indent + 1, `const ${childVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent + 1, `if (!${childVar} || ${childVar}.nodeType !== 1) { __mikuru_recover("Element mismatch: expected dynamic component root, got " + __mikuru_describeNode(${childVar})); } else {`);
  hydrateDynamicComponent(context, node, childVar, componentTypeVar, indent + 2);
  emit(context, indent + 1, "}");
  emit(context, indent + 1, `${domIndex} += 1;`);
  emit(context, indent, "}");
}

function hydrateDynamicComponent(context: HydrationContext, node: ElementNode, elementVar: string, componentType: string, indent: number): void {
  const dynamicNode = withoutDynamicComponentIs(node);
  const propsVar = nextName(context, "props");
  emit(context, indent, `const ${propsVar} = {};`);
  hydrateComponentProps(context, dynamicNode, propsVar, indent);
  emit(context, indent, `${propsVar}.__mikuru_context = __mikuru_context;`);
  emitRouterViewRouteSlot(context, dynamicNode, propsVar, indent);
  emit(context, indent, `if (${componentType} && typeof ${componentType}.hydrate === "function") {`);
  emit(context, indent + 1, `const __mikuru_child = ${componentType}.hydrate(${elementVar}, ${propsVar});`);
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_cleanup.push(() => __mikuru_child.unmount());`);
  hydrateTemplateRef(context, dynamicNode, "__mikuru_child", indent + 1);
  emit(context, indent, `} else if (${componentType} && typeof ${componentType}.mount === "function") {`);
  emit(context, indent + 1, "__mikuru_warn(\"Dynamic component hydration fallback; child component does not expose hydrate().\");");
  emit(context, indent + 1, `const __mikuru_parent = ${elementVar}.parentNode;`);
  emit(context, indent + 1, "const __mikuru_anchor = document.createComment(\"mikuru-hydrate-dynamic-component\");");
  emit(context, indent + 1, `__mikuru_parent?.insertBefore(__mikuru_anchor, ${elementVar});`);
  emit(context, indent + 1, `${elementVar}.remove();`);
  emit(context, indent + 1, "const __mikuru_fragment = document.createDocumentFragment();");
  emit(context, indent + 1, `const __mikuru_child = ${componentType}.mount(__mikuru_fragment, ${propsVar});`);
  emit(context, indent + 1, "__mikuru_parent?.insertBefore(__mikuru_fragment, __mikuru_anchor);");
  emit(context, indent + 1, "__mikuru_anchor.remove();");
  emit(context, indent + 1, `if (__mikuru_child?.unmount) __mikuru_cleanup.push(() => __mikuru_child.unmount());`);
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

  hydrateDynamicComponentAtIndex(context, child, parentVar, domIndex, indent);
}

function hydrateKeepAliveElement(context: HydrationContext, node: ElementNode, elementVar: string, indent: number): void {
  validateKeepAliveAttributes(node);
  const child = getSingleElementChild(node, "<KeepAlive>");
  const isAttr = getDynamicComponentIsAttr(child);

  if (child.tag !== "component" || !isAttr) {
    throw new Error("<KeepAlive> requires a single <component :is=\"...\" /> child in v1");
  }

  const componentTypeVar = nextName(context, "dynamicComponent");
  emit(context, indent, `const ${componentTypeVar} = unwrap(${compileHydrationExpression(context, requireAttrValue(isAttr), isAttr.name)});`);
  emit(context, indent, `if (${componentTypeVar}) {`);
  hydrateDynamicComponent(context, child, elementVar, componentTypeVar, indent + 1);
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
    hydrateTransitionIfChainAtIndex(context, children, parentVar, domIndex, indent);
    return;
  }

  hydrateFragmentChildrenAtIndex(context, [children[0]], parentVar, domIndex, indent);
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

function hydrateTransitionIfChainAtIndex(context: HydrationContext, children: ElementNode[], parentVar: string, domIndex: string, indent: number): void {
  children.forEach((child, index) => {
    if (index === 0) {
      emit(context, indent, `if (unwrap(${compileHydrationExpression(context, getAttrValue(child, "v-if"), "v-if")})) {`);
    } else if (getAttr(child, "v-else-if")) {
      emit(context, indent, `else if (unwrap(${compileHydrationExpression(context, getAttrValue(child, "v-else-if"), "v-else-if")})) {`);
    } else {
      emit(context, indent, "else {");
    }

    hydrateFragmentChildrenAtIndex(context, [withoutAttrs(child, ["v-if", "v-else-if", "v-else"])], parentVar, domIndex, indent + 1);
    emit(context, indent, "}");
  });
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
  hydrateFor(context, withoutAttrs(child, [":key", "v-bind:key"]), groupVar, groupIndexVar, indent + 1, groupIndexVar);
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
  hydrateFor(context, withoutAttrs(child, [":key", "v-bind:key"]), elementVar, groupIndexVar, indent, groupIndexVar);
  emit(context, indent, `if (${elementVar}.childNodes.length > ${groupIndexVar}) { __mikuru_warn("Extra DOM nodes after TransitionGroup hydration: " + Array.from(${elementVar}.childNodes).slice(${groupIndexVar}).map(__mikuru_describeNode).join(", ") + "."); }`);
}

function hydrateFragmentChildrenAtIndex(context: HydrationContext, rawChildren: TemplateNode[], parentVar: string, domIndex: string, indent: number): void {
  const children = rawChildren.filter(isHydratableNode);
  children.forEach((child) => {
    if (child.type === "element" && child.tag === "Teleport") {
      hydrateTeleportAtIndex(context, child, parentVar, domIndex, indent);
      return;
    }

    if (child.type === "element" && child.tag === "component") {
      hydrateDynamicComponentAtIndex(context, child, parentVar, domIndex, indent);
      return;
    }

    if (child.type === "element" && child.tag === "KeepAlive") {
      hydrateKeepAliveAtIndex(context, child, parentVar, domIndex, indent);
      return;
    }

    if (child.type === "element" && child.tag === "AsyncBoundary") {
      hydrateAsyncBoundaryAtIndex(context, child, parentVar, domIndex, indent);
      return;
    }

    if (child.type === "element" && child.tag === "ErrorBoundary") {
      hydrateErrorBoundaryAtIndex(context, child, parentVar, domIndex, indent);
      return;
    }

    if (child.type === "element" && child.tag === "TransitionGroup") {
      hydrateTransitionGroupAtIndex(context, child, parentVar, domIndex, indent);
      return;
    }

    if (child.type === "element" && child.tag === "Transition") {
      hydrateTransitionAtIndex(context, child, parentVar, domIndex, indent);
      return;
    }

    if (child.type === "element" && getAttr(child, "v-if") && !getAttr(child, "v-pre")) {
      hydrateIf(context, child, parentVar, domIndex, indent);
      emit(context, indent, `${domIndex} += 1;`);
      return;
    }

    if (child.type === "element" && getAttr(child, "v-for") && !getAttr(child, "v-pre")) {
      hydrateFor(context, child, parentVar, domIndex, indent, domIndex);
      return;
    }

    const childVar = nextName(context, "node");
    emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndex}];`);
    if (child.type === "element") {
      const elementCheck = isComponentTag(child.tag)
        ? `!${childVar} || ${childVar}.nodeType !== 1`
        : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(child.tag.toLowerCase())}`;
      emit(context, indent, `if (${elementCheck}) { __mikuru_recover(${quote(`Element mismatch: expected <${child.tag.toLowerCase()}>, got `)} + __mikuru_describeNode(${childVar})); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    } else {
      emit(context, indent, `if (!${childVar} || ${childVar}.nodeType !== 3) { __mikuru_recover("Text mismatch: expected text, got " + __mikuru_describeNode(${childVar})); } else {`);
      hydrateNode(context, child, childVar, indent + 1);
      emit(context, indent, "}");
    }
    emit(context, indent, `${domIndex} += 1;`);
  });
}

function hydrateComponentProps(context: HydrationContext, node: ElementNode, propsVar: string, indent: number): void {
  for (const attr of node.attrs) {
    const modelDirective = parseModelDirective(attr.name);
    if (modelDirective) {
      const expression = validateAssignableExpression(getAttrValueFromDirective(attr), attr.name, {
        source: context.source ?? String(attr.value),
        offset: attr.valueLoc?.offset ?? attr.loc?.offset ?? 0,
        filename: context.filename
      });
      const valueExpression = compileHydrationExpression(context, expression, attr.name);
      const propName = modelDirective.argument ?? "modelValue";
      const updatePropName = toComponentEventProp(`update:${propName}`);
      const modifiersPropName = modelDirective.argument ? `${propName}Modifiers` : "modelModifiers";
      emit(context, indent, `Object.defineProperty(${propsVar}, ${quote(propName)}, { enumerable: true, get() { return unwrap(${valueExpression}); } });`);
      emit(context, indent, `${propsVar}[${quote(updatePropName)}] = ($value) => { ${expression}.value = $value; };`);
      if (modelDirective.modifiers.length > 0) {
        emit(context, indent, `${propsVar}[${quote(modifiersPropName)}] = { ${modelDirective.modifiers.map((modifier) => `${quote(modifier)}: true`).join(", ")} };`);
      }
      continue;
    }

    const objectEvent = parseObjectOnDirective(attr.name);
    if (objectEvent && attr.value !== true) {
      validateObjectOnModifiers(objectEvent, attr, "component");
      const listenersVar = nextName(context, "listeners");
      const eventNameVar = nextName(context, "eventName");
      const handlerVar = nextName(context, "handler");
      const propNameVar = nextName(context, "propName");
      emit(context, indent, `{`);
      emit(context, indent + 1, `const ${listenersVar} = unwrap(${compileHydrationExpression(context, String(attr.value), attr.name)}) ?? {};`);
      emit(context, indent + 1, `if (${listenersVar} && typeof ${listenersVar} === "object") {`);
      emit(context, indent + 2, `for (const [${eventNameVar}, ${handlerVar}] of Object.entries(${listenersVar})) {`);
      emit(context, indent + 3, `const ${propNameVar} = ${componentEventPropRuntimeExpression(`String(${eventNameVar})`)};`);
      emit(context, indent + 3, `if (typeof ${handlerVar} === "function") { ${propsVar}[${propNameVar}] = ${handlerVar}; }`);
      emit(context, indent + 2, "}");
      emit(context, indent + 1, "}");
      emit(context, indent, `}`);
      continue;
    }

    const event = parseEventDirective(attr.name);
    if (event && attr.value !== true) {
      validateComponentEventModifiers(event, attr);
      const handlerExpression = `($value) => ${String(attr.value).trim()}($value)`;
      const propName = event.nameExpression
        ? componentEventPropRuntimeExpression(`String(unwrap(${compileHydrationExpression(context, event.nameExpression, attr.name)}) ?? "")`)
        : quote(toComponentEventProp(event.name ?? ""));
      emit(context, indent, `${propsVar}[${propName}] = ${componentEventHandlerExpression(event, handlerExpression, context)};`);
      continue;
    }

    if (shouldSkipAttr(attr)) {
      continue;
    }

    if (parseObjectBindDirective(attr.name) && attr.value !== true) {
      emit(context, indent, `Object.assign(${propsVar}, unwrap(${compileHydrationExpression(context, String(attr.value), attr.name)}) ?? {});`);
      continue;
    }

    const dynamicArgument = getDynamicAttrArgument(attr.name);
    if (dynamicArgument && attr.value !== true) {
      emit(context, indent, `${propsVar}[String(unwrap(${compileHydrationExpression(context, dynamicArgument.expression, attr.name)}) ?? "")] = unwrap(${compileHydrationExpression(context, String(attr.value), attr.name)});`);
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
      emit(context, indent, `__mikuru_cleanup.push(() => {`);
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
      emit(context, indent, "__mikuru_cleanup.push(effect(() => {");
      emit(context, indent + 1, `const ${nextEventVar} = String(unwrap(${expression}) ?? "");`);
      emit(context, indent + 1, `if (${nextEventVar} === ${currentEventVar}) return;`);
      emit(context, indent + 1, `if (${currentEventVar}) ${elementVar}.removeEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
      emit(context, indent + 1, `${currentEventVar} = ${nextEventVar};`);
      emit(context, indent + 1, `if (${currentEventVar}) ${elementVar}.addEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""});`);
      emit(context, indent, "}));");
      emit(context, indent, `__mikuru_cleanup.push(() => { if (${currentEventVar}) ${elementVar}.removeEventListener(${currentEventVar}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}); });`);
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
    emit(context, indent, `__mikuru_cleanup.push(() => ${elementVar}.removeEventListener(${quote(event.name)}, ${handlerVar}${eventOptions ? `, ${eventOptions}` : ""}));`);
  }
}

function emitHydrationEventHandler(context: HydrationContext, indent: number, elementVar: string, handlerVar: string, handlerExpression: string, event: EventDirective): void {
  const guard = eventModifierGuardExpression(event);
  const hasControl = event.modifiers.includes("prevent") || event.modifiers.includes("stop") || event.modifiers.includes("self") || guard;

  if (!hasControl) {
    emit(context, indent, `const ${handlerVar} = ($event) => ${handlerExpression}($event);`);
    return;
  }

  emit(context, indent, `const ${handlerVar} = ($event) => {`);
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
  emit(context, indent + 1, `return ${handlerExpression}($event);`);
  emit(context, indent, "};");
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
      emit(context, indent, "__mikuru_cleanup.push(effect(() => {");
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
      emit(context, indent, `__mikuru_cleanup.push(() => ${elementVar}.removeEventListener(${quote(eventName)}, ${handlerVar}));`);
      continue;
    }

    if (attr.name === "v-show") {
      emit(context, indent, `__mikuru_cleanup.push(effect(() => { ${elementVar}.style.display = unwrap(${compileHydrationExpression(context, getAttrValueFromDirective(attr), attr.name)}) ? "" : "none"; }));`);
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
  emit(context, indent, `__mikuru_cleanup.push(effect(() => { const __mikuru_content = String(unwrap(${expression}) ?? ""); if (${elementVar}.${property} !== __mikuru_content) { if (!${warnedVar}) { __mikuru_warn(${quote(`${attr.name} content mismatch: expected `)} + JSON.stringify(__mikuru_content) + ", got " + JSON.stringify(${elementVar}.${property} ?? "") + "."); ${warnedVar} = true; } ${elementVar}.${property} = __mikuru_content; } }));`);
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
  emit(context, indent, `__mikuru_cleanup.push(effect(() => { const __mikuru_text = ${expression || "\"\""}; if (${nodeVar}.textContent !== __mikuru_text) { if (!${warnedVar}) { __mikuru_warn("Text content mismatch: expected " + JSON.stringify(__mikuru_text) + ", got " + JSON.stringify(${nodeVar}.textContent ?? "") + "."); ${warnedVar} = true; } ${nodeVar}.textContent = __mikuru_text; } }));`);
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
  emit(context, indent, `__mikuru_cleanup.push(${cleanupRefVar});`);
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

function validateComponentEventModifiers(event: EventDirective, attr: TemplateAttribute): void {
  for (const modifier of event.modifiers) {
    if (modifier !== "once") {
      throw new Error(`Event modifier .${modifier} is only supported on DOM events: ${attr.name}`);
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

function componentEventHandlerExpression(event: EventDirective, handlerExpression: string, context: HydrationContext): string {
  if (!event.modifiers.includes("once")) {
    return handlerExpression;
  }

  const calledVar = nextName(context, "called");
  const handlerVar = nextName(context, "handler");
  return `(() => { let ${calledVar} = false; const ${handlerVar} = ${handlerExpression}; return (...$args) => { if (${calledVar}) { return; } ${calledVar} = true; return ${handlerVar}(...$args); }; })()`;
}

function componentEventPropRuntimeExpression(eventNameExpression: string): string {
  return `"on" + ${eventNameExpression}.split(/[-:]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("")`;
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

function toComponentEventProp(eventName: string): string {
  return `on${eventName.split(":").map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : "").join("")}`;
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

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
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
