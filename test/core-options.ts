/// <reference types="node" />
/**
 * test/core-options.ts
 * --------------------
 *
 * Reads the INSTALLED core's option surface, so the forwarding-drift test
 * fails the moment `@arraypress/waveform-player` grows an option this
 * wrapper doesn't wire. Prop *types* flow from the core automatically;
 * runtime forwarding is a hand-written allowlist, and nothing else notices
 * when a new key is missing from it.
 *
 * Two sources, unioned:
 *
 *  - `DEFAULT_OPTIONS` from the core's `src/js/themes.js` — the runtime
 *    option list. The core publishes `src/` but not through its `exports`
 *    map, so it's loaded by file path resolved from the package root.
 *  - the keys of `WaveformPlayerOptions` in the core's hand-written
 *    `index.d.ts` — adds the typed keys that have no default (`src`,
 *    `style`, `waveform`).
 *
 * Shared verbatim across the four player wrappers.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const coreRoot = dirname(
	createRequire(import.meta.url).resolve('@arraypress/waveform-player/package.json')
);

/** The installed core's `themes.js` module (DEFAULT_OPTIONS + playback-rate bounds). */
export async function loadCoreThemes(): Promise<{
	DEFAULT_OPTIONS: Record<string, unknown>;
	PLAYBACK_RATE_MIN: number;
	PLAYBACK_RATE_MAX: number;
}> {
	const mod = await import(/* @vite-ignore */ join(coreRoot, 'src/js/themes.js'));
	if (!mod.DEFAULT_OPTIONS) {
		throw new Error(`[test] DEFAULT_OPTIONS not found in ${coreRoot}/src/js/themes.js`);
	}
	return mod;
}

/** The installed core's `parseDataAttributes()` (the `data-*` contract). */
export async function loadParseDataAttributes(): Promise<
	(el: { dataset: Record<string, string> }) => Record<string, unknown>
> {
	const mod = await import(/* @vite-ignore */ join(coreRoot, 'src/js/utils.js'));
	return mod.parseDataAttributes;
}

/** Keys of `WaveformPlayerOptions` as declared in the core's `index.d.ts`. */
export function loadTypedOptionKeys(): string[] {
	const dts = readFileSync(join(coreRoot, 'index.d.ts'), 'utf8');
	const body = /export interface WaveformPlayerOptions\s*\{([\s\S]*?)\n\}/.exec(dts)?.[1];
	if (!body) throw new Error('[test] WaveformPlayerOptions not found in the core index.d.ts');
	return [...body.matchAll(/^\s+(\w+)\??\s*:/gm)].map((m) => m[1]);
}

/**
 * Every option key the core accepts: `DEFAULT_OPTIONS` ∪ typed keys, sorted.
 * Throws if either source parses suspiciously small, so a broken parse can't
 * make the drift test pass vacuously.
 */
export async function loadCoreOptionKeys(): Promise<{
	keys: string[];
	defaults: Record<string, unknown>;
}> {
	const { DEFAULT_OPTIONS: defaults } = await loadCoreThemes();
	const typed = loadTypedOptionKeys();
	if (Object.keys(defaults).length < 40 || typed.length < 40) {
		throw new Error('[test] core option surface parsed too small — did the core layout change?');
	}
	const keys = [...new Set([...Object.keys(defaults), ...typed])].sort();
	return { keys, defaults };
}

/** The core's callback options — forwarded as functions, not values. */
export const isCallbackKey = (key: string): boolean => /^on[A-Z]/.test(key);

/**
 * Hand-picked sample values for keys whose default can't seed one (null
 * defaults, enums, structured values). Two distinct values each, so the
 * drift test can also change a prop and expect a remount.
 */
const SAMPLE_OVERRIDES: Record<string, [unknown, unknown]> = {
	url: ['/a.mp3', '/b.mp3'],
	src: ['/alias-a.mp3', '/alias-b.mp3'],
	style: ['bars', 'line'],
	waveformStyle: ['bars', 'line'],
	waveformGradient: ['horizontal', 'diagonal'],
	audioMode: ['external', 'self'],
	preload: ['none', 'auto'],
	crossOrigin: ['anonymous', 'use-credentials'],
	colorPreset: ['dark', 'light'],
	waveformColor: ['#111111', '#222222'],
	progressColor: ['#333333', '#444444'],
	buttonAlign: ['top', 'center'],
	layout: ['preview', 'default'],
	buttonStyle: ['minimal', 'circle'],
	buttonSize: [48, '4rem'],
	buttonRadius: [0, '0.5rem'],
	artworkPosition: ['button', 'info'],
	bpm: [120, 128],
	waveform: [
		[0.1, 0.5],
		[0.2, 0.6],
	],
	markers: [[{ time: 1, label: 'A' }], [{ time: 2, label: 'B' }]],
	playbackRates: [
		[0.5, 1],
		[1, 2],
	],
	seekLabel: ['Seek A', 'Seek B'],
	seekValueText: ['%1$s / %2$s', '%1$s of %2$s'],
	title: ['Title A', 'Title B'],
	artist: ['Artist A', 'Artist B'],
	artwork: ['/a.jpg', '/b.jpg'],
	album: ['Album A', 'Album B'],
};

/**
 * Two distinct sample values for `key`: an override if one exists, else
 * derived from the core default's type. Throws for a new key whose default
 * gives nothing to derive from — add it to `SAMPLE_OVERRIDES` above.
 */
export function sampleValues(key: string, def: unknown): [unknown, unknown] {
	if (SAMPLE_OVERRIDES[key]) return SAMPLE_OVERRIDES[key];
	if (typeof def === 'boolean') return [!def, def];
	if (typeof def === 'number') return [def + 1, def + 2];
	if (typeof def === 'string') return [`${key}-a`, `${key}-b`];
	throw new Error(
		`[test] no sample value for core option "${key}" (default ${JSON.stringify(def)}) — add one to SAMPLE_OVERRIDES in test/core-options.ts`
	);
}
