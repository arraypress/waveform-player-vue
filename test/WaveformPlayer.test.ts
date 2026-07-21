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
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
	constructor(el: HTMLElement, opts: Record<string, unknown>) {
		this.el = el;
		this.opts = opts;
		instances.push(this);
	}
}

vi.mock('@arraypress/waveform-player', () => ({
	default: MockPlayer,
	WaveformPlayer: MockPlayer,
}));

import { WaveformPlayer } from '../src';

beforeEach(() => {
	instances.length = 0;
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
});
