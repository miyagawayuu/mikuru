import { computed, ref } from "mikuru";

import { createReleaseTask, listReleaseTasks } from "./tasksApi.js";
import { errorMessage } from "../../lib/errors.js";
import type { OwnerFilter, ReleaseTask, TaskOwner } from "./tasksTypes.js";

export function createTasksStore() {
  const search = ref("");
  const owner = ref<OwnerFilter>("all");
  const compact = ref(false);
  const newTitle = ref("");
  const newOwner = ref<TaskOwner>("Compiler");
  const tasks = ref<ReleaseTask[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const loadError = ref<string | null>(null);
  const formError = ref<string | null>(null);

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

    try {
      const task = await createReleaseTask({
        title: newTitle.value,
        owner: newOwner.value
      });

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
    densityLabel,
    loadTasks,
    addTask,
    toggleDensity
  };
}
