# Mikuru Package Components

Mikuru ships a small set of `.mikuru` single-file components that can be imported directly from the package.

```mikuru
<script>
import MikuruAudioPlayer from "mikuru/components/MikuruAudioPlayer";
import MikuruAccordion from "mikuru/components/MikuruAccordion";
import MikuruCarousel from "mikuru/components/MikuruCarousel";
import MikuruCheckbox from "mikuru/components/MikuruCheckbox";
import MikuruCodeBlock from "mikuru/components/MikuruCodeBlock";
import MikuruCombobox from "mikuru/components/MikuruCombobox";
import MikuruDropdown from "mikuru/components/MikuruDropdown";
import MikuruFooter from "mikuru/components/MikuruFooter";
import MikuruHeader from "mikuru/components/MikuruHeader";
import MikuruImageViewer from "mikuru/components/MikuruImageViewer";
import MikuruModal from "mikuru/components/MikuruModal";
import MikuruProgress from "mikuru/components/MikuruProgress";
import MikuruSelect from "mikuru/components/MikuruSelect";
import MikuruSideMenu from "mikuru/components/MikuruSideMenu";
import MikuruTabs from "mikuru/components/MikuruTabs";
import MikuruTextarea from "mikuru/components/MikuruTextarea";
import MikuruTextInput from "mikuru/components/MikuruTextInput";
import MikuruToast from "mikuru/components/MikuruToast";
import MikuruToolTip from "mikuru/components/MikuruToolTip";
import MikuruVideoPlayer from "mikuru/components/MikuruVideoPlayer";
</script>
```

Explicit `.mikuru` subpaths are also exported:

```js
import MikuruModal from "mikuru/components/MikuruModal.mikuru";
```

## Image Viewer

```mikuru
<template>
  <MikuruImageViewer
    src="/media/photo.jpg"
    alt="Night city"
    caption="Night city"
  />
</template>

<script>
import MikuruImageViewer from "mikuru/components/MikuruImageViewer";
</script>
```

Props:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `src` | `string` | Yes | Image URL. |
| `alt` | `string` | No | Image alt text. Defaults to `Mikuru image`. |
| `caption` | `string` | No | Caption below the viewer. |
| `minZoom` | `number` | No | Minimum zoom. Defaults to `1`. |
| `maxZoom` | `number` | No | Maximum zoom. Defaults to `4`. |
| `zoomStep` | `number` | No | Zoom increment. Defaults to `0.25`. |

## Modal

```mikuru
<template>
  <button type="button" @click="openModal">Open</button>
  <MikuruModal
    :open="modalOpen"
    title="Confirm action"
    body="This modal is imported from the mikuru package."
    @close="closeModal"
  />
</template>

<script>
import { ref } from "mikuru";
import MikuruModal from "mikuru/components/MikuruModal";

const modalOpen = ref(false);

function openModal() {
  modalOpen.value = true;
}

function closeModal() {
  modalOpen.value = false;
}
</script>
```

The modal also accepts default slot content:

```mikuru
<MikuruModal :open="modalOpen" title="Details" @close="closeModal">
  <p>Custom modal body.</p>
</MikuruModal>
```

Props:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | No | Controls whether the modal is shown. |
| `title` | `string` | No | Dialog label and header text. |
| `body` | `string` | No | Fallback body text when no slot is provided. |
| `footer` | `string` | No | Optional footer text. |
| `closeOnBackdrop` | `boolean` | No | Allows backdrop click to emit `close`. Defaults to `true`. |
| `closeOnEscape` | `boolean` | No | Allows Escape to emit `close`. Defaults to `true`. |

Events:

| Event | Description |
| --- | --- |
| `close` | Emitted when the close button, backdrop, or Escape requests closing. |

## Carousel

```mikuru
<template>
  <MikuruCarousel title="Gallery" :images="slides" thumbnails />
</template>

<script>
import MikuruCarousel from "mikuru/components/MikuruCarousel";

const slides = [
  {
    src: "/media/one.jpg",
    thumbnail: "/media/one-thumb.jpg",
    alt: "First slide",
    title: "First slide",
    caption: "A package-exported carousel slide."
  },
  {
    src: "/media/two.jpg",
    thumbnail: "/media/two-thumb.jpg",
    alt: "Second slide",
    title: "Second slide",
    caption: "Keyboard navigation and dots are included."
  }
];
</script>
```

Props:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `images` | `Array<string \| object>` | No | Slide image list. Objects support `src`, `alt`, `title`, and `caption`. |
| `title` | `string` | No | Carousel accessible label. Defaults to `Mikuru Carousel`. |
| `autoplay` | `boolean` | No | Enables automatic slide changes. |
| `interval` | `number` | No | Autoplay interval in milliseconds. Defaults to `5000`. |
| `emptyTitle` | `string` | No | Empty state title. |
| `emptyMessage` | `string` | No | Empty state message. |

## Media Players

See `docs/mikuru-video-player.md` for video and audio player examples.

## Toast

```mikuru
<template>
  <MikuruToast :toasts="toasts" :duration="5000" @dismiss="dismissToast" />
</template>

<script>
import MikuruToast from "mikuru/components/MikuruToast";

const toasts = [
  { id: "saved", title: "Saved", message: "Your changes were saved.", tone: "success" }
];

function dismissToast(id) {
  console.log(id);
}
</script>
```

Toasts auto-dismiss after `duration` milliseconds. Set `duration` to `0` to keep them open until the close button is pressed, or set `duration` on an individual toast item to override the stack default.

## Dropdown

```mikuru
<template>
  <MikuruDropdown label="Actions" :items="items" @select="selectItem" />
</template>

<script>
import MikuruDropdown from "mikuru/components/MikuruDropdown";

const items = [
  { label: "Edit", value: "edit", description: "Change this item" },
  { label: "Archive", value: "archive" }
];

function selectItem(value) {
  console.log(value);
}
</script>
```

## Tabs

```mikuru
<template>
  <MikuruTabs label="Project sections" :items="tabs" m-model="activeTab" />
</template>

<script>
import { ref } from "mikuru";
import MikuruTabs from "mikuru/components/MikuruTabs";

const activeTab = ref("overview");
const tabs = [
  { label: "Overview", value: "overview", panel: "Project health and owners." },
  { label: "Activity", value: "activity", panel: "Recent changes and notes." }
];
</script>
```

`MikuruTabs` also exposes the active item to the default slot:

```mikuru
<MikuruTabs :items="tabs" m-model="activeTab">
  <template #default="{ label, panel }">
    <strong>{{ label }}</strong>
    <p>{{ panel }}</p>
  </template>
</MikuruTabs>
```

## Accordion

```mikuru
<template>
  <MikuruAccordion :items="sections" m-model="openSection" />
</template>

<script>
import { ref } from "mikuru";
import MikuruAccordion from "mikuru/components/MikuruAccordion";

const openSection = ref("compile");
const sections = [
  { label: "Compile", value: "compile", panel: "Generated DOM updates." },
  { label: "Hydrate", value: "hydrate", panel: "Reuse server-rendered DOM." }
];
</script>
```

Use `multiple` with an array model to keep more than one panel open.

## Form Controls

```mikuru
<template>
  <MikuruTextInput label="Title" placeholder="Task title" m-model="title" />
  <MikuruTextarea label="Notes" :rows="5" m-model="notes" />
  <MikuruCheckbox label="Published" description="Visible to readers" m-model="published" />
</template>

<script>
import { ref } from "mikuru";
import MikuruCheckbox from "mikuru/components/MikuruCheckbox";
import MikuruTextarea from "mikuru/components/MikuruTextarea";
import MikuruTextInput from "mikuru/components/MikuruTextInput";

const title = ref("");
const notes = ref("");
const published = ref(false);
</script>
```

## Select and Combobox

```mikuru
<template>
  <MikuruSelect label="Owner" :options="owners" m-model="owner" />
  <MikuruCombobox label="Assignee" :options="owners" m-model="assignee" />
</template>

<script>
import { ref } from "mikuru";
import MikuruCombobox from "mikuru/components/MikuruCombobox";
import MikuruSelect from "mikuru/components/MikuruSelect";

const owner = ref("compiler");
const assignee = ref("runtime");
const owners = [
  { label: "Compiler", value: "compiler" },
  { label: "Runtime", value: "runtime", description: "Reactivity and DOM helpers" }
];
</script>
```

## Header, Footer, and Side Menu

```mikuru
<template>
  <MikuruHeader title="Console" logo="M" :items="nav" m-model="section" />
  <div class="shell">
    <MikuruSideMenu title="Workspace" :items="menu" m-model="section" />
    <main>{{ section }}</main>
  </div>
  <MikuruFooter title="Mikuru" description="Compile-first UI" :links="links" note="MIT licensed." />
</template>

<script>
import { ref } from "mikuru";
import MikuruFooter from "mikuru/components/MikuruFooter";
import MikuruHeader from "mikuru/components/MikuruHeader";
import MikuruSideMenu from "mikuru/components/MikuruSideMenu";

const section = ref("overview");
const nav = [
  { label: "Overview", value: "overview" },
  { label: "Settings", value: "settings" }
];
const menu = [
  { label: "Overview", value: "overview", icon: "O" },
  { label: "Builds", value: "builds", icon: "B", badge: "3" }
];
const links = [
  { label: "Docs", value: "docs", href: "#" },
  { label: "Changelog", value: "changelog", href: "#" }
];
</script>
```

## ToolTip

```mikuru
<template>
  <MikuruToolTip text="Runs the current task" label="Run" placement="top" />
</template>

<script>
import MikuruToolTip from "mikuru/components/MikuruToolTip";
</script>
```

## Progress

```mikuru
<template>
  <MikuruProgress label="Upload" :value="72" :max="100" />
</template>

<script>
import MikuruProgress from "mikuru/components/MikuruProgress";
</script>
```

For an indeterminate state:

```mikuru
<MikuruProgress label="Loading" indeterminate />
```

## Code Block

```mikuru
<template>
  <MikuruCodeBlock language="js" :code="source" />
</template>

<script>
import MikuruCodeBlock from "mikuru/components/MikuruCodeBlock";

const source = `import { ref } from "mikuru";
const count = ref(0);`;
</script>
```
