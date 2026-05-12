import assert from "node:assert/strict";

const { compile } = await import("mikuru/compiler");
const env = await import("mikuru/env");
const { createMemoryHistory, createRouter } = await import("mikuru/router");
const { createDebugInspector, effect, emitDebugEvent, flushJobs, nextTick, queueJob, ref, watch, watchEffect } = await import("mikuru/runtime");
const { mikuru } = await import("mikuru/vite");

assert.deepEqual(Object.keys(env), []);

const result = compile(
  `<template><button @click="increment">count: {{ count }}</button></template>
<script>
import { ref } from "mikuru";
const count = ref(0);
function increment() {
  count.value += 1;
}
</script>`,
  { filename: "PackageSmoke.mikuru" }
);

assert.match(result.code, /export function mount/);
assert.match(result.code, /addEventListener\("click"/);
assert.equal(result.map.sources[0], "PackageSmoke.mikuru");
assert.match(result.map.sourcesContent[0], /const count = ref\(0\)/);

const count = ref(0);
let observed = 0;
const stop = effect(() => {
  observed = count.value;
});
count.value = 2;
stop();
count.value = 3;
assert.equal(observed, 2);

let watched = 0;
const stopWatch = watch(count, (next) => {
  watched = next;
});
count.value = 4;
stopWatch();
count.value = 5;
assert.equal(watched, 4);

let effectWatched = 0;
const stopWatchEffect = watchEffect(() => {
  effectWatched = count.value;
});
count.value = 6;
stopWatchEffect();
count.value = 7;
assert.equal(effectWatched, 6);

const scheduled = [];
let scheduledObserved = 0;
const stopScheduled = effect(() => {
  scheduledObserved = count.value;
}, {
  scheduler: (runner) => {
    scheduled.push(runner);
  }
});
count.value = 8;
assert.equal(scheduledObserved, 7);
scheduled.shift()?.();
stopScheduled();
assert.equal(scheduledObserved, 8);

const queued = [];
const queuedJob = () => queued.push("job");
queueJob(queuedJob);
queueJob(queuedJob);
await nextTick(() => queued.push("tick"));
assert.deepEqual(queued, ["job", "tick"]);

queueJob(() => queued.push("sync"));
flushJobs();
assert.deepEqual(queued, ["job", "tick", "sync"]);

let ticked = false;
await nextTick(() => {
  ticked = true;
});
assert.equal(ticked, true);

const inspector = createDebugInspector();
emitDebugEvent("package-smoke");
assert.equal(inspector.getEvents().at(-1).type, "package-smoke");
inspector.clearEvents();
assert.equal(inspector.getEvents().length, 0);

const router = createRouter({
  history: createMemoryHistory("/"),
  routes: [{ path: "/" }, { path: "/items/:id" }]
});
await router.push("/items/7?tab=details");
assert.equal(router.currentRoute.value.params.id, "7");
assert.equal(router.currentRoute.value.query.tab, "details");

const plugin = mikuru({ debug: true });
const transformed = await plugin.transform.call(
  {
    error(error) {
      throw new Error(typeof error === "string" ? error : error.message);
    }
  },
  `<template><p>{{ message }}</p></template><script>const message = "ok";</script>`,
  "PublishedPackage.mikuru"
);

assert.equal(typeof transformed, "object");
assert.match(transformed.code, /sourceURL=PublishedPackage\.mikuru\?mikuru-generated/);
