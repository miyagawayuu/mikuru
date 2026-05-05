import App from "./App.mikuru";

const root = document.getElementById("app");

if (!root) {
  throw new Error("Missing #app root");
}

App.mount(root);
