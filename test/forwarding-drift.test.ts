/// <reference types="node" />
/**
 * test/forwarding-drift.test.ts
 * -----------------------------
 *
 * Guards the one contract types can't: that every option the installed core
 * accepts actually reaches `new WaveformPlayer(el, opts)`, and that changing
 * it remounts the player.
 *
 * `WaveformPlayerProps` derives from the core's `WaveformPlayerOptions`, so a
 * new core option type-checks for free — but Vue registers props at runtime,
 * so without a `props: {}` declaration it's a fall-through attribute that
 * lands on the `<div>`; and without `set()` + the `watch()` array it's never
 * forwarded or never remounts. This suite enumerates the core's real option
 * surface (see `core-options.ts`) and fails for any key that is neither
 * forwarded nor listed in `NOT_FORWARDED` with a reason. Adding a core option
 * without wiring it here must fail this test.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { isCallbackKey, loadCoreOptionKeys, loadCoreThemes, sampleValues } from './core-options';

/**
 * Core options this wrapper deliberately does NOT forward, each with why.
 * Everything else the core accepts must reach the constructor.
 *
 * Callbacks need no entry: `onLoad` … `onError` are reached as `@load` …
 * `@error` emits (a mounted `onLoad` prop is exactly what `@load` compiles
 * to), and `onNextTrack` / `onPreviousTrack` are declared function props
 * (`@next-track` / `@previous-track`).
 */
const NOT_FORWARDED: Record<string, string> = {
	// Vue's fall-through inline-CSS attribute on the root <div>. The core's
	// `style` is only a shorthand alias for `waveformStyle`, which is forwarded
	// under its canonical name.
	style: 'fall-through CSS attribute on the root div; use waveformStyle for the visual style',
};

/**
 * Core keys whose Vue listener/prop name differs from the option name.
 * `onTimeUpdate` surfaces as the `@timeupdate` emit (the native media event's
 * spelling), whose listener prop is `onTimeupdate`.
 */
const PROP_NAME: Record<string, string> = {
	onTimeUpdate: 'onTimeupdate',
};

/** Core keys forwarded under a different OPTION name. */
const FORWARDED_AS: Record<string, string> = {
	// `src` is the core's shorthand for `url`; the wrapper resolves it to `url`.
	src: 'url',
};

const instances: Array<{ opts: Record<string, unknown>; destroy: () => void }> = [];

class MockPlayer {
	opts: Record<string, unknown>;
	destroy = vi.fn();
	constructor(_el: HTMLElement, opts: Record<string, unknown>) {
		this.opts = opts;
		instances.push(this);
	}
}

vi.mock('@arraypress/waveform-player', () => {
	throw new Error('[test] component imported the scanning entry point');
});

vi.mock('@arraypress/waveform-player/no-autoinit', () => ({
	default: MockPlayer,
	WaveformPlayer: MockPlayer,
}));

import { WaveformPlayer } from '../src';

beforeEach(() => {
	instances.length = 0;
});

/** Props that set `key` to `value`, plus a url unless `key` is the url alias. */
function propsFor(key: string, value: unknown): Record<string, unknown> {
	const prop = PROP_NAME[key] ?? key;
	return key === 'src' || key === 'url' ? { [prop]: value } : { url: '/a.mp3', [prop]: value };
}

describe('WaveformPlayer (Vue) — forwarding drift vs the installed core', () => {
	it('forwards every core option, or lists it in NOT_FORWARDED with a reason', async () => {
		const { keys, defaults } = await loadCoreOptionKeys();
		const dropped: string[] = [];
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		for (const key of keys) {
			if (key in NOT_FORWARDED) continue;
			instances.length = 0;

			if (isCallbackKey(key)) {
				const handler = vi.fn();
				const wrapper = mount(WaveformPlayer, { props: propsFor(key, handler) });
				await flushPromises();
				const cb = instances[0].opts[key];
				if (typeof cb !== 'function') dropped.push(key);
				else {
					(cb as (...a: unknown[]) => void)(instances[0]);
					if (handler.mock.calls.length !== 1) dropped.push(`${key} (does not reach the listener)`);
				}
				wrapper.unmount();
				continue;
			}

			const [value] = sampleValues(key, defaults[key]);
			const wrapper = mount(WaveformPlayer, { props: propsFor(key, value) });
			await flushPromises();
			const got = instances[0].opts[FORWARDED_AS[key] ?? key];
			if (JSON.stringify(got) !== JSON.stringify(value)) dropped.push(key);
			wrapper.unmount();
		}

		warn.mockRestore();
		expect(dropped, 'core options not declared/forwarded by the component').toEqual([]);
	});

	it('remounts when any forwarded value option changes (watch array is complete)', async () => {
		const { keys, defaults } = await loadCoreOptionKeys();
		const stale: string[] = [];
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		for (const key of keys) {
			// Callbacks reach the instance through stable closures and must
			// NOT remount on identity change — covered in the main suite.
			if (key in NOT_FORWARDED || isCallbackKey(key)) continue;
			instances.length = 0;

			const [a, b] = sampleValues(key, defaults[key]);
			const wrapper = mount(WaveformPlayer, { props: propsFor(key, a) });
			await flushPromises();
			await wrapper.setProps({ [key]: b });
			await flushPromises();
			if (instances.length < 2) stale.push(key);
			wrapper.unmount();
		}

		warn.mockRestore();
		expect(stale, 'forwarded options missing from the remount watch() array').toEqual([]);
	});

	it('does not remount for a fall-through attribute (so the test above means something)', async () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' }, attrs: { id: 'a' } });
		await flushPromises();
		await wrapper.setProps({ id: 'b' } as Record<string, unknown>);
		await flushPromises();
		expect(instances).toHaveLength(1);
	});

	it('NOT_FORWARDED / PROP_NAME / FORWARDED_AS only name keys the core actually has', async () => {
		const { keys } = await loadCoreOptionKeys();
		const unknown = [
			...Object.keys(NOT_FORWARDED),
			...Object.keys(PROP_NAME),
			...Object.keys(FORWARDED_AS),
		].filter((k) => !keys.includes(k));
		expect(unknown, 'stale entries — the core no longer has these options').toEqual([]);
	});
});

describe('WaveformPlayerExpose docs vs the installed core', () => {
	it('documents the setPlaybackRate range the core actually clamps to', async () => {
		const { PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX } = await loadCoreThemes();
		const src = readFileSync(
			fileURLToPath(import.meta.url).replace(/test\/[^/]+$/, 'src/types.ts'),
			'utf8'
		);
		const doc = /Set playback rate \(([\d.]+)\.\.([\d.]+)\b/.exec(src);
		expect(doc, 'setPlaybackRate doc comment with a range').not.toBeNull();
		expect([Number(doc![1]), Number(doc![2])]).toEqual([PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX]);
	});
});
