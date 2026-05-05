import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { compile } from "../src/compiler/index.js";

describe("basic example", () => {
  it("compiles App.mikuru into a mountable module", () => {
    const source = readFileSync(resolve("examples/basic/App.mikuru"), "utf8");
    const result = compile(source, { filename: "examples/basic/App.mikuru" });

    expect(result.code).toContain("export function mount(target, props = {})");
    expect(result.code).toContain('import MoodBadge from "./MoodBadge.mikuru";');
    expect(result.code).toContain("MoodBadge.mount");
    expect(result.code).toContain('addEventListener("click", handler');
    expect(result.code).toContain("unmount()");
  });

  it("compiles MoodBadge.mikuru into a mountable module", () => {
    const source = readFileSync(resolve("examples/basic/MoodBadge.mikuru"), "utf8");
    const result = compile(source, { filename: "examples/basic/MoodBadge.mikuru" });

    expect(result.code).toContain("export function mount(target, props = {})");
    expect(result.code).toContain("const label = { get value() { return props.label; } };");
    expect(result.code).toContain("const modelValue = { get value() { return props.modelValue; } };");
    expect(result.code).toContain("const emit = __mikuru_emit;");
    expect(result.code).toContain('emit("update:modelValue"');
    expect(result.code).toContain("unwrap(label)");
    expect(result.code).toContain("unwrap(modelValue)");
  });
});

describe("dogfood example", () => {
  it("compiles the dogfood app with component v-model, keyed lists, and slots", () => {
    const source = readFileSync(resolve("examples/dogfood/App.mikuru"), "utf8");
    const result = compile(source, { filename: "examples/dogfood/App.mikuru" });

    expect(result.code).toContain('import TextField from "./TextField.mikuru";');
    expect(result.code).toContain('import NoteCard from "./NoteCard.mikuru";');
    expect(result.code).toContain("onUpdateModelValue");
    expect(result.code).toContain("new Map()");
    expect(result.code).toContain("children(slotTarget");
  });
});

describe("realworld example", () => {
  it("keeps App.mikuru as a small page composition root", () => {
    const source = readFileSync(resolve("examples/realworld/src/App.mikuru"), "utf8");
    const result = compile(source, { filename: "examples/realworld/src/App.mikuru" });

    expect(result.code).toContain('import DashboardPage from "./pages/DashboardPage.mikuru";');
    expect(result.code).toContain("DashboardPage.mount");
  });

  it("compiles the dashboard page with architecture-layer imports", () => {
    const source = readFileSync(resolve("examples/realworld/src/pages/DashboardPage.mikuru"), "utf8");
    const result = compile(source, { filename: "examples/realworld/src/pages/DashboardPage.mikuru" });

    expect(result.code).toContain('import { createTasksStore } from "../features/tasks/tasksStore";');
    expect(result.code).toContain('import TaskCard from "../features/tasks/TaskCard.mikuru";');
    expect(result.code).toContain("onUpdateModelValue");
    expect(result.code).toContain("new Map()");
  });
});
