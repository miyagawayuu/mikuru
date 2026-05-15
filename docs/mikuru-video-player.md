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

Video:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `src` | `string` | Yes | Video file URL. |
| `title` | `string` | No | Player title. Defaults to `Mikuru Video`. |
| `subtitle` | `string` | No | Small text under the title. |
| `poster` | `string` | No | Poster image URL. |
| `preload` | `string` | No | Native video preload setting. Defaults to `metadata`. |

Audio:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `src` | `string` | Yes | Audio file URL. |
| `title` | `string` | No | Player title. Defaults to `Mikuru Audio`. |
| `artist` | `string` | No | Small text shown under the title. |
| `preload` | `string` | No | Native audio preload setting. Defaults to `metadata`. |

## Controls

`MikuruVideoPlayer` includes:

- Play and pause
- Stop
- Click and drag seeking
- Keyboard seeking with `ArrowLeft`, `ArrowRight`, `Home`, and `End`
- Volume
- Mute
- Playback speed
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
