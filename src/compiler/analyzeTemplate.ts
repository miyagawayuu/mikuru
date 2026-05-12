import type { Binding, ElementNode, TemplateAttribute, TemplateNode } from "./types.js";
import type { SourceLocation } from "./errors.js";
import { createCompileError } from "./errors.js";
import type { ExpressionLocationContext } from "./parseExpression.js";
import { parseForExpression, validateAssignableExpression, validateTemplateExpression } from "./parseExpression.js";

type AnalyzeTemplateOptions = {
  source?: string;
  filename?: string;
};

export function analyzeTemplate(root: ElementNode, options: AnalyzeTemplateOptions = {}): Binding[] {
  const bindings: Binding[] = [];
  visitNode(root, bindings, options, false);
  return bindings;
}

function visitNode(node: TemplateNode, bindings: Binding[], options: AnalyzeTemplateOptions, inPre: boolean): void {
  if (node.type === "text") {
    if (inPre) {
      return;
    }

    for (const part of node.parts) {
      if (part.type === "expression") {
        bindings.push({ type: "text", expression: part.value });
      }
    }

    return;
  }

  const pre = inPre || hasAttr(node, "v-pre");
  if (pre) {
    for (const child of node.children) {
      visitNode(child, bindings, options, true);
    }
    return;
  }

  rejectUnsupportedNodeFeatures(node, options);

  for (const attr of node.attrs) {
    rejectUnsupportedAttribute(node, attr, options);

    if (attr.name === "v-model") {
      bindings.push({
        type: "model",
        expression: validateAssignableExpression(
          requireStringValue(attr.name, attr.value),
          attr.name,
          toExpressionContext(attr.valueLoc, options)
        )
      });
      continue;
    }

    const event = parseEventDirective(attr.name);

    if (event) {
      if (event.nameExpression) {
        bindings.push({
          type: "attribute",
          name: "event",
          expression: validateTemplateExpression(event.nameExpression, attr.name, toExpressionContext(attr.loc, options))
        });
      }
      bindings.push({
        type: "event",
        event: event.name ?? "dynamic",
        handler: requireEventHandlerValue(attr.name, attr.value),
        modifiers: event.modifiers.length ? event.modifiers : undefined
      });
      continue;
    }

    const dynamicBinding = getDynamicBindingArgument(attr.name);

    if (dynamicBinding) {
      bindings.push({
        type: "attribute",
        name: "name",
        expression: validateTemplateExpression(dynamicBinding.expression, attr.name, toExpressionContext(attr.loc, options))
      });
      bindings.push({
        type: "attribute",
        name: "value",
        expression: validateTemplateExpression(
          requireStringValue(attr.name, attr.value),
          attr.name,
          toExpressionContext(attr.valueLoc, options)
        )
      });
      continue;
    }

    const bindingName = getBindingName(attr.name);

    if (bindingName) {
      bindings.push({
        type: "attribute",
        name: bindingName,
        expression: validateTemplateExpression(
          requireStringValue(attr.name, attr.value),
          attr.name,
          toExpressionContext(attr.valueLoc, options)
        )
      });
      continue;
    }

    if (attr.name === "v-if") {
      bindings.push({
        type: "if",
        expression: validateTemplateExpression(
          requireStringValue(attr.name, attr.value),
          attr.name,
          toExpressionContext(attr.valueLoc, options)
        )
      });
      continue;
    }

    if (attr.name === "v-else-if") {
      bindings.push({
        type: "else-if",
        expression: validateTemplateExpression(
          requireStringValue(attr.name, attr.value),
          attr.name,
          toExpressionContext(attr.valueLoc, options)
        )
      });
      continue;
    }

    if (attr.name === "v-else") {
      if (attr.value !== true) {
        requireStringValue(attr.name, attr.value);
      }

      bindings.push({ type: "else" });
      continue;
    }

    if (attr.name === "v-show") {
      bindings.push({
        type: "show",
        expression: validateTemplateExpression(
          requireStringValue(attr.name, attr.value),
          attr.name,
          toExpressionContext(attr.valueLoc, options)
        )
      });
      continue;
    }

    if (attr.name === "v-html" || attr.name === "v-text") {
      bindings.push({
        type: "attribute",
        name: attr.name === "v-html" ? "html" : "text",
        expression: validateTemplateExpression(
          requireStringValue(attr.name, attr.value),
          attr.name,
          toExpressionContext(attr.valueLoc, options)
        )
      });
      continue;
    }

    if (attr.name === "v-for") {
      bindings.push(parseForBinding(requireStringValue(attr.name, attr.value), toExpressionContext(attr.valueLoc, options)));
    }
  }

  for (const child of node.children) {
    visitNode(child, bindings, options, false);
  }
}

function hasAttr(node: ElementNode, name: string): boolean {
  return node.attrs.some((attr) => attr.name === name);
}

function rejectUnsupportedNodeFeatures(node: ElementNode, options: AnalyzeTemplateOptions): void {
}

function rejectUnsupportedAttribute(node: ElementNode, attr: TemplateAttribute, options: AnalyzeTemplateOptions): void {
  if ((attr.name === "v-slot" || attr.name.startsWith("v-slot:") || attr.name.startsWith("#")) && node.tag !== "template") {
    throwTemplateError(
      "v-slot must be used on a <template> child in Mikuru. Wrap slot content in <template #name>...</template>.",
      attr.loc,
      options
    );
  }
}

function parseForBinding(expression: string, context?: ExpressionLocationContext): Binding {
  const parsed = parseForExpression(expression, context);

  return {
    type: "for",
    item: parsed.item,
    index: parsed.index,
    source: parsed.source
  };
}

function toExpressionContext(
  location: SourceLocation | undefined,
  options: AnalyzeTemplateOptions
): ExpressionLocationContext | undefined {
  if (!location || !options.source) {
    return undefined;
  }

  return {
    source: options.source,
    offset: location.offset,
    filename: options.filename
  };
}

function requireStringValue(name: string, value: string | true): string {
  if (value === true) {
    throw new Error(`Directive ${name} requires a value`);
  }

  return value;
}

function requireEventHandlerValue(name: string, value: string | true): string {
  const source = requireStringValue(name, value).trim().replace(/;\s*$/, "");

  if (!source) {
    throw new Error(`Directive ${name} requires a value`);
  }

  return source;
}

function throwTemplateError(message: string, location: SourceLocation | undefined, options: AnalyzeTemplateOptions): never {
  if (options.source && location) {
    throw createCompileError(message, options.source, location.offset, options.filename);
  }

  throw new Error(message);
}

function parseEventDirective(name: string): { name?: string; nameExpression?: string; modifiers: string[] } | undefined {
  const dynamic = getDynamicEventArgument(name);
  if (dynamic) {
    return dynamic;
  }

  const rawName = getEventName(name);

  if (!rawName) {
    return undefined;
  }

  const [eventName, ...modifiers] = rawName.split(".");
  return { name: eventName, modifiers };
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
  const binding = parseBindingDirective(name);
  if (!binding || "expression" in binding) {
    return undefined;
  }

  return binding.name;
}

function getDynamicBindingArgument(name: string): { expression: string } | undefined {
  const binding = parseBindingDirective(name);
  if (!binding || !("expression" in binding)) {
    return undefined;
  }
  return { expression: binding.expression };
}

function parseBindingDirective(name: string): { name: string } | { expression: string } | undefined {
  const dynamic = parseDynamicArgument(name, [":", "v-bind:"]);
  if (dynamic) {
    return { expression: dynamic.expression };
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

  return { name: modifiers.includes("camel") ? bindingName.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()) : bindingName };
}

function getDynamicEventArgument(name: string): { nameExpression: string; modifiers: string[] } | undefined {
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
