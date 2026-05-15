# Mikuru Package Components

Mikuru ships a small set of `.mikuru` single-file components that can be imported directly from the package.

```mikuru
<script>
import MikuruAudioPlayer from "mikuru/components/MikuruAudioPlayer";
import MikuruCarousel from "mikuru/components/MikuruCarousel";
import MikuruCodeBlock from "mikuru/components/MikuruCodeBlock";
import MikuruDropdown from "mikuru/components/MikuruDropdown";
import MikuruImageViewer from "mikuru/components/MikuruImageViewer";
import MikuruModal from "mikuru/components/MikuruModal";
import MikuruProgress from "mikuru/components/MikuruProgress";
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
  <MikuruCarousel title="Gallery" :images="slides" />
</template>

<script>
import MikuruCarousel from "mikuru/components/MikuruCarousel";

const slides = [
  {
    src: "/media/one.jpg",
    alt: "First slide",
    title: "First slide",
    caption: "A package-exported carousel slide."
  },
  {
    src: "/media/two.jpg",
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
  <MikuruToast :toasts="toasts" @dismiss="dismissToast" />
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
