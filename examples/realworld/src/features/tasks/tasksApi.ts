import { AppError } from "../../lib/errors.js";
import { mockJson, requestJson } from "../../lib/apiClient.js";
import type { CreateTaskInput, ReleaseTask } from "./tasksTypes.js";

export const seedTasks: ReleaseTask[] = [
  {
    id: "frames",
    title: "Code frames for parser failures",
    owner: "Compiler",
    priority: "high",
    detail: "Template errors should point to the exact broken expression."
  },
  {
    id: "cleanup",
    title: "Unmount cleanup under filters",
    owner: "Runtime",
    priority: "medium",
    detail: "Cleanup should remain stable while filters change."
  },
  {
    id: "package",
    title: "Published package smoke test",
    owner: "DX",
    priority: "medium",
    detail: "Verify package exports through a packed install."
  }
];

export async function listReleaseTasks(): Promise<ReleaseTask[]> {
  return requestJson(() => mockJson(seedTasks.map((task) => ({ ...task }))), { auth: true });
}

export async function createReleaseTask(input: CreateTaskInput): Promise<ReleaseTask> {
  const title = input.title.trim();

  if (!title) {
    throw new AppError("Task title is required", "VALIDATION_ERROR");
  }

  return requestJson(
    ({ headers }) =>
      mockJson({
        id: `task-${Date.now()}`,
        title,
        owner: input.owner,
        priority: "medium",
        detail: headers.Authorization ? `${input.owner} / medium / authenticated` : `${input.owner} / medium`
      }),
    { auth: true }
  );
}
