# Mikuru Media Players Usage

`MikuruVideoPlayer` and `MikuruAudioPlayer` are available from the `mikuru` package as `.mikuru` single-file components.

```mikuru
<script>
import MikuruAudioPlayer from "mikuru/components/MikuruAudioPlayer";
import MikuruVideoPlayer from "mikuru/components/MikuruVideoPlayer";
</script>
```

You can also use the explicit `.mikuru` subpaths:

```mikuru
<script>
import MikuruAudioPlayer from "mikuru/components/MikuruAudioPlayer.mikuru";
import MikuruVideoPlayer from "mikuru/components/MikuruVideoPlayer.mikuru";
</script>
```

## File Layout

Example:

```txt
src/
  App.mikuru
```

## Basic Usage

Video:

```mikuru
<template>
  <main>
    <MikuruVideoPlayer
      title="Sample Movie"
      subtitle="Mikuru custom video player"
      src="/media/sample.mp4"
      poster="/media/sample.jpg"
    />
  </main>
</template>

<script>
import MikuruVideoPlayer from "mikuru/components/MikuruVideoPlayer";
</script>
```

Audio:

```mikuru
<template>
  <main>
    <MikuruAudioPlayer
      title="Sample Track"
      artist="Mikuru"
      src="/media/sample.mp3"
    />
  </main>
</template>

<script>
import MikuruAudioPlayer from "mikuru/components/MikuruAudioPlayer";
</script>
```

## Video Files

With Vite, files in `public` are served from the site root.

Example:

```txt
public/
  media/
    sample.mp4
    sample.jpg
```

Use those files like this:

```mikuru
<MikuruVideoPlayer
  title="Sample Movie"
  subtitle="Demo video"
  src="/media/sample.mp4"
  poster="/media/sample.jpg"
/>
```

The `poster` prop is optional:

```mikuru
<MikuruVideoPlayer
  title="No Poster Video"
  src="/media/sample.mp4"
/>
```

## Required Vite Setup

Use the Mikuru Vite plugin:

```ts
import { defineConfig } from "vite";
import { mikuru } from "mikuru/vite";

export default defineConfig({
  plugins: [mikuru()]
});
```

## Props

Both players accept a `controls` array. When omitted, all standard controls are shown. Pass an empty array to hide the custom controls, or pass only the controls you want to display.

Live mode is enabled with `live`. Live players show a `LIVE` label and hide seek-oriented controls because a live stream does not have a stable timeline.

Video:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `src` | `string` | Yes | Video file URL. |
| `title` | `string` | No | Player title. Defaults to `Mikuru Video`. |
| `subtitle` | `string` | No | Small text under the title. |
| `poster` | `string` | No | Poster image URL. |
| `preload` | `string` | No | Native video preload setting. Defaults to `metadata`. |
| `width` | `string \| number` | No | Player width. Numbers are treated as pixels. |
| `height` | `string \| number` | No | Video area height. Numbers are treated as pixels. |
| `aspectRatio` | `string \| number` | No | Video area aspect ratio. Defaults to CSS `16 / 9` when omitted. |
| `qualityOptions` | `MikuruVideoPlayerQualityOption[]` | No | Quality choices shown in the settings menu. Each item accepts `label`, `src`, optional `id`, and optional `poster`. |
| `controls` | `MikuruVideoPlayerControl[]` | No | Custom controls to show. Allowed values: `play`, `seek`, `time`, `mute`, `volume`, `settings`, `fullscreen`. |
| `live` | `boolean` | No | Shows live mode and hides `seek` and `time` controls. |

Audio:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `src` | `string` | Yes | Audio file URL. |
| `title` | `string` | No | Player title. Defaults to `Mikuru Audio`. |
| `artist` | `string` | No | Small text shown under the title. |
| `preload` | `string` | No | Native audio preload setting. Defaults to `metadata`. |
| `controls` | `MikuruAudioPlayerControl[]` | No | Custom controls to show. Allowed values: `play`, `seek`, `time`, `skip`, `mute`, `volume`. |
| `live` | `boolean` | No | Shows live mode and hides `seek`, `time`, and `skip` controls. |

Examples:

```mikuru
<MikuruVideoPlayer
  title="Live keynote"
  src="/media/keynote.m3u8"
  live
  :controls="['play', 'mute', 'volume', 'settings', 'fullscreen']"
/>

<MikuruVideoPlayer
  title="Adaptive sample"
  src="/media/sample-720p.mp4"
  width="720px"
  aspect-ratio="4 / 3"
  :quality-options="[
    { label: '720p', src: '/media/sample-720p.mp4' },
    { label: '480p', src: '/media/sample-480p.mp4' }
  ]"
/>

<MikuruAudioPlayer
  title="Live radio"
  src="/media/radio.mp3"
  live
  :controls="['play', 'mute', 'volume']"
/>
```

## Events

Both media players forward native media events as component events with the current media state.

```mikuru
<MikuruVideoPlayer
  src="/media/sample.mp4"
  @play="handlePlay"
  @timeupdate="handleTimeUpdate"
  @ended="handleEnded"
/>

<MikuruAudioPlayer
  src="/media/sample.mp3"
  @play="handlePlay"
  @timeupdate="handleTimeUpdate"
  @ended="handleEnded"
/>
```

Available events:

| Event | Description |
| --- | --- |
| `loadedmetadata` | Metadata such as duration became available. |
| `timeupdate` | Playback position changed. |
| `durationchange` | Duration changed. |
| `play` | Playback started. |
| `pause` | Playback paused. |
| `ended` | Playback reached the end. |
| `seeked` | Seeking completed. |
| `volumechange` | Volume or mute state changed. |
| `ratechange` | Playback rate changed. |

The handler receives this payload:

```ts
type MediaPlayerEventPayload = {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  nativeEvent?: Event;
};
```

## Controls

`MikuruVideoPlayer` includes:

- Play and pause
- Click and drag seeking
- Keyboard seeking with `ArrowLeft`, `ArrowRight`, `Home`, and `End`
- Volume
- Mute
- Settings menu for quality, playback speed, and keyboard skip seconds
- Fullscreen
- Auto-hiding controls while playback continues

`MikuruAudioPlayer` includes:

- Play and pause
- Stop
- Back and forward skip controls
- Click and drag seeking
- Keyboard seeking with `ArrowLeft`, `ArrowRight`, `Home`, and `End`
- Volume
- Mute

## Notes

If you want to heavily customize the UI, copy the component into your app and import that local copy instead.
