import HydrationApp from "./App.mikuru?hydrate";
import AsyncShowcase from "./AsyncShowcase.mikuru?hydrate";
import { renderToString } from "./App.mikuru?ssr";
import { renderToString as renderAsyncShowcaseToString } from "./AsyncShowcase.mikuru?ssr";
import { renderToStream } from "mikuru/server";
import type { MikuruDebugEvent } from "mikuru/runtime";

import "./style.css";

const hydrationEvents: MikuruDebugEvent[] = [];
globalThis.__MIKURU_DEVTOOLS__ = {
  events: hydrationEvents
};

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
const asyncShowcase = document.getElementById("async-showcase");
const asyncModalRoot = document.getElementById("async-modal-root");
const hydrationDiagnostics = document.getElementById("hydration-diagnostics");

if (!app || !drift || !driftOff || !streamOutput || !asyncShowcase || !asyncModalRoot || !hydrationDiagnostics) {
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

const asyncTeleports: Record<string, string> = {};
asyncShowcase.innerHTML = await renderAsyncShowcaseToString({ __mikuru_teleports: asyncTeleports });
asyncModalRoot.innerHTML = asyncTeleports["#async-modal-root"] ?? "";
AsyncShowcase.hydrate(asyncShowcase);

for (const event of hydrationEvents.filter((entry) => entry.type === "hydration:warning")) {
  const payload = event.payload ?? {};
  const item = document.createElement("li");
  item.textContent = `${payload.kind ?? "hydration"} | ${payload.action ?? "sync-dom"} | ${payload.domPath ?? payload.component ?? "unknown"} | ${payload.message ?? ""}`;
  hydrationDiagnostics.appendChild(item);
}
