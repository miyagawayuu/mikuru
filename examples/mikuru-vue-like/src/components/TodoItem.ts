import type { Todo } from "./types.js";

export type TodoItemHandlers = {
  onToggle: (todo: Todo) => void;
  onRemove: (id: number) => void;
};

// createTodoItem: creates a reusable component instance for a single Todo.
// Returns an object with `el` (root node) and `update(todo)` to refresh props.
export function createTodoItem(initial: Todo, handlers: TodoItemHandlers) {
  const root = document.createElement("div");
  root.className = "todo";

  const chk = document.createElement("input");
  chk.type = "checkbox";

  const span = document.createElement("span");

  const del = document.createElement("button");
  del.textContent = "Delete";

  chk.addEventListener("change", () => handlers.onToggle(current));
  del.addEventListener("click", () => handlers.onRemove(current.id));

  root.appendChild(chk);
  root.appendChild(span);
  root.appendChild(del);

  let current = initial;

  function update(next: Todo) {
    current = next;
    chk.checked = !!next.done;
    span.textContent = next.text;
    span.className = next.done ? "completed" : "";
  }

  // initialize
  update(initial);

  return { el: root, update };
}

// Back-compat: previous implementations exported `renderTodoItem` which
// returned either an `HTMLElement` or an object `{ el, update }`.
export function renderTodoItem(todo: Todo, handlers: TodoItemHandlers) {
  return createTodoItem(todo, handlers);
}
