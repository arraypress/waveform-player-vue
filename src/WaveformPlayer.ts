/**
 * WaveformPlayer.ts
 * -----------------
 *
 * Vue 3 wrapper around `@arraypress/waveform-player`. Mounts a player
 * instance into a `<div>` on mount, tears it down on unmount, and
 * re-mounts when any construction prop changes.
 *
 * Authored as a `defineComponent` with a render function (rather than
 * an SFC) so the package builds with `tsup` — the same dual ESM/CJS +
 * `.d.ts` toolchain as the React wrapper — and ships no `.vue`
 * compile step for consumers to worry about.
 *
 * Like the React counterpart, non-identity prop changes also re-create
 * the instance, which is simpler than diffing every option and calling
 * the right granular updater. The trade-off is acceptable because the
 * library re-uses waveform peaks cached by URL, so same-URL re-mounts
 * are cheap, and per-render churn on a player widget is rare.
 *
 * ## Library setup
 *
 * This component does **not** load the core library's CSS for you.
 * Import it once at your app entry:
 *
 * ```ts
 * import '@arraypress/waveform-player/dist/waveform-player.css';
 * ```
 *
 * The library's JS is imported dynamically inside `onMounted` so it
 * only loads on the client (SSR-safe).
 *
 * @module WaveformPlayer
 */
import {
	defineComponent,
	h,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
	type PropType,
} from 'vue';
import type { WaveformPlayer as WaveformPlayerInstance } from '@arraypress/waveform-player';
import type {
	AudioMode,
	AudioPreload,
	ButtonAlign,
	ColorPreset,
	WaveformMarker,
	WaveformPeaks,
	WaveformStyle,
} from '@arraypress/waveform-player';

/** Minimal structural view of the methods the wrapper calls. */
type PlayerInstance = {
	destroy?: () => void;
	play?: () => Promise<void> | undefined;
	pause?: () => void;
	togglePlay?: () => void;
	seekTo?: (s: number) => void;
	seekToPercent?: (p: number) => void;
	setVolume?: (v: number) => void;
	setPlaybackRate?: (r: number) => void;
	setPlayingState?: (p: boolean) => void;
	setProgress?: (c: number, d: number) => void;
	loadTrack?: (u: string, t?: string, s?: string, o?: Record<string, unknown>) => Promise<void>;
};

/**
 * Convert resolved props into the option shape the core library
 * accepts. Most fields pass straight through; this helper keeps the
 * option-building logic isolated from lifecycle. Callbacks are
 * intentionally NOT mapped here — they're wired to `emit` in the
 * mount routine.
 *
 * @param p - The component's resolved props.
 * @returns An options object to pass into `new WaveformPlayer(el, …)`.
 */
function buildLibraryOptions(p: Record<string, unknown>): Record<string, unknown> {
	const opts: Record<string, unknown> = {};
	const set = (key: string, value: unknown) => {
		if (value !== undefined && value !== null) opts[key] = value;
	};

	/* Audio source — `src` is the core's shorthand alias for `url`. */
	if (p.url !== undefined) opts.url = p.url;
	else if (p.src !== undefined) opts.url = p.src;
	set('audioMode', p.audioMode);
	set('preload', p.preload);

	/* Waveform visualisation */
	set('waveformStyle', p.waveformStyle);
	set('height', p.height);
	set('samples', p.samples);
	set('barWidth', p.barWidth);
	set('barSpacing', p.barSpacing);
	set('barRadius', p.barRadius);
	set('waveform', p.waveform);

	/* Colours */
	set('colorPreset', p.colorPreset);
	set('waveformColor', p.waveformColor);
	set('progressColor', p.progressColor);
	set('buttonColor', p.buttonColor);
	set('buttonHoverColor', p.buttonHoverColor);
	set('textColor', p.textColor);
	set('textSecondaryColor', p.textSecondaryColor);
	set('backgroundColor', p.backgroundColor);
	set('borderColor', p.borderColor);

	/* Playback controls */
	set('playbackRate', p.playbackRate);
	set('showPlaybackSpeed', p.showPlaybackSpeed);
	set('playbackRates', p.playbackRates);

	/* UI toggles */
	set('showControls', p.showControls);
	set('showInfo', p.showInfo);
	set('showTime', p.showTime);
	set('showHoverTime', p.showHoverTime);
	set('showBPM', p.showBPM);
	set('bpm', p.bpm);
	set('buttonAlign', p.buttonAlign);
	set('layout', p.layout);
	set('buttonStyle', p.buttonStyle);
	set('buttonSize', p.buttonSize);

	/* Accessibility */
	set('accessibleSeek', p.accessibleSeek);
	set('seekLabel', p.seekLabel);

	/* Error UI */
	set('errorText', p.errorText);

	/* Markers */
	set('markers', p.markers);
	set('showMarkers', p.showMarkers);

	/* Content metadata */
	set('title', p.title);
	set('artist', p.artist);
	set('artwork', p.artwork);
	set('album', p.album);

	/* Behaviour */
	set('autoplay', p.autoplay);
	set('singlePlay', p.singlePlay);
	set('playOnSeek', p.playOnSeek);
	set('enableMediaSession', p.enableMediaSession);

	/* Icons */
	set('playIcon', p.playIcon);
	set('pauseIcon', p.pauseIcon);

	return opts;
}

/**
 * `WaveformPlayer` — Vue 3 component wrapping
 * `@arraypress/waveform-player`.
 *
 * Every core library option is accepted as a typed prop. Playback
 * lifecycle events surface as emits (`@load`, `@play`, `@pause`,
 * `@end`, `@timeupdate`, `@error`), each forwarding the live instance.
 * An imperative API (`play`, `seekTo`, `loadTrack`, …) is exposed
 * through a template `ref`.
 *
 * `class`, `style`, and `id` fall through to the root element via
 * Vue's attribute inheritance — the base class `wfp-host` is always
 * applied.
 */
export const WaveformPlayer = defineComponent({
	name: 'WaveformPlayer',
	props: {
		// ── Audio source ───────────────────────────────────────────────
		/** Audio file URL. Provide one of `url` or `src`. */
		url: { type: String, default: undefined },
		/** Shorthand alias for `url` (`url` wins if both are set). */
		src: { type: String, default: undefined },
		audioMode: { type: String as PropType<AudioMode>, default: undefined },
		preload: { type: String as PropType<AudioPreload>, default: undefined },

		// ── Waveform visualisation ─────────────────────────────────────
		waveformStyle: { type: String as PropType<WaveformStyle>, default: undefined },
		height: { type: Number, default: undefined },
		samples: { type: Number, default: undefined },
		barWidth: { type: Number, default: undefined },
		barSpacing: { type: Number, default: undefined },
		barRadius: { type: Number, default: undefined },
		waveform: { type: [Array, String] as PropType<WaveformPeaks>, default: undefined },

		// ── Colours (string, or string[] for gradients) ────────────────
		colorPreset: { type: String as PropType<ColorPreset>, default: undefined },
		waveformColor: { type: [String, Array] as PropType<string | string[]>, default: undefined },
		progressColor: { type: [String, Array] as PropType<string | string[]>, default: undefined },
		buttonColor: { type: String, default: undefined },
		buttonHoverColor: { type: String, default: undefined },
		textColor: { type: String, default: undefined },
		textSecondaryColor: { type: String, default: undefined },
		backgroundColor: { type: String, default: undefined },
		borderColor: { type: String, default: undefined },

		// ── Playback controls ──────────────────────────────────────────
		playbackRate: { type: Number, default: undefined },
		showPlaybackSpeed: { type: Boolean, default: undefined },
		playbackRates: { type: Array as PropType<number[]>, default: undefined },

		// ── UI toggles ─────────────────────────────────────────────────
		showControls: { type: Boolean, default: undefined },
		showInfo: { type: Boolean, default: undefined },
		showTime: { type: Boolean, default: undefined },
		showHoverTime: { type: Boolean, default: undefined },
		showBPM: { type: Boolean, default: undefined },
		bpm: { type: Number, default: undefined },
		buttonAlign: { type: String as PropType<ButtonAlign>, default: undefined },
		layout: { type: String, default: undefined },
		buttonStyle: { type: String, default: undefined },
		buttonSize: { type: String, default: undefined },

		// ── Accessibility ──────────────────────────────────────────────
		accessibleSeek: { type: Boolean, default: undefined },
		seekLabel: { type: String, default: undefined },

		// ── Error UI ───────────────────────────────────────────────────
		errorText: { type: String, default: undefined },

		// ── Markers ────────────────────────────────────────────────────
		markers: { type: Array as PropType<WaveformMarker[]>, default: undefined },
		showMarkers: { type: Boolean, default: undefined },

		// ── Content metadata ───────────────────────────────────────────
		title: { type: String, default: undefined },
		artist: { type: String, default: undefined },
		artwork: { type: String, default: undefined },
		album: { type: String, default: undefined },

		// ── Behaviour ──────────────────────────────────────────────────
		autoplay: { type: Boolean, default: undefined },
		singlePlay: { type: Boolean, default: undefined },
		playOnSeek: { type: Boolean, default: undefined },
		enableMediaSession: { type: Boolean, default: undefined },

		// ── Icons ──────────────────────────────────────────────────────
		playIcon: { type: String, default: undefined },
		pauseIcon: { type: String, default: undefined },
	},
	emits: ['load', 'play', 'pause', 'end', 'timeupdate', 'error'],
	setup(props, { emit, expose }) {
		const container = ref<HTMLDivElement | null>(null);
		let instance: PlayerInstance | null = null;
		/* Monotonic token: every (re)mount bumps it; an in-flight async
		 * import whose token is stale (superseded by a newer mount or by
		 * unmount) bails instead of attaching a zombie instance. */
		let mountToken = 0;

		function teardown() {
			if (instance && typeof instance.destroy === 'function') {
				try {
					instance.destroy();
				} catch (err) {
					console.warn('[WaveformPlayerVue] destroy() threw:', err);
				}
			}
			instance = null;
		}

		function mount() {
			const myToken = ++mountToken;
			const el = container.value;
			if (!el) return;

			/* Browser-only library — defer the import to the client so SSR
			 * doesn't evaluate the audio + canvas + fetch surface. */
			void import('@arraypress/waveform-player')
				.then((mod) => {
					if (myToken !== mountToken) return; // superseded
					const target = container.value;
					if (!target) return;

					const Ctor = (mod.default ??
						(mod as { WaveformPlayer?: unknown }).WaveformPlayer) as {
						new (el: HTMLElement, opts: Record<string, unknown>): PlayerInstance;
					};
					if (typeof Ctor !== 'function') {
						console.error('[WaveformPlayerVue] Failed to resolve WaveformPlayer constructor from module.');
						return;
					}

					const opts = buildLibraryOptions(props as unknown as Record<string, unknown>);
					/* Wire callbacks to emits. `emit` is stable, so events
					 * always reach the latest listeners without re-mounting. */
					opts.onLoad = (i: WaveformPlayerInstance) => emit('load', i);
					opts.onPlay = (i: WaveformPlayerInstance) => emit('play', i);
					opts.onPause = (i: WaveformPlayerInstance) => emit('pause', i);
					opts.onEnd = (i: WaveformPlayerInstance) => emit('end', i);
					opts.onTimeUpdate = (c: number, d: number, i: WaveformPlayerInstance) =>
						emit('timeupdate', c, d, i);
					opts.onError = (e: Error, i: WaveformPlayerInstance) => emit('error', e, i);

					instance = new Ctor(target, opts);
				})
				.catch((err) => {
					console.error('[WaveformPlayerVue] Failed to load library:', err);
				});
		}

		onMounted(mount);
		onBeforeUnmount(() => {
			mountToken++; // invalidate any in-flight import
			teardown();
		});

		/* Re-mount on any construction-prop change. Listed exhaustively
		 * (mirrors the React wrapper's dep array) so the intent is
		 * explicit. Callbacks reach the instance via stable `emit`, so
		 * there's nothing here for them to churn. */
		watch(
			() => [
				props.url,
				props.src,
				props.audioMode,
				props.preload,
				props.waveformStyle,
				props.height,
				props.samples,
				props.barWidth,
				props.barSpacing,
				props.barRadius,
				props.waveform,
				props.colorPreset,
				props.waveformColor,
				props.progressColor,
				props.buttonColor,
				props.buttonHoverColor,
				props.textColor,
				props.textSecondaryColor,
				props.backgroundColor,
				props.borderColor,
				props.playbackRate,
				props.showPlaybackSpeed,
				props.playbackRates,
				props.showControls,
				props.showInfo,
				props.showTime,
				props.showHoverTime,
				props.showBPM,
				props.bpm,
				props.buttonAlign,
				props.layout,
				props.buttonStyle,
				props.buttonSize,
				props.accessibleSeek,
				props.seekLabel,
				props.errorText,
				props.markers,
				props.showMarkers,
				props.title,
				props.artist,
				props.artwork,
				props.album,
				props.autoplay,
				props.singlePlay,
				props.playOnSeek,
				props.enableMediaSession,
				props.playIcon,
				props.pauseIcon,
			],
			() => {
				teardown();
				mount();
			}
		);

		/* Imperative API on a template ref. Each method is a thin
		 * pass-through; calls before the async instance mounts are
		 * no-ops. */
		expose({
			play() {
				return instance?.play?.();
			},
			pause() {
				instance?.pause?.();
			},
			togglePlay() {
				instance?.togglePlay?.();
			},
			seekTo(seconds: number) {
				instance?.seekTo?.(seconds);
			},
			seekToPercent(percent: number) {
				instance?.seekToPercent?.(percent);
			},
			setVolume(volume: number) {
				instance?.setVolume?.(volume);
			},
			setPlaybackRate(rate: number) {
				instance?.setPlaybackRate?.(rate);
			},
			setPlayingState(playing: boolean) {
				instance?.setPlayingState?.(playing);
			},
			setProgress(currentTime: number, duration: number) {
				instance?.setProgress?.(currentTime, duration);
			},
			async loadTrack(
				url: string,
				title?: string,
				artist?: string,
				options?: Record<string, unknown>
			) {
				if (!instance?.loadTrack) return;
				await instance.loadTrack(url, title, artist, options);
			},
			get instance() {
				return instance as unknown as WaveformPlayerInstance | null;
			},
		});

		return () => h('div', { ref: container, class: 'wfp-host' });
	},
});

export default WaveformPlayer;
