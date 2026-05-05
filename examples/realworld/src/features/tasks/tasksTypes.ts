export type TaskOwner = "Compiler" | "Runtime" | "DX";

export type OwnerFilter = TaskOwner | "all";

export type ReleaseTask = {
  id: string;
  title: string;
  owner: TaskOwner;
  priority: "high" | "medium" | "low";
  detail: string;
};

export type CreateTaskInput = {
  title: string;
  owner: TaskOwner;
};
