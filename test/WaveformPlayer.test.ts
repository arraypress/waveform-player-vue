/**
 * WaveformPlayer.test.ts
 * ----------------------
 *
 * The core `@arraypress/waveform-player` library is mocked at the
 * module boundary (jsdom has no Web Audio / Canvas). These tests cover
 * the wrapper's own responsibilities: rendering the host element,
 * constructing the instance with mapped options, the `src → url`
 * alias, boolean-prop omission (so the core's own defaults win),
 * emit forwarding, destroy-on-unmount, identity-prop re-mount, and the
 * exposed imperative API.
 */
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

/** Captures every constructed instance so assertions can inspect them. */
const instances: MockPlayer[] = [];

class MockPlayer {
	el: HTMLElement;
	opts: Record<string, unknown>;
	play = vi.fn();
	pause = vi.fn();
	togglePlay = vi.fn();
	seekTo = vi.fn();
	seekToPercent = vi.fn();
	setVolume = vi.fn();
	setPlaybackRate = vi.fn();
	setPlayingState = vi.fn();
	setProgress = vi.fn();
	loadTrack = vi.fn(async () => {});
	destroy = vi.fn();
	/** Optional per-test stand-in for the core's DOM work on the host. */
	static onConstruct: ((el: HTMLElement) => void) | null = null;
	constructor(el: HTMLElement, opts: Record<string, unknown>) {
		this.el = el;
		this.opts = opts;
		instances.push(this);
		MockPlayer.onConstruct?.(el);
	}
}

/**
 * The package root must never be imported: it scans the whole document on
 * import and mounts a player for every `[data-waveform-player]` it finds, which
 * is markup this Vue app does not own. A mock factory only runs when its module is
 * actually imported, so this throws if and only if the component reaches for
 * the scanning entry point — turning a silent behaviour regression into a
 * failure that names itself.
 */
vi.mock('@arraypress/waveform-player', () => {
	throw new Error(
		'[test] component imported the scanning entry point; it must import @arraypress/waveform-player/no-autoinit'
	);
});

vi.mock('@arraypress/waveform-player/no-autoinit', () => ({
	default: MockPlayer,
	WaveformPlayer: MockPlayer,
}));

import { WaveformPlayer } from '../src';
import type { WaveformPlayerProps } from '../src';

beforeEach(() => {
	instances.length = 0;
	MockPlayer.onConstruct = null;
});

describe('WaveformPlayer (Vue)', () => {
	it('renders a div.wfp-host immediately', () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		expect(wrapper.find('div.wfp-host').exists()).toBe(true);
	});

	it('constructs the core instance with the container and url', async () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		expect(instances).toHaveLength(1);
		expect(instances[0].opts.url).toBe('/a.mp3');
		expect(instances[0].el).toBe(wrapper.find('div.wfp-host').element);
	});

	it('aliases src → url', async () => {
		mount(WaveformPlayer, { props: { src: '/b.mp3' } });
		await flushPromises();
		expect(instances[0].opts.url).toBe('/b.mp3');
	});

	it('prefers url over src when both are set', async () => {
		mount(WaveformPlayer, { props: { url: '/win.mp3', src: '/lose.mp3' } });
		await flushPromises();
		expect(instances[0].opts.url).toBe('/win.mp3');
	});

	it('passes option props through', async () => {
		mount(WaveformPlayer, {
			props: { url: '/a.mp3', waveformStyle: 'bars', height: 80, samples: 120 },
		});
		await flushPromises();
		expect(instances[0].opts).toMatchObject({ waveformStyle: 'bars', height: 80, samples: 120 });
	});

	it('omits absent boolean props so the core defaults win', async () => {
		mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		expect('showControls' in instances[0].opts).toBe(false);
		expect('autoplay' in instances[0].opts).toBe(false);
		expect('showInfo' in instances[0].opts).toBe(false);
	});

	it('forwards explicit boolean props (including false)', async () => {
		mount(WaveformPlayer, { props: { url: '/a.mp3', showControls: false, autoplay: true } });
		await flushPromises();
		expect(instances[0].opts.showControls).toBe(false);
		expect(instances[0].opts.autoplay).toBe(true);
	});

	it('forwards lifecycle callbacks as emits', async () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		const o = instances[0].opts as Record<string, (...args: unknown[]) => void>;
		o.onLoad(instances[0]);
		o.onPlay(instances[0]);
		o.onPause(instances[0]);
		o.onEnd(instances[0]);
		o.onTimeUpdate(1, 2, instances[0]);
		o.onError(new Error('boom'), instances[0]);
		expect(wrapper.emitted('load')).toBeTruthy();
		expect(wrapper.emitted('play')).toBeTruthy();
		expect(wrapper.emitted('pause')).toBeTruthy();
		expect(wrapper.emitted('end')).toBeTruthy();
		expect(wrapper.emitted('timeupdate')![0]).toEqual([1, 2, instances[0]]);
		expect((wrapper.emitted('error')![0] as unknown[])[0]).toBeInstanceOf(Error);
	});

	it('destroys the instance on unmount', async () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		const inst = instances[0];
		wrapper.unmount();
		expect(inst.destroy).toHaveBeenCalledTimes(1);
	});

	it('re-mounts when url changes', async () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		const first = instances[0];
		await wrapper.setProps({ url: '/b.mp3' });
		await flushPromises();
		expect(first.destroy).toHaveBeenCalledTimes(1);
		expect(instances).toHaveLength(2);
		expect(instances[1].opts.url).toBe('/b.mp3');
	});

	it('exposes the imperative API via the component ref', async () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		const vm = wrapper.vm as unknown as {
			seekTo: (s: number) => void;
			pause: () => void;
			instance: MockPlayer | null;
		};
		vm.seekTo(30);
		vm.pause();
		expect(instances[0].seekTo).toHaveBeenCalledWith(30);
		expect(instances[0].pause).toHaveBeenCalledTimes(1);
		expect(vm.instance).toBe(instances[0]);
	});

	it('merges fall-through class with the base wfp-host class', () => {
		const wrapper = mount(WaveformPlayer, {
			props: { url: '/a.mp3' },
			attrs: { class: 'custom', id: 'player-1' },
		});
		const el = wrapper.find('div').element;
		expect(el.classList.contains('wfp-host')).toBe(true);
		expect(el.classList.contains('custom')).toBe(true);
		expect(el.id).toBe('player-1');
	});

	/* The core writes its own classes onto the host: createDOM() resets the
	 * whole list to `waveform-player` (+ `waveform-layout-preview`,
	 * `waveform-theme-light`), and load/error paths toggle
	 * `waveform-is-placeholder` later. A class-only change doesn't remount,
	 * so if Vue re-patched the `class` attribute those would be gone for good. */
	it('keeps the core-added classes when only the fall-through class changes', async () => {
		MockPlayer.onConstruct = (el) => {
			el.className = 'waveform-player';
			el.classList.add('waveform-layout-preview');
		};
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3' }, attrs: { class: 'first' } });
		await flushPromises();
		const el = wrapper.find('div').element;
		el.classList.add('waveform-is-placeholder'); // a later, post-construction toggle

		await wrapper.setProps({ class: 'second' } as never);
		await flushPromises();

		expect(instances).toHaveLength(1); // no remount to paper over it
		expect(el.className.split(' ').sort()).toEqual(
			['second', 'waveform-is-placeholder', 'waveform-layout-preview', 'waveform-player', 'wfp-host'].sort()
		);

		await wrapper.setProps({ class: undefined } as never);
		expect(el.className.split(' ').sort()).toEqual(
			['waveform-is-placeholder', 'waveform-layout-preview', 'waveform-player', 'wfp-host'].sort()
		);
	});

	it('re-applies the fall-through class and wfp-host after the core resets the class list', async () => {
		MockPlayer.onConstruct = (el) => {
			el.className = 'waveform-player';
		};
		const wrapper = mount(WaveformPlayer, {
			props: { url: '/a.mp3' },
			attrs: { class: ['mine', { active: true, off: false }] },
		});
		await flushPromises();
		expect(wrapper.find('div').element.className.split(' ').sort()).toEqual(
			['active', 'mine', 'waveform-player', 'wfp-host'].sort()
		);
	});

	it('still forwards non-class attributes to the host', async () => {
		const onClick = vi.fn();
		const wrapper = mount(WaveformPlayer, {
			props: { url: '/a.mp3' },
			attrs: { id: 'p1', 'data-x': '1', style: 'min-height: 64px', onClick },
		});
		const el = wrapper.find('div').element as HTMLDivElement;
		expect(el.id).toBe('p1');
		expect(el.dataset.x).toBe('1');
		expect(el.style.minHeight).toBe('64px');
		await wrapper.find('div').trigger('click');
		expect(onClick).toHaveBeenCalledTimes(1);
		await wrapper.setProps({ id: 'p2' } as never);
		expect(el.id).toBe('p2');
	});

	// These props type-check for free (the Props type derives from the core's
	// WaveformPlayerOptions), but options are mapped by hand — so a prop that
	// isn't declared and `set()` type-checks and then silently does nothing.
	// That failure is invisible without these.
	it('maps buttonRadius, including 0', async () => {
		mount(WaveformPlayer, { props: { url: '/a.mp3', buttonRadius: 0 } });
		await flushPromises();
		expect(instances[0].opts.buttonRadius).toBe(0);
	});

	it('accepts a numeric buttonSize without a prop-type warning', async () => {
		// Declared String-only, a number here failed Vue's runtime check and
		// warned, even though the core takes number (px) or a unit string.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mount(WaveformPlayer, { props: { url: '/a.mp3', buttonSize: 64 } });
		await flushPromises();

		expect(instances[0].opts.buttonSize).toBe(64);
		expect(warn.mock.calls.flat().join(' ')).not.toMatch(/Invalid prop/i);
		warn.mockRestore();
	});

	it('maps artworkPosition', async () => {
		mount(WaveformPlayer, {
			props: { url: '/a.mp3', artwork: '/c.jpg', artworkPosition: 'button' },
		});
		await flushPromises();
		expect(instances[0].opts.artworkPosition).toBe('button');
	});

	it('maps crossOrigin when set', async () => {
		mount(WaveformPlayer, { props: { url: '/a.mp3', crossOrigin: 'anonymous' } });
		await flushPromises();
		expect(instances[0].opts.crossOrigin).toBe('anonymous');
	});

	it('omits crossOrigin when unset, so the core default (native <audio>) applies', async () => {
		mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		expect('crossOrigin' in instances[0].opts).toBe(false);
	});

	it('omits both when unset, so the core defaults apply', async () => {
		mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		expect('buttonRadius' in instances[0].opts).toBe(false);
		expect('artworkPosition' in instances[0].opts).toBe(false);
	});

	// Typed on WaveformPlayerProps since core 1.18 / 1.17, but with no runtime
	// prop declaration Vue treated them as fall-through attributes — they
	// landed on the <div> and never reached the player.
	it('maps waveformGradient and seekHandle (including false)', async () => {
		const wrapper = mount(WaveformPlayer, {
			props: { url: '/a.mp3', waveformGradient: 'horizontal', seekHandle: false },
		});
		await flushPromises();
		expect(instances[0].opts.waveformGradient).toBe('horizontal');
		expect(instances[0].opts.seekHandle).toBe(false);
		const el = wrapper.find('div.wfp-host').element;
		expect(el.hasAttribute('waveformgradient')).toBe(false);
		expect(el.hasAttribute('seekhandle')).toBe(false);
	});

	it('omits waveformGradient and seekHandle when unset, so the core defaults apply', async () => {
		mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		expect('waveformGradient' in instances[0].opts).toBe(false);
		expect('seekHandle' in instances[0].opts).toBe(false);
	});

	it('re-mounts when waveformGradient or seekHandle changes', async () => {
		const wrapper = mount(WaveformPlayer, {
			props: { url: '/a.mp3', waveformGradient: 'horizontal', seekHandle: false },
		});
		await flushPromises();
		await wrapper.setProps({ waveformGradient: 'diagonal' });
		await flushPromises();
		expect(instances).toHaveLength(2);
		await wrapper.setProps({ seekHandle: true });
		await flushPromises();
		expect(instances).toHaveLength(3);
		expect(instances[2].opts).toMatchObject({ waveformGradient: 'diagonal', seekHandle: true });
	});

	it('forwards @next-track / @previous-track as onNextTrack / onPreviousTrack', async () => {
		const onNextTrack = vi.fn();
		const onPreviousTrack = vi.fn();
		mount(WaveformPlayer, { props: { url: '/a.mp3', onNextTrack, onPreviousTrack } });
		await flushPromises();
		const o = instances[0].opts as Record<string, (...args: unknown[]) => void>;
		o.onNextTrack(instances[0]);
		o.onPreviousTrack(instances[0]);
		expect(onNextTrack).toHaveBeenCalledWith(instances[0]);
		expect(onPreviousTrack).toHaveBeenCalledWith(instances[0]);
	});

	it('omits the track-nav callbacks with no listener, so no dead lock-screen buttons appear', async () => {
		// The core registers the Media Session nexttrack/previoustrack action
		// whenever the option is a function — so these can't be wired to an
		// unconditional emit the way @play / @pause are.
		mount(WaveformPlayer, { props: { url: '/a.mp3' } });
		await flushPromises();
		expect('onNextTrack' in instances[0].opts).toBe(false);
		expect('onPreviousTrack' in instances[0].opts).toBe(false);
	});

	it('remounts when a track-nav listener is added, not when it is swapped', async () => {
		const wrapper = mount(WaveformPlayer, { props: { url: '/a.mp3', onNextTrack: vi.fn() } });
		await flushPromises();

		const next2 = vi.fn();
		await wrapper.setProps({ onNextTrack: next2 });
		await flushPromises();
		expect(instances).toHaveLength(1);
		(instances[0].opts.onNextTrack as (i: unknown) => void)(instances[0]);
		expect(next2).toHaveBeenCalledTimes(1);

		await wrapper.setProps({ onPreviousTrack: vi.fn() });
		await flushPromises();
		expect(instances).toHaveLength(2);
		expect(typeof instances[1].opts.onPreviousTrack).toBe('function');
	});
});

describe('WaveformPlayer types (Vue)', () => {
	it('keeps style as the fall-through CSS attribute, not the core waveformStyle alias', () => {
		expectTypeOf<WaveformPlayerProps>().not.toHaveProperty('style');
	});
});
