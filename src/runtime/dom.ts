export type ClassValue = string | number | boolean | null | undefined | ClassValue[] | Record<string, unknown>;
export type StyleValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StyleValue[]
  | Record<string, string | number | boolean | null | undefined | { value: unknown }>;

export function setAttribute(element: Element, name: string, value: unknown): void {
  if (value === null || value === undefined || value === false) {
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

  if (value === true) {
    element.setAttribute(name, "");
    return;
  }

  element.setAttribute(name, String(value));
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
