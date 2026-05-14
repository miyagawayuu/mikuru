import type { ElementNode, TemplateAttribute, TemplateNode } from "./types.js";
import { emitDebugDiagnostic } from "../runtime/devtools.js";

type CompatDirectiveDiagnosticOptions = {
  debug?: boolean;
  filename?: string;
  phase: string;
};

export function emitCompatDirectiveDiagnostics(ast: ElementNode, options: CompatDirectiveDiagnosticOptions): void {
  if (options.debug !== true) {
    return;
  }

  walkElement(ast, (node) => {
    for (const attr of node.attrs) {
      if (!isLegacyDirectiveAttr(attr)) {
        continue;
      }

      const sourceName = attr.sourceName ?? attr.name;
      const preferredName = preferredDirectiveName(sourceName);
      emitDebugDiagnostic(
        "compiler",
        "warning",
        `${sourceName} is supported as a compatibility alias. Prefer ${preferredName} in Mikuru components.`,
        {
          phase: options.phase,
          filename: options.filename,
          directive: sourceName,
          preferredDirective: preferredName,
          tag: node.tag,
          loc: attr.loc
        }
      );
    }
  });
}

function walkElement(node: ElementNode, visit: (node: ElementNode) => void): void {
  visit(node);

  if (node.attrs.some((attr) => attr.name === "v-pre")) {
    return;
  }

  for (const child of node.children) {
    if (isElementNode(child)) {
      walkElement(child, visit);
    }
  }
}

function isElementNode(node: TemplateNode): node is ElementNode {
  return node.type === "element";
}

function isLegacyDirectiveAttr(attr: TemplateAttribute): boolean {
  const sourceName = attr.sourceName ?? attr.name;
  return sourceName.startsWith("v-");
}

function preferredDirectiveName(name: string): string {
  return name.startsWith("v-") ? `m-${name.slice("v-".length)}` : name;
}
