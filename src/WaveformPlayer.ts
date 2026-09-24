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
	computed,
	defineComponent,
	h,
	normalizeClass,
	onBeforeUnmount,
	onMounted,
	onUpdated,
	ref,
	watch,
	type PropType,
} from 'vue';
import type { WaveformPlayer as WaveformPlayerInstance } from '@arraypress/waveform-player';
import type {
	AudioMode,
	AudioPreload,
	AudioCrossOrigin,
	ButtonAlign,
	ColorPreset,
	WaveformMarker,
	WaveformPeaks,
	WaveformPlayerOptions,
	WaveformStyle,
} from '@arraypress/waveform-player';

/**
 * Vue's runtime prop declarations need an explicit `PropType`, but the core
 * declares `artworkPosition` inline rather than exporting a named union the way
 * it does for `ButtonAlign`/`WaveformStyle`. Derive it from the option type
 * instead of restating `'info' | 'button'` here, so a new placement in the core
 * can't leave this wrapper silently behind.
 */
type ArtworkPosition = NonNullable<WaveformPlayerOptions['artworkPosition']>;
/** Same reasoning as `ArtworkPosition`: the core declares this union inline. */
type WaveformGradient = NonNullable<WaveformPlayerOptions['waveformGradient']>;
/** Media Session track-navigation handler (`onNextTrack` / `onPreviousTrack`). */
type TrackNavHandler = (instance: WaveformPlayerInstance) => void;

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
	set('crossOrigin', p.crossOrigin);

	/* Waveform visualisation */
	set('waveformStyle', p.waveformStyle);
	set('height', p.height);
	set('samples', p.samples);
	set('barWidth', p.barWidth);
	set('barSpacing', p.barSpacing);
	set('barRadius', p.barRadius);
	set('waveformGradient', p.waveformGradient);
	set('waveform', p.waveform);

	/* Colours */
	set('colorPreset', p.colorPreset);
	set('waveformColor', p.waveformColor);
	set('progressColor', p.progressColor);

	/* Playback controls */
	set('playbackRate', p.playbackRate);
	set('showPlaybackSpeed', p.showPlaybackSpeed);
	set('playbackRates', p.playbackRates);

	/* UI toggles */
	set('showControls', p.showControls);
	set('showInfo', p.showInfo);
	set('showTime', p.showTime);
	set('showHoverTime', p.showHoverTime);
	set('seekHandle', p.seekHandle);
	set('showBPM', p.showBPM);
	set('bpm', p.bpm);
	set('buttonAlign', p.buttonAlign);
	set('layout', p.layout);
	set('buttonStyle', p.buttonStyle);
	set('buttonSize', p.buttonSize);
	set('buttonRadius', p.buttonRadius);

	/* Accessibility */
	set('accessibleSeek', p.accessibleSeek);
	set('seekLabel', p.seekLabel);
	set('seekValueText', p.seekValueText);
	set('playPauseLabel', p.playPauseLabel);
	set('speedLabel', p.speedLabel);

	/* Error UI */
	set('errorText', p.errorText);
	set('unknownTrackText', p.unknownTrackText);

	/* Markers */
	set('markers', p.markers);
	set('showMarkers', p.showMarkers);

	/* Content metadata */
	set('title', p.title);
	set('artist', p.artist);
	set('artwork', p.artwork);
	set('artworkAlt', p.artworkAlt);
	set('artworkPosition', p.artworkPosition);
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
 * Split a class string into its tokens (empty strings dropped).
 *
 * @param value - A space-separated class list.
 * @returns The individual class names.
 */
function classTokens(value: string): string[] {
	return value.split(/\s+/).filter(Boolean);
}

/**
 * Bring the host's *user* classes (`wfp-host` + the fall-through `class`)
 * up to date without touching anything else on the element: drop the
 * tokens this component applied last time that are no longer wanted, then
 * (re-)add every wanted token. `classList.add` is idempotent, so this is
 * also how the tokens come back after the core's `createDOM()` resets the
 * host's whole class list to `waveform-player` on construction.
 *
 * @param el - The host element.
 * @param applied - Tokens this component applied on the previous sync.
 * @param wanted - Tokens it wants now.
 */
function syncHostClasses(el: HTMLElement, applied: readonly string[], wanted: readonly string[]): void {
	for (const token of applied) {
		if (!wanted.includes(token)) el.classList.remove(token);
	}
	if (wanted.length) el.classList.add(...wanted);
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
 * `class`, `style`, `id` and any other attribute are forwarded to the
 * root element — the base class `wfp-host` is always applied. (Forwarded
 * by hand rather than by attribute inheritance; see "Host `class`
 * handling" in `setup`.)
 */
export const WaveformPlayer = defineComponent({
	name: 'WaveformPlayer',
	/* Attributes are forwarded by hand in the render function so `class`
	 * can be kept out of Vue's patching — see "Host `class` handling". */
	inheritAttrs: false,
	props: {
		// ── Audio source ───────────────────────────────────────────────
		/** Audio file URL. Provide one of `url` or `src`. */
		url: { type: String, default: undefined },
		/** Shorthand alias for `url` (`url` wins if both are set). */
		src: { type: String, default: undefined },
		audioMode: { type: String as PropType<AudioMode>, default: undefined },
		preload: { type: String as PropType<AudioPreload>, default: undefined },
		crossOrigin: { type: String as PropType<AudioCrossOrigin>, default: undefined },

		// ── Waveform visualisation ─────────────────────────────────────
		waveformStyle: { type: String as PropType<WaveformStyle>, default: undefined },
		height: { type: Number, default: undefined },
		samples: { type: Number, default: undefined },
		barWidth: { type: Number, default: undefined },
		barSpacing: { type: Number, default: undefined },
		barRadius: { type: Number, default: undefined },
		waveformGradient: { type: String as PropType<WaveformGradient>, default: undefined },
		waveform: { type: [Array, String] as PropType<WaveformPeaks>, default: undefined },

		// ── Colours (string, or string[] for gradients) ────────────────
		colorPreset: { type: String as PropType<ColorPreset>, default: undefined },
		waveformColor: { type: [String, Array] as PropType<string | string[]>, default: undefined },
		progressColor: { type: [String, Array] as PropType<string | string[]>, default: undefined },

		// ── Playback controls ──────────────────────────────────────────
		playbackRate: { type: Number, default: undefined },
		showPlaybackSpeed: { type: Boolean, default: undefined },
		playbackRates: { type: Array as PropType<number[]>, default: undefined },

		// ── UI toggles ─────────────────────────────────────────────────
		showControls: { type: Boolean, default: undefined },
		showInfo: { type: Boolean, default: undefined },
		showTime: { type: Boolean, default: undefined },
		showHoverTime: { type: Boolean, default: undefined },
		seekHandle: { type: Boolean, default: undefined },
		showBPM: { type: Boolean, default: undefined },
		bpm: { type: Number, default: undefined },
		buttonAlign: { type: String as PropType<ButtonAlign>, default: undefined },
		layout: { type: String, default: undefined },
		buttonStyle: { type: String, default: undefined },
		// The core accepts a number (px) or a unit string, so both must be
		// declared — a String-only prop makes `:button-size="64"` fail Vue's
		// runtime type check and warn, even though the core handles it.
		buttonSize: { type: [String, Number], default: undefined },
		buttonRadius: { type: [String, Number], default: undefined },

		// ── Accessibility ──────────────────────────────────────────────
		accessibleSeek: { type: Boolean, default: undefined },
		seekLabel: { type: String, default: undefined },
		seekValueText: { type: String, default: undefined },
		playPauseLabel: { type: String, default: undefined },
		speedLabel: { type: String, default: undefined },

		// ── Error UI ───────────────────────────────────────────────────
		errorText: { type: String, default: undefined },
		unknownTrackText: { type: String, default: undefined },

		// ── Markers ────────────────────────────────────────────────────
		markers: { type: Array as PropType<WaveformMarker[]>, default: undefined },
		showMarkers: { type: Boolean, default: undefined },

		// ── Content metadata ───────────────────────────────────────────
		title: { type: String, default: undefined },
		artist: { type: String, default: undefined },
		artwork: { type: String, default: undefined },
		artworkAlt: { type: String, default: undefined },
		artworkPosition: { type: String as PropType<ArtworkPosition>, default: undefined },
		album: { type: String, default: undefined },

		// ── Behaviour ──────────────────────────────────────────────────
		autoplay: { type: Boolean, default: undefined },
		singlePlay: { type: Boolean, default: undefined },
		playOnSeek: { type: Boolean, default: undefined },
		enableMediaSession: { type: Boolean, default: undefined },

		// ── Icons ──────────────────────────────────────────────────────
		playIcon: { type: String, default: undefined },
		pauseIcon: { type: String, default: undefined },

		// ── Media Session track navigation ─────────────────────────────
		// Declared as function props rather than emits so the wrapper can
		// tell whether anyone is listening: the core registers the
		// lock-screen skip button whenever the option is a function, so an
		// unconditional emit would show buttons that do nothing. Vue maps
		// `@next-track` / `@previous-track` listeners onto these props.
		/** Media Session "next track" handler (`@next-track`). Shows the lock-screen skip-forward button. */
		onNextTrack: { type: Function as PropType<TrackNavHandler>, default: undefined },
		/** Media Session "previous track" handler (`@previous-track`). Shows the skip-back button. */
		onPreviousTrack: { type: Function as PropType<TrackNavHandler>, default: undefined },
	},
	emits: ['load', 'play', 'pause', 'end', 'timeupdate', 'error'],
	setup(props, { emit, expose, attrs }) {
		const container = ref<HTMLDivElement | null>(null);

		/*
		 * Host `class` handling.
		 *
		 * The core owns part of the host's class list: `createDOM()` resets it
		 * to `waveform-player` (+ `waveform-layout-preview`,
		 * `waveform-theme-light`) and later paths toggle
		 * `waveform-is-placeholder`. If Vue owned the `class` attribute, a
		 * class-only change — which rightly doesn't remount — would re-patch it
		 * and strip those classes for good.
		 *
		 * So the render function passes a class value frozen at setup
		 * (`renderedClass`; SSR and hydration still carry the user's classes),
		 * which Vue never re-patches because it never changes. The live
		 * fall-through `class` (string, array or object — normalised the way
		 * Vue would) is applied after each mount/update with `classList`,
		 * touching only the tokens this component put there. Every other
		 * attribute (`id`, `style`, listeners, `data-*`) is still forwarded.
		 *
		 * Chosen over mounting the core into an inner element (which would
		 * leave Vue's element alone by construction) because that changes the
		 * DOM users style: `--wfp-*` variables set through `style` / `class`
		 * would land on a parent, where the core's own
		 * `.waveform-player { --wfp-…: … }` defaults shadow them.
		 */
		const hostClass = () => normalizeClass(['wfp-host', attrs.class]);
		const renderedClass = hostClass();
		let appliedClasses = classTokens(renderedClass);
		function applyHostClasses() {
			const el = container.value;
			if (!el) return;
			const wanted = classTokens(hostClass());
			syncHostClasses(el, appliedClasses, wanted);
			appliedClasses = wanted;
		}
		onMounted(applyHostClasses);
		onUpdated(applyHostClasses);
		let instance: PlayerInstance | null = null;
		/* Monotonic token: every (re)mount bumps it; an in-flight async
		 * import whose token is stale (superseded by a newer mount or by
		 * unmount) bails instead of attaching a zombie instance. */
		let mountToken = 0;

		/* Whether a track-nav listener is attached. Read at construction
		 * (that's when the core registers the Media Session action), so its
		 * presence is a remount trigger; `computed` only notifies when the
		 * boolean flips, so swapping one handler for another doesn't. */
		const hasNextTrack = computed(() => typeof props.onNextTrack === 'function');
		const hasPreviousTrack = computed(() => typeof props.onPreviousTrack === 'function');

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
			 * doesn't evaluate the audio + canvas + fetch surface.
			 *
			 * `/no-autoinit` rather than the package root: importing the root
			 * scans the whole document for `[data-waveform-player]` markup and
			 * builds a player for every match. This component constructs its
			 * own player on its own ref and wants none of that — and as an
			 * island on a page that *does* carry such markup (a CMS page, a
			 * WordPress template), the root entry would silently mount players
			 * the Vue app never asked for. Same class, same options; the only
			 * thing it drops is the scan. Needs core >= 1.27.0, which is why
			 * the peer floor is hard rather than soft. */
			void import('@arraypress/waveform-player/no-autoinit')
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
					/* Track navigation: only when a listener exists; the
					 * closures read the latest handler. */
					if (hasNextTrack.value) {
						opts.onNextTrack = (i: WaveformPlayerInstance) => props.onNextTrack?.(i);
					}
					if (hasPreviousTrack.value) {
						opts.onPreviousTrack = (i: WaveformPlayerInstance) => props.onPreviousTrack?.(i);
					}

					instance = new Ctor(target, opts);
					/* createDOM() just replaced the host's class list with the
					 * core's own; put `wfp-host` + `class` back beside it. */
					applyHostClasses();
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
		 * there's nothing here for them to churn — only the *presence* of
		 * a track-nav listener is. test/forwarding-drift.test.ts fails if
		 * a forwarded option is missing here. */
		watch(
			() => [
				props.url,
				props.src,
				props.audioMode,
				props.preload,
				props.crossOrigin,
				props.waveformStyle,
				props.height,
				props.samples,
				props.barWidth,
				props.barSpacing,
				props.barRadius,
				props.waveformGradient,
				props.waveform,
				props.colorPreset,
				props.waveformColor,
				props.progressColor,
				props.playbackRate,
				props.showPlaybackSpeed,
				props.playbackRates,
				props.showControls,
				props.showInfo,
				props.showTime,
				props.showHoverTime,
				props.seekHandle,
				props.showBPM,
				props.bpm,
				props.buttonAlign,
				props.layout,
				props.buttonStyle,
				props.buttonSize,
				props.buttonRadius,
				props.accessibleSeek,
				props.seekLabel,
				props.seekValueText,
				props.playPauseLabel,
				props.speedLabel,
				props.errorText,
				props.unknownTrackText,
				props.markers,
				props.showMarkers,
				props.title,
				props.artist,
				props.artwork,
				props.artworkAlt,
				props.artworkPosition,
				props.album,
				props.autoplay,
				props.singlePlay,
				props.playOnSeek,
				props.enableMediaSession,
				props.playIcon,
				props.pauseIcon,
				hasNextTrack.value,
				hasPreviousTrack.value,
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

		return () => {
			const { class: _class, ...rest } = attrs;
			/* `class` frozen at setup — see "Host `class` handling". */
			return h('div', { ...rest, ref: container, class: renderedClass });
		};
	},
});

export default WaveformPlayer;
