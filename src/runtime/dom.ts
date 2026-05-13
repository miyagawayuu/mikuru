export type ClassValue = string | number | boolean | null | undefined | ClassValue[] | Record<string, unknown>;
export type StyleValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StyleValue[]
  | Record<string, string | number | boolean | null | undefined | { value: unknown }>;

export type AttributeBindingOptions = {
  attribute?: boolean;
  property?: boolean;
};

const modelValueKey = "__mikuruModelValue";

export function setAttribute(element: Element, name: string, value: unknown, options: AttributeBindingOptions = {}): void {
  const normalizedName = name.toLowerCase();

  if (normalizedName === "value" && !options.attribute) {
    const target = element as Element & Record<string, unknown>;

    if (value === null || value === undefined) {
      delete target[modelValueKey];
    } else {
      target[modelValueKey] = value;
    }
  }

  if (options.property) {
    setDomProperty(element, normalizedName, value, true, name);
    element.removeAttribute(name);
    return;
  }

  if (options.attribute) {
    if (value === null || value === undefined) {
      element.removeAttribute(name);
      return;
    }

    if (name === "class") {
      element.setAttribute(name, normalizeClass(value as ClassValue));
      return;
    }

    if (name === "style") {
      const style = normalizeStyle(value as StyleValue);

      if (!style) {
        element.removeAttribute(name);
        return;
      }

      element.setAttribute(name, style);
      return;
    }

    element.setAttribute(name, String(value));
    return;
  }

  if (value === null || value === undefined || (value === false && booleanAttributes.has(normalizedName))) {
    element.removeAttribute(name);
    setDomProperty(element, normalizedName, value);
    return;
  }

  if (name === "class") {
    element.setAttribute(name, normalizeClass(value as ClassValue));
    return;
  }

  if (name === "style") {
    const style = normalizeStyle(value as StyleValue);

    if (!style) {
      element.removeAttribute(name);
      return;
    }

    element.setAttribute(name, style);
    return;
  }

  if (value === true) {
    if (booleanAttributes.has(normalizedName)) {
      element.setAttribute(name, "");
      setDomProperty(element, normalizedName, true);
      return;
    }

    element.setAttribute(name, "true");
    return;
  }

  if (setDomProperty(element, normalizedName, value)) {
    if (value === false) {
      element.setAttribute(name, "false");
      return;
    }

    if (normalizedName === "value") {
      element.setAttribute(name, String(value));
      return;
    }
  }

  element.setAttribute(name, String(value));
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

const propertyAttributeNames = new Set(["checked", "disabled", "multiple", "muted", "open", "readonly", "required", "selected", "value"]);

function setDomProperty(element: Element, normalizedName: string, value: unknown, force = false, propertyName = normalizedName): boolean {
  if ((!force && !propertyAttributeNames.has(normalizedName)) || !(propertyName in element)) {
    return false;
  }

  const target = element as Element & Record<string, unknown>;
  if (normalizedName === "value") {
    target[propertyName] = value == null ? "" : String(value);
    return true;
  }

  if (typeof target[propertyName] === "boolean") {
    target[propertyName] = Boolean(value);
  } else {
    target[propertyName] = value;
  }
  return true;
}

export function normalizeClass(value: ClassValue): string {
  if (isRefLike(value)) {
    return normalizeClass(value.value as ClassValue);
  }

  if (value === null || value === undefined || value === false) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeClass(item)).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => isClassEnabled(enabled))
      .map(([name]) => name)
      .join(" ");
  }

  return "";
}

export function normalizeStyle(value: StyleValue): string {
  if (isRefLike(value)) {
    return normalizeStyle(value.value as StyleValue);
  }

  if (value === null || value === undefined || value === false || value === true) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeStyle(item)).filter(Boolean).join("; ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([name, rawValue]) => {
        const propertyValue = isRefLike(rawValue) ? rawValue.value : rawValue;

        if (propertyValue === null || propertyValue === undefined || propertyValue === false) {
          return "";
        }

        return `${hyphenateStyleName(name)}: ${String(propertyValue).trim()}`;
      })
      .filter(Boolean)
      .join("; ");
  }

  return "";
}

function isClassEnabled(value: unknown): boolean {
  if (isRefLike(value)) {
    return Boolean(value.value);
  }

  return Boolean(value);
}

function isRefLike(value: unknown): value is { value: unknown } {
  return typeof value === "object" && value !== null && "value" in value;
}

function hyphenateStyleName(name: string): string {
  return name.startsWith("--") ? name : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
