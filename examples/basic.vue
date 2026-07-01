<!--
  examples/basic.vue
  ------------------

  Reference Vue 3 component demonstrating every <WaveformPlayer> usage
  pattern this package supports. Copy/paste into your own Vue app
  (Vite, Nuxt, anywhere) to see the wrapper in action.

  Library setup (do this ONCE in your app entry — typically `main.ts`):

    import '@arraypress/waveform-player/dist/waveform-player.css';

  The wrapper does NOT auto-import the CSS for you — your bundler should
  own that decision.
-->
<script setup lang="ts">
import { ref } from 'vue';
import {
	WaveformPlayer,
	type WaveformPlayerExpose,
	type WaveformMarker,
} from '@arraypress/waveform-player-vue';

/* Imperative control via a template ref. */
const player = ref<WaveformPlayerExpose>();

/* Chapter markers (clickable seek points). */
const markers: WaveformMarker[] = [
	{ time: 0, label: 'Intro' },
	{ time: 60, label: 'Main topic', color: '#a855f7' },
	{ time: 600, label: 'Q&A' },
];

/* Dynamic track switching. */
const trackUrl = ref('/audio/track-1.mp3');
</script>

<template>
	<!-- 1 — Minimal -->
	<WaveformPlayer src="/audio/track.mp3" />

	<!-- 2 — Metadata, chosen style, and event listeners.
	     Note: `waveform-style` picks the look; the host element's CSS
	     `class`/`style` fall through automatically. -->
	<WaveformPlayer
		url="/audio/track.mp3"
		title="Midnight Dreams"
		artist="The Wavelength"
		artwork="/img/cover.jpg"
		waveform-style="bars"
		:bar-width="3"
		:bar-spacing="1"
		:height="80"
		@play="() => console.log('playing')"
		@pause="() => console.log('paused')"
		@timeupdate="(t, d) => console.log(`${t} / ${d}`)"
	/>

	<!-- 3 — Pre-computed peaks for instant load (recommended for catalogues) -->
	<WaveformPlayer url="/audio/track.mp3" waveform="/peaks/track.json" />

	<!-- 4 — Chapter markers -->
	<WaveformPlayer url="/audio/podcast.mp3" title="Episode 42" :markers="markers" :height="80" />

	<!-- 5 — Imperative control via ref -->
	<WaveformPlayer ref="player" url="/audio/track.mp3" title="Controlled" />
	<div style="display: flex; gap: 0.5rem; margin-top: 1rem">
		<button @click="player?.play()">Play</button>
		<button @click="player?.pause()">Pause</button>
		<button @click="player?.seekTo(30)">Skip to 0:30</button>
		<button @click="player?.setVolume(0.5)">Vol 50%</button>
	</div>

	<!-- 6 — Dynamic track switching. `:key` forces a clean remount; the
	     wrapper would also re-mount on url change via its own watcher. -->
	<WaveformPlayer :key="trackUrl" :url="trackUrl" title="Now playing" />
	<select v-model="trackUrl">
		<option value="/audio/track-1.mp3">Track 1</option>
		<option value="/audio/track-2.mp3">Track 2</option>
	</select>

	<!-- 7 — External audio mode (paired with @arraypress/waveform-bar) -->
	<WaveformPlayer
		url="/audio/track.mp3"
		audio-mode="external"
		waveform-style="seekbar"
		:show-info="false"
		:height="32"
	/>
</template>
