// Event listeners must use the event binding API, never executable HTML attributes.
export function isUnsafeAttributeName(name: string): boolean {
  return !name || /[\u0000-\u0020\u007f\s"'<>/=]/.test(name) || /^on/i.test(name);
}
