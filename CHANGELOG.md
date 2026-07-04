# Changelog

All notable changes to `@arraypress/waveform-player-vue` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.3.0] — 2026-07-05

### Added

- Forward the core player's new localizable UI-string options —
  `seekValueText`, `playPauseLabel`, `speedLabel`, `artworkAlt`, and
  `unknownTrackText` — through to the underlying player. Requires
  `@arraypress/waveform-player@^1.20.0`.

## [0.1.0] — Unreleased

Initial release.

### Added

- `<WaveformPlayer>` Vue 3 component wrapping every option exposed by
  `@arraypress/waveform-player` as a typed prop:
  - Audio source (`url`, `src` alias, `audioMode`, `preload`)
  - Waveform visualisation (`waveformStyle`, `height`, `samples`,
    `barWidth`, `barSpacing`, `barRadius`, `waveform`)
  - Colours (`colorPreset`, `waveformColor`, `progressColor`,
    `waveformGradient` — strings or `string[]` gradients). DOM chrome
    (button, title, meta text) is themed via CSS variables
    (`--wfp-button-color`, `--wfp-text-color`,
    `--wfp-text-secondary-color`), not JS options.
  - Playback (`playbackRate`, `showPlaybackSpeed`, `playbackRates`)
  - UI toggles (`showControls`, `showInfo`, `showTime`, `showHoverTime`,
    `showBPM`, `buttonAlign`, `accessibleSeek`, `seekLabel`, `errorText`)
  - Markers (`markers`, `showMarkers`)
  - Metadata (`title`, `artist`, `artwork`, `album`)
  - Behaviour (`autoplay`, `singlePlay`, `playOnSeek`,
    `enableMediaSession`)
  - Icons (`playIcon`, `pauseIcon`)
- Lifecycle emits (`load`, `play`, `pause`, `end`, `timeupdate`,
  `error`), each forwarding the live `WaveformPlayer` instance. Wired
  through Vue's stable `emit`, so listeners can change without tearing
  the player down.
- Imperative API exposed via a template `ref` (`WaveformPlayerExpose`):
  `play()`, `pause()`, `togglePlay()`, `seekTo()`, `seekToPercent()`,
  `setVolume()`, `setPlaybackRate()`, `setPlayingState()`,
  `setProgress()`, `loadTrack()`, plus the raw `instance`.
- `class`, `style`, and `id` fall through to the host element via Vue's
  attribute inheritance; the base class `wfp-host` always applies.
- SSR / Nuxt safe: the core library is loaded via dynamic
  `import('@arraypress/waveform-player')` inside `onMounted` so the
  browser-only audio surface never runs server-side.
- Identity-prop re-mount: when any library-construction prop changes,
  the wrapper destroys the existing instance and creates a new one with
  the updated options. A monotonic mount token discards any in-flight
  async import that a newer mount (or unmount) has superseded.
- Public types are adopted from the core `@arraypress/waveform-player`
  (`WaveformStyle`, `ColorPreset`, `AudioMode`, `AudioPreload`,
  `ButtonAlign`, `WaveformMarker`, `WaveformPeaks`), re-exported here so
  the wrapper's types can never drift out of sync. `WaveformPlayerProps`
  is derived from the core's `WaveformPlayerOptions`.
- Dual ESM (`dist/index.js`) + CJS (`dist/index.cjs`) build via `tsup`,
  with `.d.ts` for both. Vue + the core library are externalised so they
  resolve to the consumer's copies.
- Vitest test suite (jsdom + `@vue/test-utils`) covering mount, option
  pass-through, the `src → url` alias, boolean-prop omission, emit
  forwarding, destroy-on-unmount, identity-prop re-mount, and the
  exposed imperative API. The core is mocked at the module boundary
  because jsdom has no Web Audio API.
- README with full prop reference, seven usage patterns, and the
  imperative-ref control example. `examples/basic.vue` with seven
  copy-paste-ready snippets.
