export type DebugEventLike = {
  type: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
};

export type DebugComponentTreeNodeLike = {
  id: number;
  name?: string;
  filename?: string;
  root?: Element | Comment;
  parentId?: number;
  props?: Record<string, unknown>;
  propKeys?: string[];
  attrs?: Record<string, unknown>;
  attrKeys?: string[];
  childrenTree: DebugComponentTreeNodeLike[];
  mountedAt?: number;
  unmountedAt?: number;
};

export type DebugComponentRow = {
  id: number;
  name: string;
  filename: string;
  depth: number;
  parentId?: number;
  childCount: number;
  eventCount: number;
  eventBreakdown: string;
  rootLabel: string;
  rootPath: string;
  status: string;
  propKeys: string;
  attrKeys: string;
  childIds: string;
  styleIds: string;
  scopeAttrs: string;
  branch: string;
  indent: string;
  collapsed: boolean;
  hasRoot: boolean;
  root?: Element | Comment;
  styleCount: number;
  mountedLabel: string;
  propsText: string;
};

export type DebugEventRow = {
  id?: string;
  type: string;
  category: string;
  componentId?: number;
  componentLabel: string;
  level: "info" | "warning";
  time: string;
  summary: string;
  diagnosticLocation: string;
  payloadText: string;
};

export type DebugEventCounts = {
  total: number;
  component?: number;
  style?: number;
  async?: number;
  hydration?: number;
  router?: number;
  error?: number;
  [key: string]: number | undefined;
};

export type DebugStyleMetadata = {
  id: string;
  scopeAttr: string;
  scoped: boolean;
};

export function collectComponentEvents(events: DebugEventLike[]): Map<number, DebugEventCounts> {
  const eventsByComponent = new Map<number, DebugEventCounts>();
  for (const event of events) {
    if (event.payload?.componentId === undefined) {
      continue;
    }

    const componentId = asNumber(event.payload.componentId);
    if (componentId === undefined) {
      continue;
    }
    const category = categorizeEvent(event);
    const counts = eventsByComponent.get(componentId) ?? { total: 0, component: 0, style: 0, async: 0, hydration: 0, router: 0, error: 0 };
    counts.total += 1;
    counts[category] = (counts[category] ?? 0) + 1;
    eventsByComponent.set(componentId, counts);
  }

  return eventsByComponent;
}

export function collectStyleEvents(events: DebugEventLike[]): Map<number, DebugStyleMetadata[]> {
  const stylesByComponent = new Map<number, DebugStyleMetadata[]>();
  for (const event of events) {
    if (event.type !== "style:inject" || event.payload?.componentId === undefined) {
      continue;
    }

    const componentId = asNumber(event.payload.componentId);
    if (componentId === undefined) {
      continue;
    }

    const style = asRecord(event.payload.style);
    const styles = stylesByComponent.get(componentId) ?? [];
    if (!styles.some((item) => item.id === style.id)) {
      styles.push({
        id: typeof style.id === "string" ? style.id : "style",
        scopeAttr: typeof style.scopeAttr === "string" ? style.scopeAttr : "",
        scoped: style.scoped === true
      });
    }
    stylesByComponent.set(componentId, styles);
  }

  return stylesByComponent;
}

export function flattenComponentTree(
  tree: DebugComponentTreeNodeLike[],
  stylesByComponent: Map<number, DebugStyleMetadata[]>,
  eventsByComponent: Map<number, DebugEventCounts>,
  collapsedIds: Set<number>,
  depth = 0,
  rows: DebugComponentRow[] = []
): DebugComponentRow[] {
  for (const component of tree) {
    const childIds = component.childrenTree.map((child) => child.id);
    const styles = stylesByComponent.get(component.id) ?? [];
    const eventCounts = eventsByComponent.get(component.id) ?? { total: 0 };
    rows.push({
      id: component.id,
      name: component.name ?? "anonymous",
      filename: component.filename ?? "unknown",
      branch: depth === 0 ? "root" : "child",
      indent: `${10 + depth * 18}px`,
      depth,
      parentId: component.parentId,
      collapsed: collapsedIds.has(component.id),
      childCount: childIds.length,
      styleCount: styles.length,
      eventCount: eventCounts.total,
      eventBreakdown: formatEventBreakdown(eventCounts),
      styleIds: styles.map((style) => style.id).join(", "),
      scopeAttrs: styles.map((style) => style.scopeAttr).filter(Boolean).join(", "),
      hasRoot: isElement(component.root),
      root: component.root,
      rootLabel: formatRootLabel(component.root),
      rootPath: formatRootPath(component.root),
      status: component.unmountedAt ? "unmounted" : "mounted",
      mountedLabel: formatMountedLabel(component.mountedAt, component.unmountedAt),
      propKeys: (component.propKeys ?? []).join(", "),
      attrKeys: (component.attrKeys ?? []).join(", "),
      childIds: childIds.join(", "),
      propsText: JSON.stringify(component.props ?? {}, null, 2)
    });
    flattenComponentTree(component.childrenTree, stylesByComponent, eventsByComponent, collapsedIds, depth + 1, rows);
  }

  return rows;
}

export function filterVisibleComponents<T extends Pick<DebugComponentRow, "id" | "parentId">>(
  rows: T[],
  collapsedIds: Set<number>,
  searchValue = ""
): T[] {
  const query = normalizeSearch(searchValue);
  if (query) {
    const matchingIds = new Set(rows.filter((component) => matchesComponentSearch(component, query)).map((component) => component.id));
    const visibleIds = new Set(matchingIds);
    for (const id of matchingIds) {
      let parentId = rows.find((component) => component.id === id)?.parentId;
      while (parentId !== undefined) {
        visibleIds.add(parentId);
        parentId = rows.find((component) => component.id === parentId)?.parentId;
      }
    }

    return rows.filter((component) => visibleIds.has(component.id));
  }

  return rows.filter((component) => {
    let parentId = component.parentId;
    while (parentId !== undefined) {
      if (collapsedIds.has(parentId)) {
        return false;
      }

      parentId = rows.find((item) => item.id === parentId)?.parentId;
    }

    return true;
  });
}

export function normalizeSearch(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesComponentSearch(component: Partial<DebugComponentRow>, value: string): boolean {
  const query = normalizeSearch(value);
  if (!query) {
    return true;
  }

  return [
    component.name,
    component.filename,
    component.rootLabel,
    component.rootPath,
    component.propKeys,
    component.attrKeys,
    component.styleIds,
    component.scopeAttrs
  ].some((item) => String(item ?? "").toLowerCase().includes(query));
}

export function matchesEventSearch(event: DebugEventRow, value: string): boolean {
  const query = normalizeSearch(value);
  if (!query) {
    return true;
  }

  return [
    event.type,
    event.summary,
    event.diagnosticLocation,
    event.category,
    event.componentLabel,
    event.payloadText
  ].some((item) => String(item ?? "").toLowerCase().includes(query));
}

export function formatEventBreakdown(counts: DebugEventCounts): string {
  return ["component", "style", "async", "hydration", "router", "error"]
    .filter((category) => (counts[category] ?? 0) > 0)
    .map((category) => `${category}: ${counts[category]}`)
    .join(", ");
}

export function summarizeEvent(event: DebugEventLike): string {
  const payload = event.payload ?? {};
  const diagnostic = asRecord(payload.diagnostic);
  if (typeof diagnostic.message === "string") {
    const location = formatDiagnosticLocation(diagnostic);
    return `${diagnostic.phase ?? diagnostic.source ?? event.type}: ${diagnostic.message}${location ? ` (${location})` : ""}`;
  }

  if (event.type === "style:inject") {
    const style = asRecord(payload.style);
    const scoped = style.scoped ? "scoped" : "global";
    const size = typeof style.length === "number" ? `${style.length} chars` : "unknown size";
    const component = asRecord(payload.component);
    return `${formatFilename(component.filename)}: ${style.id ?? "style"} (${scoped}, ${size})`;
  }

  if (event.type === "hydration:warning") {
    return `${payload.kind ?? "hydration"}: ${payload.domPath ?? payload.message ?? "warning"}`;
  }

  const to = asRecord(payload.to);
  const from = asRecord(payload.from);
  if (to.path || from.path) {
    return `${from.path ?? "-"} -> ${to.path ?? "-"}${payload.status ? ` (${payload.status})` : ""}`;
  }

  const errorInfo = asRecord(payload.errorInfo);
  if (errorInfo.phase) {
    return `${errorInfo.phase}: ${formatError(payload.error)}`;
  }

  if (payload.error) {
    return formatError(payload.error);
  }

  if (payload.status) {
    return String(payload.status);
  }

  if (payload.componentId) {
    return `component #${payload.componentId}`;
  }

  return new Date(event.timestamp ?? Date.now()).toLocaleTimeString();
}

export function categorizeEvent(event: Pick<DebugEventLike, "type">): string {
  if (isErrorEvent(event)) {
    return "error";
  }

  if (event.type.startsWith("route:")) {
    return "router";
  }

  if (event.type.startsWith("async:")) {
    return "async";
  }

  if (event.type.startsWith("hydration:")) {
    return "hydration";
  }

  if (event.type.startsWith("component:")) {
    return "component";
  }

  if (event.type.startsWith("style:")) {
    return "style";
  }

  return "component";
}

export function isErrorEvent(event: Pick<DebugEventLike, "type">): boolean {
  return event.type.includes("error") || event.type.endsWith(":rejected") || event.type === "hydration:warning";
}

export function isForegroundEvent(event: Pick<DebugEventLike, "type">): boolean {
  return event.type.startsWith("route:") || event.type.startsWith("hydration:") || isErrorEvent(event);
}

export function formatError(error: unknown): string {
  if (!error) {
    return "unknown";
  }

  return error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error);
}

export function formatFilename(filename: unknown): string {
  if (!filename) {
    return "unknown";
  }

  return String(filename).split(/[\\/]/).pop() ?? String(filename);
}

export function formatDiagnosticLocation(diagnostic: Record<string, unknown>): string {
  const filename = typeof diagnostic.filename === "string" ? formatFilename(diagnostic.filename) : "";
  const line = asNumber(diagnostic.line);
  const column = asNumber(diagnostic.column);
  if (line === undefined || column === undefined) {
    return filename;
  }

  return `${filename ? `${filename}:` : ""}${line}:${column}`;
}

export function formatComponentLabel(componentId: unknown, component: unknown): string {
  if (componentId === undefined) {
    return "";
  }

  const metadata = asRecord(component);
  return `#${componentId} ${formatFilename(metadata.filename ?? metadata.component)}`;
}

export function isElement(value: unknown): value is Element {
  return value instanceof Element;
}

export function formatRootLabel(root: unknown): string {
  if (root instanceof Element) {
    const id = root.id ? `#${root.id}` : "";
    const classes = Array.from(root.classList).slice(0, 3).map((name) => `.${name}`).join("");
    return `<${root.tagName.toLowerCase()}${id}${classes}>`;
  }

  if (root instanceof Comment) {
    return "<!--comment-->";
  }

  return "none";
}

export function formatRootPath(root: unknown): string {
  if (!(root instanceof Element)) {
    return "";
  }

  const parts: string[] = [];
  let current: Element | null = root;
  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    let label = current.tagName.toLowerCase();
    if (current.id) {
      label += `#${current.id}`;
      parts.unshift(label);
      break;
    }

    const className = Array.from(current.classList).find((name) => !name.startsWith("mikuru-") && !name.startsWith("debug-root-highlight"));
    if (className) {
      label += `.${className}`;
    }

    const parent: Element | null = current.parentElement;
    if (parent) {
      const currentTag = current.tagName;
      const siblings = Array.from(parent.children).filter((child): child is Element => child instanceof Element && child.tagName === currentTag);
      if (siblings.length > 1) {
        label += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }

    parts.unshift(label);
    current = parent;
  }

  return parts.join(" > ");
}

export function formatMountedLabel(mountedAt?: number, unmountedAt?: number): string {
  if (!mountedAt) {
    return "unknown";
  }

  const end = unmountedAt ?? Date.now();
  const seconds = Math.max(0, Math.round((end - mountedAt) / 1000));
  return unmountedAt ? `${seconds}s before unmount` : `${seconds}s ago`;
}

export function stringifyPayload(payload: unknown): string {
  return JSON.stringify(payload, (_key, value: unknown) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }

    if (value instanceof Element) {
      return `<${value.tagName.toLowerCase()}>`;
    }

    if (value instanceof Comment) {
      return "<!--comment-->";
    }

    if (value instanceof Set) {
      return Array.from(value);
    }

    if (typeof value === "function") {
      return "[Function]";
    }

    return value;
  }, 2);
}

export function createPanelSnapshot(options: {
  componentSearch: string;
  eventSearch: string;
  eventFilter: string;
  componentEventFilterId?: number;
  allComponents: DebugComponentRow[];
  components: DebugComponentRow[];
  allEvents: DebugEventRow[];
  searchedEvents: DebugEventRow[];
  filteredEvents: DebugEventRow[];
  selected?: DebugComponentRow;
  selectedEvent?: DebugEventRow;
}): Record<string, unknown> {
  return {
    capturedAt: new Date().toISOString(),
    filters: {
      componentSearch: options.componentSearch,
      eventSearch: options.eventSearch,
      eventFilter: options.eventFilter,
      componentEventFilterId: options.componentEventFilterId
    },
    counts: {
      allComponents: options.allComponents.length,
      visibleComponents: options.components.length,
      allEvents: options.allEvents.length,
      searchedEvents: options.searchedEvents.length,
      filteredEvents: options.filteredEvents.length
    },
    selectedComponent: options.selected ? serializeComponent(options.selected) : undefined,
    selectedEvent: options.selectedEvent ? serializeEvent(options.selectedEvent) : undefined,
    visibleComponents: options.components.slice(0, 50).map(serializeComponent),
    filteredEvents: options.filteredEvents.slice(0, 50).map(serializeEvent)
  };
}

export function createSnapshotSummary(options: {
  componentSearch: string;
  eventSearch: string;
  eventFilter: string;
  componentEventFilterId?: number;
  allComponents: DebugComponentRow[];
  components: DebugComponentRow[];
  allEvents: DebugEventRow[];
  filteredEvents: DebugEventRow[];
}): { components: string; events: string; filters: string } {
  return {
    components: `${options.components.length}/${options.allComponents.length}`,
    events: `${options.filteredEvents.length}/${options.allEvents.length}`,
    filters: [
      options.componentSearch ? `component: ${options.componentSearch}` : "",
      options.eventSearch ? `event: ${options.eventSearch}` : "",
      options.eventFilter !== "all" ? `type: ${options.eventFilter}` : "",
      options.componentEventFilterId !== undefined ? `component #${options.componentEventFilterId}` : ""
    ].filter(Boolean).join(", ")
  };
}

export function serializeComponent(component: DebugComponentRow): Record<string, unknown> {
  return {
    id: component.id,
    name: component.name,
    filename: component.filename,
    depth: component.depth,
    parentId: component.parentId,
    status: component.status,
    root: component.rootLabel,
    path: component.rootPath,
    props: component.propKeys,
    attrs: component.attrKeys,
    children: component.childIds,
    styles: component.styleIds,
    scopes: component.scopeAttrs,
    events: component.eventCount,
    eventTypes: component.eventBreakdown
  };
}

export function serializeEvent(event: DebugEventRow): Record<string, unknown> {
  return {
    type: event.type,
    category: event.category,
    componentId: event.componentId,
    component: event.componentLabel,
    level: event.level,
    time: event.time,
    summary: event.summary,
    diagnosticLocation: event.diagnosticLocation || undefined,
    payload: compactEventPayload(event)
  };
}

export function compactEventPayload(event: Pick<DebugEventRow, "payloadText" | "componentId" | "componentLabel">): unknown {
  const payload = parsePayloadText(event.payloadText);
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = asRecord(payload);
  return {
    componentId: event.componentId,
    component: event.componentLabel || undefined,
    diagnostic: record.diagnostic,
    style: record.style,
    route: record.to || record.from ? { from: record.from, to: record.to, status: record.status } : undefined,
    errorInfo: record.errorInfo,
    error: record.error
  };
}

export function parsePayloadText(payloadText: string): unknown {
  try {
    return JSON.parse(payloadText);
  } catch (_error) {
    return payloadText;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
