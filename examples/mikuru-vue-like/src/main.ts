import { renderTodoApp } from "./components/TodoApp.js";

const root = document.querySelector("#app") as HTMLElement;
if (root) renderTodoApp(root);
