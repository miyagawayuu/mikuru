export type MikuruSsrComponent = {
  renderToString: (props?: Record<string, unknown>) => string | Promise<string>;
};

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

const unsafeAttributeNamePattern = /[\s"'<>/=]/;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAttr(name: string, value: unknown): string {
  if (!name || unsafeAttributeNamePattern.test(name) || value === false || value === null || value === undefined) {
    return "";
  }

  const normalizedName = name.toLowerCase();
  if (value === true && booleanAttributes.has(normalizedName)) {
    return ` ${name}`;
  }

  if (value === true) {
    return ` ${name}=""`;
  }

  return ` ${name}="${escapeHtml(value)}"`;
}

export function renderAttrs(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs) {
    return "";
  }

  let rendered = "";
  for (const [name, value] of Object.entries(attrs)) {
    rendered += renderAttr(name, value);
  }
  return rendered;
}

export function renderToString(component: MikuruSsrComponent | ((props?: Record<string, unknown>) => string | Promise<string>), props: Record<string, unknown> = {}): string | Promise<string> {
  if (typeof component === "function") {
    return component(props);
  }

  if (component && typeof component.renderToString === "function") {
    return component.renderToString(props);
  }

  throw new TypeError("renderToString() expects a component with renderToString(props) or a render function.");
}
