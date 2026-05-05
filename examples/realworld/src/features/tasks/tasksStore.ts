import { computed, ref } from "mikuru/runtime";

import { createReleaseTask, listReleaseTasks, seedTasks } from "./tasksApi.js";
import { validateCreateTaskInput } from "./tasksForm.js";
import { errorMessage } from "../../lib/errors.js";
import type { OwnerFilter, ReleaseTask, TaskOwner } from "./tasksTypes.js";

export function createTasksStore() {
  const search = ref("");
  const owner = ref<OwnerFilter>("all");
  const compact = ref(false);
  const newTitle = ref("");
  const newOwner = ref<TaskOwner>("Compiler");
  const tasks = ref<ReleaseTask[]>(seedTasks.map((task) => ({ ...task })));
  const loading = ref(false);
  const saving = ref(false);
  const loadError = ref<string | null>(null);
  const formError = ref<string | null>(null);
  const titleError = ref<string | null>(null);

  const densityLabel = computed(() => (compact.value ? "Comfortable" : "Compact"));

  const filteredTasks = computed(() => {
    const query = search.value.trim().toLowerCase();

    return tasks.value.filter((task) => {
      const ownerMatches = owner.value === "all" || task.owner === owner.value;
      const queryMatches =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.detail.toLowerCase().includes(query);

      return ownerMatches && queryMatches;
    });
  });

  async function loadTasks() {
    loading.value = true;
    loadError.value = null;

    try {
      tasks.value = await listReleaseTasks();
    } catch (cause) {
      loadError.value = errorMessage(cause, "Failed to load release tasks");
    } finally {
      loading.value = false;
    }
  }

  async function addTask() {
    if (saving.value) {
      return;
    }

    saving.value = true;
    formError.value = null;
    titleError.value = null;

    try {
      const validation = validateCreateTaskInput({
        title: newTitle.value,
        owner: newOwner.value
      });

      if (!validation.valid) {
        titleError.value = validation.fieldErrors.title ?? null;
        return;
      }

      const task = await createReleaseTask(validation.values);

      tasks.value = [...tasks.value, task];
      newTitle.value = "";
    } catch (cause) {
      formError.value = errorMessage(cause, "Failed to add task");
    } finally {
      saving.value = false;
    }
  }

  function toggleDensity() {
    compact.value = !compact.value;
  }

  return {
    search,
    owner,
    compact,
    newTitle,
    newOwner,
    tasks,
    filteredTasks,
    loading,
    saving,
    loadError,
    formError,
    titleError,
    densityLabel,
    loadTasks,
    addTask,
    toggleDensity
  };
}
