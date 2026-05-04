import { parseExpressionAt } from "acorn";
import type { Node } from "acorn";
import { createCompileError } from "./errors.js";

export type ExpressionLocationContext = {
  source: string;
  offset: number;
  filename?: string;
};

export type ForExpression = {
  item: string;
  index?: string;
  source: string;
};

type TemplateExpressionNode = Node & Record<string, unknown>;
type ExpressionEdit = {
  start: number;
  end: number;
  replacement: string;
};

const identifierPattern = /^[A-Za-z_$][\w$]*$/;
const forbiddenCallNames = new Set(["eval", "Function"]);
const forbiddenMemberNames = new Set(["constructor", "__proto__", "prototype"]);

export function validateTemplateExpression(expression: string, usage: string, context?: ExpressionLocationContext): string {
  const source = expression.trim();

  if (!source) {
    throwExpressionError(`Invalid template expression for ${usage}: expression is empty`, context);
  }

  let ast: TemplateExpressionNode;

  try {
    ast = parseExpressionAt(source, 0, { ecmaVersion: "latest" }) as TemplateExpressionNode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throwExpressionError(`Invalid template expression for ${usage}: ${source} (${message})`, context);
  }

  if (ast.end !== source.length) {
    throwExpressionError(`Invalid template expression for ${usage}: ${source}`, context);
  }

  validateNode(ast, usage, source, context);
  return source;
}

export function compileTemplateExpression(expression: string, usage: string, context?: ExpressionLocationContext): string {
  const source = validateTemplateExpression(expression, usage, context);
  const ast = parseExpressionAt(source, 0, { ecmaVersion: "latest" }) as TemplateExpressionNode;
  const edits: ExpressionEdit[] = [];

  collectIdentifierUnwraps(ast, source, edits);
  return applyExpressionEdits(source, edits);
}

export function validateAssignableExpression(expression: string, usage: string, context?: ExpressionLocationContext): string {
  const source = validateTemplateExpression(expression, usage, context);
  const ast = parseExpressionAt(source, 0, { ecmaVersion: "latest" }) as TemplateExpressionNode;

  if (ast.type !== "Identifier" && ast.type !== "MemberExpression") {
    throwExpressionError(`Unsupported template expression for ${usage}: ${source} (${ast.type})`, context);
  }

  return source;
}

export function parseForExpression(expression: string, context?: ExpressionLocationContext): ForExpression {
  const source = expression.trim();
  const match = /^(?:([A-Za-z_$][\w$]*)|\(\s*([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*\))\s+(?:in|of)\s+(.+)$/.exec(source);

  if (!match) {
    throwExpressionError(`Invalid v-for expression: ${expression}`, context);
  }

  const item = match[1] ?? match[2];
  const index = match[3];
  const sourceExpression = match[4];

  return {
    item,
    index,
    source: validateTemplateExpression(
      sourceExpression,
      "v-for source",
      context ? { ...context, offset: context.offset + source.indexOf(sourceExpression) } : undefined
    )
  };
}

function validateNode(
  node: TemplateExpressionNode,
  usage: string,
  source: string,
  context: ExpressionLocationContext | undefined
): void {
  switch (node.type) {
    case "Identifier":
    case "Literal":
    case "TemplateElement":
      return;

    case "ThisExpression":
      throwUnsupported(node, usage, source, context);

    case "ArrayExpression":
      for (const element of node.elements as Array<TemplateExpressionNode | null>) {
        if (element) {
          validateNode(element, usage, source, context);
        }
      }
      return;

    case "ObjectExpression":
      for (const property of node.properties as TemplateExpressionNode[]) {
        validateNode(property, usage, source, context);
      }
      return;

    case "Property":
      validateProperty(node, usage, source, context);
      return;

    case "MemberExpression":
      validateMemberExpression(node, usage, source, context);
      return;

    case "ChainExpression":
      validateNode(node.expression as TemplateExpressionNode, usage, source, context);
      return;

    case "CallExpression":
      validateCallExpression(node, usage, source, context);
      return;

    case "UnaryExpression":
      validateNode(node.argument as TemplateExpressionNode, usage, source, context);
      return;

    case "BinaryExpression":
    case "LogicalExpression":
      validateNode(node.left as TemplateExpressionNode, usage, source, context);
      validateNode(node.right as TemplateExpressionNode, usage, source, context);
      return;

    case "ConditionalExpression":
      validateNode(node.test as TemplateExpressionNode, usage, source, context);
      validateNode(node.consequent as TemplateExpressionNode, usage, source, context);
      validateNode(node.alternate as TemplateExpressionNode, usage, source, context);
      return;

    case "TemplateLiteral":
      for (const quasi of node.quasis as TemplateExpressionNode[]) {
        validateNode(quasi, usage, source, context);
      }

      for (const expression of node.expressions as TemplateExpressionNode[]) {
        validateNode(expression, usage, source, context);
      }
      return;

    default:
      throwUnsupported(node, usage, source, context);
  }
}

function validateProperty(
  node: TemplateExpressionNode,
  usage: string,
  source: string,
  context: ExpressionLocationContext | undefined
): void {
  const key = node.key as TemplateExpressionNode;
  const value = node.value as TemplateExpressionNode;

  if (node.computed) {
    validateNode(key, usage, source, context);
  }

  validateNode(value, usage, source, context);
}

function validateMemberExpression(
  node: TemplateExpressionNode,
  usage: string,
  source: string,
  context: ExpressionLocationContext | undefined
): void {
  validateNode(node.object as TemplateExpressionNode, usage, source, context);

  if (node.computed) {
    validateNode(node.property as TemplateExpressionNode, usage, source, context);
    return;
  }

  const propertyName = getStaticPropertyName(node.property as TemplateExpressionNode);

  if (propertyName && forbiddenMemberNames.has(propertyName)) {
    throwUnsupported(node, usage, source, context);
  }
}

function validateCallExpression(
  node: TemplateExpressionNode,
  usage: string,
  source: string,
  context: ExpressionLocationContext | undefined
): void {
  const callee = node.callee as TemplateExpressionNode;
  const calleeName = getStaticCalleeName(callee);

  if (calleeName && forbiddenCallNames.has(calleeName)) {
    throwUnsupported(node, usage, source, context);
  }

  validateNode(callee, usage, source, context);

  for (const argument of node.arguments as TemplateExpressionNode[]) {
    validateNode(argument, usage, source, context);
  }
}

function collectIdentifierUnwraps(node: TemplateExpressionNode | null | undefined, source: string, edits: ExpressionEdit[]): void {
  if (!node) {
    return;
  }

  switch (node.type) {
    case "Identifier":
      edits.push({
        start: node.start,
        end: node.end,
        replacement: `unwrap(${source.slice(node.start, node.end)})`
      });
      return;

    case "Literal":
    case "TemplateElement":
    case "ThisExpression":
      return;

    case "ArrayExpression":
      for (const element of node.elements as Array<TemplateExpressionNode | null>) {
        collectIdentifierUnwraps(element, source, edits);
      }
      return;

    case "ObjectExpression":
      for (const property of node.properties as TemplateExpressionNode[]) {
        collectIdentifierUnwraps(property, source, edits);
      }
      return;

    case "Property":
      collectPropertyIdentifierUnwraps(node, source, edits);
      return;

    case "MemberExpression":
      collectMemberIdentifierUnwraps(node, source, edits);
      return;

    case "ChainExpression":
      collectIdentifierUnwraps(node.expression as TemplateExpressionNode, source, edits);
      return;

    case "CallExpression":
      collectIdentifierUnwraps(node.callee as TemplateExpressionNode, source, edits);

      for (const argument of node.arguments as TemplateExpressionNode[]) {
        collectIdentifierUnwraps(argument, source, edits);
      }
      return;

    case "UnaryExpression":
      collectIdentifierUnwraps(node.argument as TemplateExpressionNode, source, edits);
      return;

    case "BinaryExpression":
    case "LogicalExpression":
      collectIdentifierUnwraps(node.left as TemplateExpressionNode, source, edits);
      collectIdentifierUnwraps(node.right as TemplateExpressionNode, source, edits);
      return;

    case "ConditionalExpression":
      collectIdentifierUnwraps(node.test as TemplateExpressionNode, source, edits);
      collectIdentifierUnwraps(node.consequent as TemplateExpressionNode, source, edits);
      collectIdentifierUnwraps(node.alternate as TemplateExpressionNode, source, edits);
      return;

    case "TemplateLiteral":
      for (const expression of node.expressions as TemplateExpressionNode[]) {
        collectIdentifierUnwraps(expression, source, edits);
      }
      return;

    default:
      return;
  }
}

function collectPropertyIdentifierUnwraps(node: TemplateExpressionNode, source: string, edits: ExpressionEdit[]): void {
  const key = node.key as TemplateExpressionNode;
  const value = node.value as TemplateExpressionNode;

  if (node.computed) {
    collectIdentifierUnwraps(key, source, edits);
  }

  if (node.shorthand && key.type === "Identifier") {
    const name = source.slice(key.start, key.end);
    edits.push({
      start: node.start,
      end: node.end,
      replacement: `${name}: unwrap(${name})`
    });
    return;
  }

  collectIdentifierUnwraps(value, source, edits);
}

function collectMemberIdentifierUnwraps(node: TemplateExpressionNode, source: string, edits: ExpressionEdit[]): void {
  const object = node.object as TemplateExpressionNode;
  const property = node.property as TemplateExpressionNode;

  if (!node.computed && getStaticPropertyName(property) === "value") {
    return;
  }

  collectIdentifierUnwraps(object, source, edits);

  if (node.computed) {
    collectIdentifierUnwraps(property, source, edits);
  }
}

function applyExpressionEdits(source: string, edits: ExpressionEdit[]): string {
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  let output = "";
  let cursor = 0;

  for (const edit of ordered) {
    if (edit.start < cursor) {
      continue;
    }

    output += source.slice(cursor, edit.start);
    output += edit.replacement;
    cursor = edit.end;
  }

  output += source.slice(cursor);
  return output;
}

function getStaticCalleeName(node: TemplateExpressionNode): string | undefined {
  if (node.type === "Identifier") {
    return node.name as string;
  }

  if (node.type === "MemberExpression" && !node.computed) {
    return getStaticPropertyName(node.property as TemplateExpressionNode);
  }

  return undefined;
}

function getStaticPropertyName(node: TemplateExpressionNode): string | undefined {
  if (node.type !== "Identifier") {
    return undefined;
  }

  const name = node.name as string;
  return identifierPattern.test(name) ? name : undefined;
}

function throwUnsupported(
  node: TemplateExpressionNode,
  usage: string,
  source: string,
  context: ExpressionLocationContext | undefined
): never {
  throwExpressionError(`Unsupported template expression for ${usage}: ${source} (${node.type})`, context, node.start);
}

function throwExpressionError(message: string, context?: ExpressionLocationContext, relativeOffset = 0): never {
  if (context) {
    throw createCompileError(message, context.source, context.offset + relativeOffset, context.filename);
  }

  throw new Error(message);
}
