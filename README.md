# @arraypress/waveform-player-vue

Vue 3 component wrapper around [`@arraypress/waveform-player`](https://github.com/arraypress/waveform-player). Typed props for every library option, lifecycle `@events`, an exposed imperative API (`play() / pause() / seekTo() / loadTrack()`), and SSR-safe mounting.

The core library stays a zero-dependency vanilla-JS package that works anywhere a `<script>` tag does. This package adds the framework-native ergonomics Vue developers expect.

```vue
<script setup lang="ts">
import { WaveformPlayer } from '@arraypress/waveform-player-vue';
</script>

<template>
  <WaveformPlayer url="/audio/track.mp3" title="My Track" />
</template>
```

## Installation

```bash
npm install @arraypress/waveform-player-vue @arraypress/waveform-player vue
```

`vue` (^3.5) and `@arraypress/waveform-player` (^1.8) are peer dependencies — you bring them so you control the versions.

## Setup

Import the core library's CSS **once** in your app entry (Vite `main.ts`, Nuxt `app.vue` / a plugin, etc.):

```ts
import '@arraypress/waveform-player/dist/waveform-player.css';
```

The wrapper does **not** import the CSS for you — your bundler should own that decision. The library's JS is loaded dynamically inside `onMounted`, so SSR (Nuxt) environments don't trip over the browser-only audio APIs.

## Usage

### Basic

```vue
<WaveformPlayer src="/audio/track.mp3" />
```

> **Naming note.** `src` is shorthand for `url` (`url` wins if both are set). The visual style is `waveform-style` — **not** `style`, which (as on any element) is CSS. `class`, `style`, and `id` fall through to the host element automatically; the base class `wfp-host` is always applied.

### With metadata + chosen style

```vue
<WaveformPlayer
  url="/audio/track.mp3"
  title="Midnight Dreams"
  artist="The Wavelength"
  artwork="/img/cover.jpg"
  waveform-style="bars"
  :bar-width="3"
  :bar-spacing="1"
  :height="80"
/>
```

### Pre-computed peaks (recommended for catalogues)

```vue
<WaveformPlayer url="/audio/track.mp3" waveform="/peaks/track.json" />
```

Generate the JSON at build time with [`@arraypress/waveform-gen`](https://github.com/arraypress/waveform-gen). Removes the Web Audio decode cost (~1–5 s per file) from the render path.

### Chapter markers

```vue
<script setup lang="ts">
import type { WaveformMarker } from '@arraypress/waveform-player-vue';
const markers: WaveformMarker[] = [
  { time: 0, label: 'Intro' },
  { time: 60, label: 'Main topic', color: '#a855f7' },
  { time: 600, label: 'Q&A' },
];
</script>

<template>
  <WaveformPlayer url="/audio/podcast.mp3" :markers="markers" />
</template>
```

### Events

Every lifecycle event the core exposes is an emit, each forwarding the live instance:

```vue
<WaveformPlayer
  url="/audio/track.mp3"
  @load="(i) => console.log('loaded', i)"
  @play="() => console.log('playing')"
  @pause="() => console.log('paused')"
  @timeupdate="(currentTime, duration) => console.log(`${currentTime}s / ${duration}s`)"
  @end="() => console.log('finished')"
  @error="(err) => console.error('audio failed:', err)"
/>
```

| Event        | Payload                                                       |
| ------------ | ------------------------------------------------------------- |
| `load`       | `(instance)`                                                  |
| `play`       | `(instance)`                                                  |
| `pause`      | `(instance)`                                                  |
| `end`        | `(instance)`                                                  |
| `timeupdate` | `(currentTime: number, duration: number, instance)`           |
| `error`      | `(error: Error, instance)`                                    |

### Imperative control via ref

For "play this track when X happens" flows where wiring through props is awkward:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { WaveformPlayer, type WaveformPlayerExpose } from '@arraypress/waveform-player-vue';
const player = ref<WaveformPlayerExpose>();
</script>

<template>
  <WaveformPlayer ref="player" url="/audio/track.mp3" />
  <button @click="player?.togglePlay()">Play / Pause</button>
  <button @click="player?.seekTo(30)">Jump to 0:30</button>
  <button @click="player?.setVolume(0.5)">Vol 50%</button>
</template>
```

The exposed methods (`play()`, `pause()`, `togglePlay()`, `seekTo()`, `seekToPercent()`, `setVolume()`, `setPlaybackRate()`, `setPlayingState()`, `setProgress()`, `loadTrack()`) pass straight through to the underlying instance. `player.value?.instance` exposes the raw instance for anything not surfaced yet.

### External audio mode

When pairing with `@arraypress/waveform-bar` (or any audio controller you own), the player can render visualisation only and surrender playback:

```vue
<WaveformPlayer
  :url="track.url"
  audio-mode="external"
  waveform-style="seekbar"
  :show-info="false"
/>
```

Drive the visualisation from your controller via `player.value?.setProgress(currentTime, duration)` and `setPlayingState(playing)`.

## How prop changes are handled

When **any** prop the core library uses at construction time changes (`url`, `audioMode`, `waveformStyle`, `markers`, colours, sizing, …), the wrapper destroys the existing instance and creates a new one with the updated options. That's simpler and more correct than diffing every option and calling the right granular updater, and the core has built-in caches (waveform peaks keyed by URL) that make same-URL re-mounts cheap.

Events reach the instance through Vue's stable `emit`, so there's nothing for callback churn to tear down.

## Props

Every library option surfaces as a typed prop. Absent props are not forwarded, so the core library's own defaults apply. See [`src/types.ts`](./src/types.ts) and [`src/WaveformPlayer.ts`](./src/WaveformPlayer.ts) for the full list, and the [core docs](https://docs.waveformplayer.com) for per-option behaviour. Highlights:

- **Audio source** — `url`, `src` (alias), `audioMode`, `preload`
- **Waveform** — `waveformStyle`, `height`, `samples`, `barWidth`, `barSpacing`, `barRadius`, `waveform`
- **Colours** — `colorPreset`, `waveformColor`, `progressColor`, `buttonColor`, … (strings, or `string[]` for gradients)
- **Playback / UI** — `playbackRate`, `showPlaybackSpeed`, `playbackRates`, `showControls`, `showInfo`, `showTime`, `showHoverTime`, `showBPM`, `buttonAlign`, `accessibleSeek`, `seekLabel`, `errorText`
- **Markers / metadata** — `markers`, `showMarkers`, `title`, `artist`, `artwork`, `album`
- **Behaviour / icons** — `autoplay`, `singlePlay`, `playOnSeek`, `enableMediaSession`, `playIcon`, `pauseIcon`

## TypeScript

```ts
import type {
  WaveformPlayerProps,
  WaveformPlayerEmits,
  WaveformPlayerExpose,
  WaveformStyle,
  WaveformMarker,
  WaveformPeaks,
  ColorPreset,
  AudioMode,
  AudioPreload,
  ButtonAlign,
} from '@arraypress/waveform-player-vue';
```

The shared option types are re-exported straight from the core library, so they can never drift out of sync. The package ships `.d.ts` for both ESM and CJS consumers.

## Testing

```bash
npm test          # one-shot
npm run test:watch
npm run typecheck
npm run build     # emit dist/index.js, dist/index.cjs, dist/index.d.ts
```

The core library is mocked at the module boundary (jsdom has no Web Audio API). Tests cover mount, option pass-through, the `src → url` alias, boolean-prop omission, emit forwarding, destroy-on-unmount, identity-prop re-mount, and the exposed imperative API.

## License

MIT © ArrayPress
