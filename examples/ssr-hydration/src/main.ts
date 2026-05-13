import HydrationApp from "./App.mikuru?hydrate";
import { renderToString } from "./App.mikuru?ssr";
import { renderToStream } from "mikuru/server";

import "./style.css";

const hydratedProps = {
  initialCount: 2,
  message: "Server HTML is reused."
};
const recoveryProps = {
  initialCount: 5,
  message: "Recovered from mismatched SSR DOM."
};
const recoveryOffProps = {
  initialCount: 9,
  message: "Recovery was disabled."
};

const app = document.getElementById("app");
const drift = document.getElementById("drift");
const driftOff = document.getElementById("drift-off");
const streamOutput = document.getElementById("stream-output");

if (!app || !drift || !driftOff || !streamOutput) {
  throw new Error("Missing SSR hydration example roots");
}

HydrationApp.hydrate(app, hydratedProps);
HydrationApp.hydrate(drift, recoveryProps);
HydrationApp.hydrate(driftOff, { ...recoveryOffProps, __mikuru_hydration: { recover: false } });

const chunks: string[] = [];
for await (const chunk of renderToStream({ renderToString }, hydratedProps)) {
  chunks.push(chunk);
}

streamOutput.textContent = chunks.join("");
