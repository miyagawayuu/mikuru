import { describe, expect, it } from "vitest";

import {
  compactEventPayload,
  createPanelSnapshot,
  filterVisibleComponents,
  matchesEventSearch,
  type DebugComponentRow,
  type DebugEventRow
} from "../examples/dogfood/debugPanelHelpers.js";

const componentRows: DebugComponentRow[] = [
  row({ id: 1, name: "App", filename: "App.mikuru", childCount: 2 }),
  row({ id: 2, parentId: 1, name: "NotesPanel", filename: "NotesPanel.mikuru", rootPath: "main > section.notes" }),
  row({ id: 3, parentId: 1, name: "DebugPanel", filename: "DebugPanel.mikuru", rootPath: "main > section.debug-panel", scopeAttrs: "data-mikuru-scope-debug" })
];

describe("dogfood debug panel helpers", () => {
  it("hides descendants of collapsed component rows", () => {
    expect(filterVisibleComponents(componentRows, new Set([1]), "").map((component) => component.id)).toEqual([1]);
  });

  it("shows matching component rows and their ancestors while searching", () => {
    expect(filterVisibleComponents(componentRows, new Set([1]), "debug-panel").map((component) => component.id)).toEqual([1, 3]);
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
