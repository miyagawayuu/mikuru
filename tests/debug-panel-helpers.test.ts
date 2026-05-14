import { Window } from "happy-dom";
import { beforeEach, describe, expect, it } from "vitest";

import {
  compactEventPayload,
  createPanelSnapshot,
  createSnapshotSummary,
  filterVisibleComponents,
  flattenComponentTree,
  formatRootLabel,
  formatRootPath,
  matchesEventSearch,
  stringifyPayload,
  type DebugComponentRow,
  type DebugEventRow
} from "../examples/dogfood/debugPanelHelpers.js";

const componentRows: DebugComponentRow[] = [
  row({ id: 1, name: "App", filename: "App.mikuru", childCount: 2 }),
  row({ id: 2, parentId: 1, name: "NotesPanel", filename: "NotesPanel.mikuru", rootPath: "main > section.notes" }),
  row({ id: 3, parentId: 1, name: "DebugPanel", filename: "DebugPanel.mikuru", rootPath: "main > section.debug-panel", scopeAttrs: "data-mikuru-scope-debug" })
];

describe("dogfood debug panel helpers", () => {
  beforeEach(() => {
    const window = new Window();
    Object.assign(globalThis, {
      document: window.document,
      Element: window.Element,
      Comment: window.Comment,
      Node: window.Node
    });
  });

  it("hides descendants of collapsed component rows", () => {
    expect(filterVisibleComponents(componentRows, new Set([1]), "").map((component) => component.id)).toEqual([1]);
  });

  it("shows matching component rows and their ancestors while searching", () => {
    expect(filterVisibleComponents(componentRows, new Set([1]), "debug-panel").map((component) => component.id)).toEqual([1, 3]);
  });

  it("formats root labels and paths without debug highlight classes", () => {
    const root = document.createElement("section");
    root.className = "debug-panel debug-root-highlight";
    const child = document.createElement("button");
    child.className = "debug-action";
    root.append(child);
    document.body.append(root);

    try {
      expect(formatRootLabel(root)).toBe("<section.debug-panel.debug-root-highlight>");
      expect(formatRootPath(child)).toBe("html > body > section.debug-panel > button.debug-action");
    } finally {
      root.remove();
    }
  });

  it("flattens component trees with style, event, root, and collapsed metadata", () => {
    const root = document.createElement("main");
    root.id = "app";
    const child = document.createElement("section");
    child.className = "debug-panel";
    root.append(child);

    const rows = flattenComponentTree(
      [
        {
          id: 1,
          name: "App",
          filename: "App.mikuru",
          root,
          propKeys: ["title"],
          childrenTree: [
            {
              id: 2,
              name: "DebugPanel",
              filename: "DebugPanel.mikuru",
              root: child,
              parentId: 1,
              attrKeys: ["data-test"],
              mountedAt: Date.now(),
              childrenTree: []
            }
          ]
        }
      ],
      new Map([[2, [{ id: "mikuru-debug", scopeAttr: "data-mikuru-scope-debug", scoped: true }]]]),
      new Map([[2, { total: 2, style: 1, component: 1 }]]),
      new Set([1])
    );

    expect(rows).toMatchObject([
      { id: 1, name: "App", branch: "root", childCount: 1, collapsed: true, rootLabel: "<main#app>" },
      {
        id: 2,
        name: "DebugPanel",
        branch: "child",
        parentId: 1,
        styleCount: 1,
        eventCount: 2,
        eventBreakdown: "component: 1, style: 1",
        styleIds: "mikuru-debug",
        scopeAttrs: "data-mikuru-scope-debug",
        attrKeys: "data-test"
      }
    ]);
  });

  it("matches event search across type, summary, component label, and payload", () => {
    const event = eventRow({
      type: "style:inject",
      componentLabel: "#3 DebugPanel.mikuru",
      summary: "DebugPanel.mikuru: mikuru-abc (scoped, 120 chars)",
      payloadText: JSON.stringify({ style: { id: "mikuru-abc", scopeAttr: "data-mikuru-scope-debug" } })
    });

    expect(matchesEventSearch(event, "style:inject")).toBe(true);
    expect(matchesEventSearch(event, "debugpanel")).toBe(true);
    expect(matchesEventSearch(event, "data-mikuru-scope-debug")).toBe(true);
    expect(matchesEventSearch(event, "route:navigate")).toBe(false);
  });

  it("keeps snapshot event payloads compact", () => {
    const event = eventRow({
      type: "component:update",
      componentId: 3,
      componentLabel: "#3 DebugPanel.mikuru",
      payloadText: JSON.stringify({
        component: { props: { noteTitle: "Parser limits should stay loud" } },
        diagnostic: { source: "runtime", level: "error", message: "boom" },
        errorInfo: { phase: "event" }
      })
    });

    expect(compactEventPayload(event)).toEqual({
      componentId: 3,
      component: "#3 DebugPanel.mikuru",
      diagnostic: { source: "runtime", level: "error", message: "boom" },
      style: undefined,
      route: undefined,
      errorInfo: { phase: "event" },
      error: undefined
    });
  });

  it("builds a shareable panel snapshot from current filters and selections", () => {
    const event = eventRow({ type: "route:navigate", category: "router", summary: "/ -> /settings" });
    const snapshot = createPanelSnapshot({
      componentSearch: "debug",
      eventSearch: "route",
      eventFilter: "router",
      componentEventFilterId: 3,
      allComponents: componentRows,
      components: [componentRows[0], componentRows[2]],
      allEvents: [event],
      searchedEvents: [event],
      filteredEvents: [event],
      selected: componentRows[2],
      selectedEvent: event
    });

    expect(snapshot).toMatchObject({
      filters: {
        componentSearch: "debug",
        eventSearch: "route",
        eventFilter: "router",
        componentEventFilterId: 3
      },
      counts: {
        allComponents: 3,
        visibleComponents: 2,
        allEvents: 1,
        searchedEvents: 1,
        filteredEvents: 1
      },
      selectedComponent: {
        id: 3,
        name: "DebugPanel",
        filename: "DebugPanel.mikuru"
      },
      selectedEvent: {
        type: "route:navigate",
        category: "router"
      }
    });
  });

  it("summarizes active snapshot filters", () => {
    expect(createSnapshotSummary({
      componentSearch: "debug",
      eventSearch: "route",
      eventFilter: "router",
      componentEventFilterId: 3,
      allComponents: componentRows,
      components: [componentRows[0], componentRows[2]],
      allEvents: [eventRow({}), eventRow({ type: "route:navigate" })],
      filteredEvents: [eventRow({ type: "route:navigate" })]
    })).toEqual({
      components: "2/3",
      events: "1/2",
      filters: "component: debug, event: route, type: router, component #3"
    });
  });

  it("stringifies DOM and Error payloads safely", () => {
    const node = document.createElement("article");
    expect(stringifyPayload({ node, error: new Error("nope"), values: new Set(["a", "b"]) })).toContain("\"node\": \"<article>\"");
  });
});

function row(overrides: Partial<DebugComponentRow>): DebugComponentRow {
  return {
    id: 0,
    name: "Component",
    filename: "Component.mikuru",
    depth: 0,
    childCount: 0,
    eventCount: 0,
    eventBreakdown: "",
    branch: "child",
    indent: "10px",
    collapsed: false,
    hasRoot: true,
    styleCount: 0,
    mountedLabel: "0s ago",
    propsText: "{}",
    rootLabel: "<section>",
    rootPath: "main > section",
    status: "mounted",
    propKeys: "",
    attrKeys: "",
    childIds: "",
    styleIds: "",
    scopeAttrs: "",
    ...overrides
  };
}

function eventRow(overrides: Partial<DebugEventRow>): DebugEventRow {
  return {
    type: "component:register",
    category: "component",
    componentLabel: "",
    level: "info",
    time: "12:00:00",
    summary: "component #1",
    payloadText: "{}",
    ...overrides
  };
}
