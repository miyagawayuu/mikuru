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
  emit(context, 1, `if (!__mikuru_root || __mikuru_root.tagName?.toLowerCase() !== ${quote(root.tag.toLowerCase())}) { __mikuru_warn("Root mismatch; falling back to mount()."); if (__mikuru_previousRegistrar === undefined) { delete globalThis.__mikuru_currentRegistrar; } else { globalThis.__mikuru_currentRegistrar = __mikuru_previousRegistrar; } return mount(target, props); }`);
  hydrateElement(context, root, "__mikuru_root", 1);
  emit(context, 1, "for (const cb of __mikuru_mounted.splice(0)) { __mikuru_try(cb); }");
  emit(context, 1, "if (__mikuru_previousRegistrar === undefined) { delete globalThis.__mikuru_currentRegistrar; } else { globalThis.__mikuru_currentRegistrar = __mikuru_previousRegistrar; }");
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

  if (isComponentTag(node.tag)) {
    hydrateComponent(context, node, elementVar, indent);
    return;
  }

  hydrateAttrs(context, node, elementVar, indent);
  hydrateEvents(context, node, elementVar, indent);
  hydrateModelAndShow(context, node, elementVar, indent);
  hydrateContentDirective(context, node, elementVar, indent);
  hydrateTemplateRef(context, node, elementVar, indent);
  if (!getContentDirectiveAttr(node)) {
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
  const elementCheck = isComponentTag(node.tag)
    ? `!${childVar} || ${childVar}.nodeType !== 1`
    : `!${childVar} || ${childVar}.nodeType !== 1 || ${childVar}.tagName?.toLowerCase() !== ${quote(node.tag.toLowerCase())}`;
  emit(context, indent, `const ${childVar} = ${parentVar}.childNodes[${domIndex}];`);
  emit(context, indent, `if (unwrap(${compileHydrationExpression(context, condition, "v-if")})) {`);
  emit(context, indent + 1, `if (${elementCheck}) { __mikuru_warn("Branch mismatch; dynamic v-if hydration will remount in a future phase."); } else {`);
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
  emit(context, indent + 1, `if (${elementCheck}) { __mikuru_warn("List mismatch; dynamic v-for hydration will remount in a future phase."); } else {`);
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
  for (const attr of node.attrs) {
    if (attr.name === "v-cloak") {
      emit(context, indent, `${elementVar}.removeAttribute("v-cloak");`);
      continue;
    }

    if (shouldSkipAttr(attr)) {
      continue;
    }

    const dynamicName = getDynamicAttrName(attr.name);
    if (dynamicName) {
      const expression = compileHydrationExpression(context, String(attr.value), attr.name);
      const valueExpression =
        dynamicName === "class" && staticClass
          ? `[${quote(staticClass)}, unwrap(${expression})]`
          : dynamicName === "style" && staticStyle
            ? `[${quote(staticStyle)}, unwrap(${expression})]`
            : `unwrap(${expression})`;
      emit(context, indent, `__mikuru_cleanup.push(effect(() => setAttribute(${elementVar}, ${quote(dynamicName)}, ${valueExpression})));`);
      continue;
    }

    if (attr.name === "v-bind") {
      const prevKeysVar = nextName(context, "attrsPrevKeys");
      const nextKeysVar = nextName(context, "attrsNextKeys");
      const attrsVar = nextName(context, "attrs");
      const keyVar = nextName(context, "key");
      const valueVar = nextName(context, "value");
      const staleKeyVar = nextName(context, "staleKey");
      emit(context, indent, `const ${prevKeysVar} = new Set();`);
      emit(context, indent, "__mikuru_cleanup.push(effect(() => {");
      emit(context, indent + 1, `const ${attrsVar} = unwrap(${compileHydrationExpression(context, String(attr.value), "v-bind")}) ?? {};`);
      emit(context, indent + 1, `const ${nextKeysVar} = new Set();`);
      emit(context, indent + 1, `if (${attrsVar} && typeof ${attrsVar} === "object") {`);
      emit(context, indent + 2, `for (const [${keyVar}, ${valueVar}] of Object.entries(${attrsVar})) {`);
      emit(context, indent + 3, `${nextKeysVar}.add(${keyVar});`);
      if (staticClass || staticStyle) {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${keyVar}, ${keyVar} === "class" && ${staticClass ? "true" : "false"} ? [${quote(staticClass ?? "")}, unwrap(${valueVar})] : ${keyVar} === "style" && ${staticStyle ? "true" : "false"} ? [${quote(staticStyle ?? "")}, unwrap(${valueVar})] : unwrap(${valueVar}));`);
      } else {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${keyVar}, unwrap(${valueVar}));`);
      }
      emit(context, indent + 2, "}");
      emit(context, indent + 1, "}");
      emit(context, indent + 1, `for (const ${staleKeyVar} of ${prevKeysVar}) {`);
      emit(context, indent + 2, `if (!${nextKeysVar}.has(${staleKeyVar})) {`);
      if (staticClass || staticStyle) {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, ${staleKeyVar} === "class" && ${staticClass ? "true" : "false"} ? ${quote(staticClass ?? "")} : ${staleKeyVar} === "style" && ${staticStyle ? "true" : "false"} ? ${quote(staticStyle ?? "")} : null);`);
      } else {
        emit(context, indent + 3, `setAttribute(${elementVar}, ${staleKeyVar}, null);`);
      }
      emit(context, indent + 2, "}");
      emit(context, indent + 1, "}");
      emit(context, indent + 1, `${prevKeysVar}.clear();`);
      emit(context, indent + 1, `for (const ${keyVar} of ${nextKeysVar}) { ${prevKeysVar}.add(${keyVar}); }`);
      emit(context, indent, "}));");
      continue;
    }

    emit(context, indent, `setAttribute(${elementVar}, ${quote(attr.name)}, ${attr.value === true ? "true" : quote(attr.value)});`);
  }
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
  emit(context, indent + 1, `__mikuru_warn(${quote(`Component mismatch at <${node.tag}>.`)});`);
  emit(context, indent, "}");
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
              ? `Array.from(${elementVar}.options).forEach((option) => { option.selected = (unwrap(${expression}) ?? []).map(String).includes(option.getAttribute("value") ?? option.textContent ?? ""); })`
              : `String(unwrap(${expression}) ?? "")`;
      const assignedValue = modelAssignedValue(modelMode, modelDirective.modifiers, expression);

      emit(context, indent, "__mikuru_cleanup.push(effect(() => {");
      if (modelMode === "select-multiple") {
        emit(context, indent + 1, renderedValue);
      } else {
        emit(context, indent + 1, `if (${elementVar}.${propertyName} !== ${renderedValue}) {`);
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
  emit(context, indent, `__mikuru_cleanup.push(effect(() => { const __mikuru_content = String(unwrap(${expression}) ?? ""); if (${elementVar}.${property} !== __mikuru_content) ${elementVar}.${property} = __mikuru_content; }));`);
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

function modelElementValueExpression(targetExpression: string, modifiers: string[]): string {
  const raw = `(${targetExpression}.getAttribute("value") ?? ${targetExpression}.value ?? "")`;
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
    const raw = `Array.from($event.target.selectedOptions).map((option) => option.getAttribute("value") ?? option.textContent ?? "")`;
    return modifiers.includes("number") ? `${raw}.map(Number)` : raw;
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
