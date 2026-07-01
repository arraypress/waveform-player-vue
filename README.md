<div align="center">

# Waveform Player for Vue

**A Vue 3 component wrapper for [`@arraypress/waveform-player`](https://github.com/arraypress/waveform-player).**
Typed props for every option, lifecycle `@events`, an exposed imperative API, and SSR-safe mounting.

[![npm version](https://img.shields.io/npm/v/@arraypress/waveform-player-vue?style=flat-square&labelColor=09090b&color=3f3f46)](https://www.npmjs.com/package/@arraypress/waveform-player-vue)
[![license](https://img.shields.io/npm/l/@arraypress/waveform-player-vue?style=flat-square&labelColor=09090b&color=3f3f46)](https://github.com/arraypress/waveform-player-vue/blob/main/LICENSE)

**[Documentation](https://docs.waveformplayer.com/)** &middot; [npm](https://www.npmjs.com/package/@arraypress/waveform-player-vue)

</div>

---

## Install

```bash
npm install @arraypress/waveform-player-vue @arraypress/waveform-player vue
```

```vue
<script setup lang="ts">
import { WaveformPlayer } from '@arraypress/waveform-player-vue';
import '@arraypress/waveform-player/dist/waveform-player.css';
</script>

<template>
  <WaveformPlayer :url="'/track.mp3'" title="My Song" artist="The Artist" />
</template>
```

## Documentation

Full guides, the complete prop list, events, and recipes live on the docs site.

### -> [docs.waveformplayer.com](https://docs.waveformplayer.com/)

[Vue guide](https://docs.waveformplayer.com/frameworks/vue/) — install, props, the imperative API, and SSR notes. All four Vue wrappers (player / bar / playlist) are on that page.

## License

MIT (c) [ArrayPress](https://github.com/arraypress).
