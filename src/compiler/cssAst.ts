import postcss, { type AtRule, type ChildNode, type Rule } from "postcss";
import selectorParser, { type Attribute, type Selector } from "postcss-selector-parser";

type SelectorNode = Selector["nodes"][number];

const opaqueAtRules = new Set([
  "keyframes", "-webkit-keyframes", "-moz-keyframes", "-o-keyframes",
  "counter-style", "font-face", "font-feature-values", "page", "property", "viewport"
]);

export function scopeCssAst(css: string, scopeAttr: string): string {
  const root = postcss.parse(css);
  const visit = (node: ChildNode, opaque: boolean): void => {
    if (node.type === "atrule") {
      const atRule = node as AtRule;
      atRule.nodes?.forEach((child) => visit(child, opaque || opaqueAtRules.has(atRule.name.toLowerCase())));
      return;
    }
    if (node.type !== "rule") return;
    const rule = node as Rule;
    if (!opaque) rule.selector = scopeSelector(rule.selector, scopeAttr);
    rule.nodes?.forEach((child) => visit(child, opaque));
  };
  root.nodes.forEach((node) => visit(node, false));
  return root.toString();
}

function scopeSelector(source: string, scopeAttr: string): string {
  const root = selectorParser().astSync(source);
  const output: Selector[] = [];
  root.each((original) => {
    const helperIndex = original.nodes.findIndex((node) => node.type === "pseudo" && (node.value === ":global" || node.value === ":deep"));
    if (helperIndex < 0) {
      const selector = original.clone();
      insertScope(selector, findScopeTarget(selector.nodes), scopeAttr);
      output.push(selector);
      return;
    }
    const originalHelper = original.nodes[helperIndex];
    if (originalHelper?.type !== "pseudo") return;
    for (const argument of originalHelper.nodes ?? []) {
      const selector = original.clone();
      const helper = selector.nodes[helperIndex];
      if (helper?.type !== "pseudo") continue;
      const before = selector.nodes.slice(0, helperIndex);
      const prefix = before.filter((node) => node.type !== "combinator");
      if (prefix.length > 0) insertScope(selector, prefix.at(-1), scopeAttr);
      else if (helper.value === ":deep") selector.insertBefore(helper, selectorParser.attribute({ attribute: scopeAttr, value: undefined, raws: {} }));
      const prior = helper.prev();
      if (prior && prior.type !== "combinator") selector.insertBefore(helper, selectorParser.combinator({ value: " " }));
      const replacement = argument.nodes.map((node) => node.clone());
      if (replacement[0] && helper.prev()?.type === "combinator") replacement[0].spaces.before = "";
      helper.replaceWith(...replacement);
      output.push(selector);
    }
  });
  root.removeAll();
  output.forEach((selector) => root.append(selector));
  return root.toString();
}

function findScopeTarget(nodes: SelectorNode[]): SelectorNode | undefined {
  let lastCombinator = -1;
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index]?.type === "combinator") lastCombinator = index;
  }
  const compound = nodes.slice(lastCombinator + 1).filter((node) => node.type !== "combinator");
  return compound.find((node) => node.type === "pseudo") ?? compound.at(-1);
}

function insertScope(selector: Selector, target: SelectorNode | undefined, scopeAttr: string): void {
  const attribute = selectorParser.attribute({ attribute: scopeAttr, value: undefined, raws: {} }) as Attribute;
  if (!target) {
    selector.append(attribute);
  } else if (target.type === "pseudo") {
    selector.insertBefore(target, attribute);
  } else {
    selector.insertAfter(target, attribute);
  }
}
