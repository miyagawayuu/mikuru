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
};

type ScriptParts = {
  imports: string[];
  body: string;
  usesPropsAlias: boolean;
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
  elements?: Array<ScriptNode | null>;
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

  emit(context, 0, `import { computed, effect, ref, setAttribute, unwrap } from "mikuru/runtime";`);
  emit(context, 0, "");
  emit(context, 0, "export function mount(target, props = {}) {");
  emit(context, 1, "const __mikuru_cleanup = [];");
  emit(context, 1, "const __mikuru_afterUnmount = [];");
  emit(context, 1, "const __mikuru_mounted = [];");
  emit(context, 1, "const __mikuru_runCleanup = (cleanups) => {");
  emit(context, 2, "for (const cleanup of cleanups.splice(0).reverse()) {");
  emit(context, 3, "cleanup();");
  emit(context, 2, "}");
  emit(context, 1, "};");
  emit(context, 1, "// expose a lightweight registrar for runtime lifecycle helpers (onMounted, onBeforeUnmount, onUnmounted, watch)");
  emit(context, 1, "globalThis.__mikuru_currentRegistrar = {");
  emit(context, 2, "registerMounted: (fn) => __mikuru_mounted.push(fn),");
  emit(context, 2, "registerBeforeUnmount: (fn) => __mikuru_cleanup.push(fn),");
  emit(context, 2, "registerUnmounted: (fn) => __mikuru_afterUnmount.push(fn),");
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
  emit(context, 1, "delete globalThis.__mikuru_currentRegistrar;");
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
  emit(context, 0, "const __mikuru_component = { mount };");
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
    return generateSlot(context, parentVar, cleanupVar, indent, beforeVar);
  }

  return generateElement(context, node, parentVar, cleanupVar, indent, beforeVar);
}

function generateSlot(
  context: GenerateContext,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  const slotVar = nextVar(context, "slot");
  const slotCleanupVar = nextVar(context, "slotCleanup");
  emit(context, indent, `const ${slotVar} = document.createDocumentFragment();`);
  emit(context, indent, `const ${slotCleanupVar} = props.children ? props.children(${slotVar}) : undefined;`);
  emit(context, indent, `${cleanupVar}.push(() => {`);
  emit(context, indent + 1, `if (${slotCleanupVar}) {`);
  emit(context, indent + 2, `${slotCleanupVar}();`);
  emit(context, indent + 1, "}");
  emit(context, indent, "});");
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
  const propsVar = nextVar(context, "props");
  const componentVar = nextVar(context, "component");
  emit(context, indent, `const ${fragmentVar} = document.createDocumentFragment();`);
  emitComponentProps(context, node, propsVar, indent);
  emit(context, indent, `const ${componentVar} = ${node.tag}.mount(${fragmentVar}, ${propsVar});`);
  if (context.scopeAttr) {
    emit(context, indent, `if (${componentVar}.element instanceof Element) {`);
    emit(context, indent + 1, `${componentVar}.element.setAttribute(${quote(context.scopeAttr)}, "");`);
    emit(context, indent, "}");
  }
  emit(context, indent, `${cleanupVar}.push(() => ${componentVar}.unmount());`);
  appendNode(context, parentVar, fragmentVar, indent, beforeVar);
  return `${componentVar}.element`;
}

function generateElement(
  context: GenerateContext,
  node: ElementNode,
  parentVar: string,
  cleanupVar: string,
  indent: number,
  beforeVar?: string
): string {
  validateAttributes(node);

  const elementVar = nextVar(context, "el");
  emit(context, indent, `const ${elementVar} = document.createElement(${quote(node.tag)});`);

  if (context.scopeAttr) {
    emit(context, indent, `${elementVar}.setAttribute(${quote(context.scopeAttr)}, "");`);
  }

  for (const attr of node.attrs) {
    if (isDirectiveAttr(attr)) {
      continue;
    }

    emit(context, indent, `setAttribute(${elementVar}, ${quote(attr.name)}, ${quote(attr.value === true ? "" : attr.value)});`);
  }

  for (const attr of node.attrs) {
    if (attr.name === "v-model") {
      const expression = validateAssignableExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
      const stopVar = nextVar(context, "stop");
      const handlerVar = nextVar(context, "handler");
      const inputType = getStaticAttrValue(node, "type")?.toLowerCase();
      const modelMode = node.tag === "input" && inputType === "checkbox" ? "checkbox" : node.tag === "select" ? "select" : "text";
      const eventName = modelMode === "text" ? "input" : "change";
      const propertyName = modelMode === "checkbox" ? "checked" : "value";
      const renderedValue =
        modelMode === "checkbox" ? `Boolean(unwrap(${expression}))` : `String(unwrap(${expression}) ?? "")`;
      const assignedValue = modelMode === "checkbox" ? `$event.target.checked` : `$event.target.value`;

      emit(context, indent, `const ${stopVar} = effect(() => {`);
      emit(context, indent + 1, `if (${elementVar}.${propertyName} !== ${renderedValue}) {`);
      emit(context, indent + 2, `${elementVar}.${propertyName} = ${renderedValue};`);
      emit(context, indent + 1, "}");
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

      emit(context, indent, `${elementVar}.addEventListener(${quote(event.name)}, ${handlerVar});`);
      emit(context, indent, `${cleanupVar}.push(() => ${elementVar}.removeEventListener(${quote(event.name)}, ${handlerVar}));`);
      continue;
    }

    const bindingName = getBindingName(attr.name);

    if (bindingName) {
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

  generateChildren(context, node.children, elementVar, cleanupVar, indent);

  appendNode(context, parentVar, elementVar, indent, beforeVar);
  return elementVar;
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
    generateNode(context, withoutForAttrs(node), parentVar, branchCleanupVar, indent + 2, endVar);
    emit(context, indent + 1, "}");
  } else {
    emit(context, indent + 1, `for (const ${itemName} of unwrap(${compileTemplateExpression(sourceExpression, "v-for source", toExpressionContext(context, getStringAttrLocation(node, "v-for")))}) ?? []) {`);
    generateNode(context, withoutForAttrs(node), parentVar, branchCleanupVar, indent + 2, endVar);
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

  const elementVar = generateNode(context, withoutForAttrs(node), parentVar, recordCleanupVar, indent + 4, endVar);
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
  const edits: ScriptEdit[] = [];
  const transformedMacroStarts = new Set<number>();
  const emitsDeclarations: EmitsDeclaration[] = [];
  let usesPropsAlias = false;
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
        continue;
      }

      imports.push(script.slice(statement.start, statement.end).trim());
      continue;
    }

    if (statement.type !== "VariableDeclaration") {
      continue;
    }

    const macroDeclarations = (statement.declarations ?? []).filter(
      (declaration) => isMacroCall(declaration.init, "defineProps") || isMacroCall(declaration.init, "defineEmits")
    );

    if (macroDeclarations.length > 0 && (statement.declarations ?? []).length !== 1) {
      throwUnsupportedMacro(
        "defineProps() and defineEmits() cannot share a variable declaration with other bindings",
        macroDeclarations[0],
        descriptor
      );
    }

    if (macroDeclarations.length > 0 && statement.kind !== "const") {
      throwUnsupportedMacro("defineProps() and defineEmits() must use const declarations", macroDeclarations[0], descriptor);
    }

    for (const declaration of statement.declarations ?? []) {
      if (!isMacroCall(declaration.init, "defineProps") && !isMacroCall(declaration.init, "defineEmits")) {
        continue;
      }

      if (isMacroCall(declaration.init, "defineProps")) {
        const replacement = transformDefinePropsDeclaration(declaration, script, descriptor);
        edits.push({ start: statement.start, end: statement.end, replacement });
        transformedMacroStarts.add(declaration.init?.start ?? declaration.start);
        usesPropsAlias = usesPropsAlias || replacement.includes("__mikuru_props");
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
    body,
    usesPropsAlias,
    usesEmitAlias
  };
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

function isMacroCall(node: ScriptNode | null | undefined, name: "defineProps" | "defineEmits"): boolean {
  return node?.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === name;
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
      (candidate.callee.name === "defineProps" || candidate.callee.name === "defineEmits") &&
      !transformedMacroStarts.has(candidate.start)
    ) {
      throwUnsupportedMacro(
        "defineProps() and defineEmits() must be used in top-level const declarations",
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

function emitComponentProps(context: GenerateContext, node: ElementNode, propsVar: string, indent: number): void {
  const props = node.attrs
    .filter((attr) => !isStructuralAttr(attr))
    .flatMap((attr) => componentPropEntries(context, attr));
  const hasChildren = hasMeaningfulChildren(node);

  emit(context, indent, `const ${propsVar} = {`);

  for (const prop of props) {
    emit(context, indent + 1, `${prop},`);
  }

  if (hasChildren) {
    const slotTargetVar = nextVar(context, "slotTarget");
    const slotCleanupVar = nextVar(context, "slotCleanup");
    emit(context, indent + 1, `children(${slotTargetVar}) {`);
    emit(context, indent + 2, `const ${slotCleanupVar} = [];`);
    generateChildren(context, node.children, slotTargetVar, slotCleanupVar, indent + 2);

    emit(context, indent + 2, `return () => __mikuru_runCleanup(${slotCleanupVar});`);
    emit(context, indent + 1, "},");
  }

  emit(context, indent, "};");
}

function componentPropEntries(context: GenerateContext, attr: TemplateAttribute): string[] {
  if (attr.name === "v-model") {
    const expression = validateAssignableExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    const valueExpression = compileTemplateExpression(expression, attr.name, toExpressionContext(context, attr.valueLoc));

    return [
      `get modelValue() { return unwrap(${valueExpression}); }`,
      `onUpdateModelValue: ($value) => { ${expression}.value = $value; }`
    ];
  }

  const event = parseEventDirective(attr.name);

  if (event) {
    if (event.modifiers.length) {
      throwTemplateError("Event modifiers are not supported on component events yet", context, attr.loc);
    }

    const handler = validateTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    return [`${quotePropertyName(toComponentEventProp(event.name))}: ${eventHandlerExpression(handler, context, attr.valueLoc)}`];
  }

  const bindingName = getBindingName(attr.name);

  if (bindingName) {
    const expression = compileTemplateExpression(requireAttrValue(attr), attr.name, toExpressionContext(context, attr.valueLoc));
    return [`get ${quotePropertyName(bindingName)}() { return unwrap(${expression}); }`];
  }

  if (attr.name === "v-show") {
    throwTemplateError(`Unsupported component directive ${attr.name}`, context, attr.loc);
  }

  return [`${quotePropertyName(attr.name)}: ${quote(attr.value === true ? true : attr.value)}`];
}

function hasMeaningfulChildren(node: ElementNode): boolean {
  return node.children.some((child) => child.type === "element" || child.parts.some((part) => part.value.trim()));
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

function isSupportedDirectiveAttr(attr: TemplateAttribute): boolean {
  return (
    attr.name === "v-if" ||
    attr.name === "v-else-if" ||
    attr.name === "v-else" ||
    attr.name === "v-for" ||
    attr.name === "v-show" ||
    attr.name === "v-model" ||
    Boolean(parseEventDirective(attr.name)) ||
    Boolean(getBindingName(attr.name))
  );
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

function validateEventModifiers(event: EventDirective, attr: TemplateAttribute, context: GenerateContext): void {
  for (const modifier of event.modifiers) {
    if (modifier !== "prevent" && modifier !== "stop") {
      throwTemplateError(`Unsupported event modifier .${modifier}`, context, attr.loc);
    }
  }
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
