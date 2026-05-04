import { ref, effect, computed } from "@mikuru-src/runtime";
import type { Todo } from "./types.js";
import { renderTodoItem } from "./TodoItem.js";

export function renderTodoApp(root: HTMLElement) {
  const todos = ref<Todo[]>([
    { id: 1, text: "Learn Mikuru basics", done: false },
    { id: 2, text: "Build a sample app", done: true }
  ]);

  const newText = ref("");

  const remaining = computed(() => todos.value.filter((t: Todo) => !t.done).length);

  function addTodo() {
    const text = newText.value.trim();
    if (!text) return;
    todos.value = [
      ...todos.value,
      { id: Date.now(), text, done: false }
    ];
    newText.value = "";
  }

  function toggle(todo: Todo) {
    // flip and trigger shallow copy to notify
    todo.done = !todo.done;
    todos.value = todos.value.map((t: Todo) => (t.id === todo.id ? { ...t } : t));
  }

  function remove(id: number) {
    todos.value = todos.value.filter((t: Todo) => t.id !== id);
  }

  const container = document.createElement("div");

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "New todo...";
  input.addEventListener("input", (e) => {
    newText.value = (e.target as HTMLInputElement).value;
  });

  const addBtn = document.createElement("button");
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", addTodo);

  const stats = document.createElement("div");
  const list = document.createElement("div");

  effect(() => {
    stats.textContent = `${remaining.value} remaining`;
  });

  // keyed diffing: reuse TodoItem components when possible
  const keyed = new Map<number, { el: HTMLElement; update: (t: Todo) => void }>();

  effect(() => {
    const next = todos.value;

    // remove nodes not present
    for (const id of Array.from(keyed.keys())) {
      if (!next.some((t: Todo) => t.id === id)) {
        const comp = keyed.get(id)!;
        if (comp && comp.el.parentElement) comp.el.parentElement.removeChild(comp.el);
        keyed.delete(id);
      }
    }

    // ensure nodes in order
    list.innerHTML = "";
    for (const t of next) {
      let comp = keyed.get(t.id);
      if (!comp) {
        const instance = renderTodoItem(t, { onToggle: toggle, onRemove: remove }) as any;
        // renderTodoItem returns { el, update } or HTMLElement depending on implementation
        if (instance && instance.el && instance.update) {
          comp = { el: instance.el as HTMLElement, update: instance.update };
        } else {
          // fallback for older shape: assume it's an HTMLElement
          comp = { el: instance as HTMLElement, update: (_nextT: Todo) => { /* no-op */ } };
        }
        keyed.set(t.id, comp);
      }
      comp.update(t);
      list.appendChild(comp.el);
    }
  });

  const form = document.createElement("div");
  form.appendChild(input);
  form.appendChild(addBtn);

  container.appendChild(form);
  container.appendChild(stats);
  container.appendChild(list);

  root.appendChild(container);
}
