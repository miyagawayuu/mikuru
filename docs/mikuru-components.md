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
import MikuruEmbedPlayer from "mikuru/components/MikuruEmbedPlayer";
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

## Embed Player

`MikuruEmbedPlayer` renders iframe-based players for hosted video platforms. Use `MikuruVideoPlayer` for direct media files such as `.mp4`; use `MikuruEmbedPlayer` for provider URLs.

```mikuru
<template>
  <MikuruEmbedPlayer
    url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    title="Release demo"
    caption="YouTube embed with privacy mode"
    privacy
  />
</template>

<script>
import MikuruEmbedPlayer from "mikuru/components/MikuruEmbedPlayer";
</script>
```

You can also bypass URL detection by passing `provider` and `videoId`:

```mikuru
<MikuruEmbedPlayer provider="vimeo" video-id="76979871" title="Vimeo demo" />
```

Supported providers: YouTube, Vimeo, Dailymotion, Twitch, Niconico, TikTok, Bilibili, Wistia, and generic iframe embed URLs.

Props:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | `string` | No | Provider video URL or iframe embed URL. |
| `provider` | `string` | No | `auto`, `youtube`, `vimeo`, `dailymotion`, `twitch`, `niconico`, `tiktok`, `bilibili`, `wistia`, or `generic`. Defaults to `auto`. |
| `videoId` | `string` | No | Explicit provider video id. Useful when no canonical URL is available. |
| `title` | `string` | No | iframe title and caption heading. Defaults to `Embedded video`. |
| `caption` | `string` | No | Caption text below the player. |
| `width` | `string \| number` | No | Player width. Defaults to `100%`. Numbers are treated as pixels. |
| `height` | `string \| number` | No | Optional fixed height. Numbers are treated as pixels. |
| `aspectRatio` | `string \| number` | No | CSS aspect ratio for the frame. Defaults to `16 / 9`. |
| `autoplay` | `boolean` | No | Requests provider autoplay. |
| `muted` | `boolean` | No | Requests muted playback where supported. |
| `controls` | `boolean` | No | Requests provider controls. Defaults to `true`. |
| `loop` | `boolean` | No | Requests looping where supported. |
| `privacy` | `boolean` | No | Uses YouTube's `youtube-nocookie.com` embed domain. |
| `start` | `number` | No | Start time in seconds where supported. |
| `end` | `number` | No | End time in seconds where supported. |
| `playlist` | `string` | No | Provider playlist id or loop playlist hint where supported. |
| `parent` | `string` | No | Twitch parent domain. Defaults to the current hostname in the browser. |
| `loading` | `string` | No | iframe loading mode. Defaults to `lazy`. |
| `allow` | `string` | No | iframe allow policy override. |
| `referrerPolicy` | `string` | No | iframe referrer policy. Defaults to `strict-origin-when-cross-origin`. |
| `sandbox` | `string` | No | Optional iframe sandbox policy. Omitted by default. |
| `emptyTitle` | `string` | No | Fallback title when the URL is unsupported. |
| `emptyMessage` | `string` | No | Fallback message when the URL is unsupported. |

Events:

| Event | Description |
| --- | --- |
| `load` | Emitted when the iframe load event fires. |
| `unsupported` | Emitted when URL detection cannot produce an embed source. |

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
