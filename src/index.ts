/**
 * @module @arraypress/waveform-player-vue
 * @description
 * Public entry point for the Vue 3 wrapper around
 * `@arraypress/waveform-player`.
 *
 * ```vue
 * <script setup lang="ts">
 * import { WaveformPlayer } from '@arraypress/waveform-player-vue';
 * </script>
 *
 * <template>
 *   <WaveformPlayer url="/audio/track.mp3" title="My Track" />
 * </template>
 * ```
 *
 * ## Types
 *
 * ```ts
 * import type {
 *   WaveformPlayerProps,
 *   WaveformPlayerEmits,
 *   WaveformPlayerExpose,
 *   WaveformStyle,
 *   WaveformMarker,
 *   WaveformPeaks,
 *   ColorPreset,
 *   AudioMode,
 *   AudioPreload,
 *   ButtonAlign,
 * } from '@arraypress/waveform-player-vue';
 * ```
 */

export { WaveformPlayer, default } from './WaveformPlayer';

export type {
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
} from './types';
