import { describe, expect, it } from "vitest";

import { createReleaseTask, listReleaseTasks } from "../examples/realworld/src/features/tasks/tasksApi.js";
import { validateCreateTaskInput } from "../examples/realworld/src/features/tasks/tasksForm.js";
import { createTasksStore } from "../examples/realworld/src/features/tasks/tasksStore.js";
import { guardRoute } from "../examples/realworld/src/app/authGuard.js";
import { requestJson } from "../examples/realworld/src/lib/apiClient.js";

describe("realworld architecture layers", () => {
  it("loads typed tasks through the feature API module", async () => {
    const tasks = await listReleaseTasks();

    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      id: "frames",
      owner: "Compiler",
      priority: "high"
    });
  });

  it("validates task creation outside of .mikuru components", async () => {
    expect(validateCreateTaskInput({ title: "  ", owner: "DX" })).toMatchObject({
      valid: false,
      fieldErrors: {
        title: "Enter a task title"
      }
    });

    await expect(createReleaseTask({ title: "  ", owner: "DX" })).rejects.toThrow(/Task title is required/);

    await expect(createReleaseTask({ title: "Document app architecture", owner: "DX" })).resolves.toMatchObject({
      title: "Document app architecture",
      owner: "DX",
      priority: "medium"
    });
  });

  it("keeps loading, filtering, and mutation state in the task store", async () => {
    const store = createTasksStore();

    expect(store.loading.value).toBe(false);

    const loadingPromise = store.loadTasks();
    expect(store.loading.value).toBe(true);
    await loadingPromise;

    expect(store.loading.value).toBe(false);
    expect(store.tasks.value).toHaveLength(3);

    store.search.value = "package";
    expect(store.filteredTasks.value).toHaveLength(1);
    expect(store.filteredTasks.value[0]?.owner).toBe("DX");

    expect(store.densityLabel.value).toBe("Compact");
    store.toggleDensity();
    expect(store.densityLabel.value).toBe("Comfortable");

    store.newTitle.value = "Add architecture tests";
    store.newOwner.value = "Runtime";
    await store.addTask();

    expect(store.formError.value).toBeNull();
    expect(store.tasks.value.at(-1)).toMatchObject({
      title: "Add architecture tests",
      owner: "Runtime"
    });
    expect(store.newTitle.value).toBe("");
  });

  it("keeps auth guard and API auth headers outside components", async () => {
    expect(
      guardRoute({
        name: "admin",
        path: "/admin",
        title: "Protected admin",
        requiresAuth: true
      })
    ).toMatchObject({
      allow: false,
      redirectTo: "/login?redirect=%2Fadmin"
    });

    await requestJson(({ headers }) => {
      expect(headers).toEqual({
        "X-Test": "realworld"
      });

      return Promise.resolve({
        ok: true,
        status: 200,
        body: { ok: true }
      });
    }, { headers: { "X-Test": "realworld" } });
  });
});
