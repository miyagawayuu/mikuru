import { mount } from "./App.mikuru";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app");
}

mount(app);
