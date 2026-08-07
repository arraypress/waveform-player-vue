# CLAUDE.md — @arraypress/waveform-player-vue

Vue 3 wrapper for `@arraypress/waveform-player`.

## Commands
- `npm test` — vitest + jsdom (run before committing).
- `npm run build` — bundles to `dist/`. `prepublishOnly` runs it. `dist/` is gitignored.

## The rule that matters: three edits per option — the most of any wrapper

`src/WaveformPlayer.ts`. A new option needs **all three**:
1. A **runtime** prop declaration in the `props` object (~line 193):
   ```ts
   <key>: { type: String as PropType<AudioCrossOrigin>, default: undefined },
   ```
2. `set('<key>', p.<key>)` in `buildLibraryOptions`.
3. `props.<key>,` in the `watch(() => [...])` remount array.

Step 1 is the trap: **Vue registers props at runtime, so a TS type alone is not a
prop.** Without the declaration Vue treats it as a fallthrough attribute and it
never reaches `buildLibraryOptions`. Step 3 mirrors React's deps array — omit it
and the option works on mount but ignores runtime changes.

`PropType<...>` needs a **named** union, imported from core's hand-written
`index.d.ts` (e.g. `AudioCrossOrigin`, `AudioMode`, `WaveformStyle`). If core only
has an inline union, export a named one there first — that's a core edit.

## Conventions
- Prop **types** derive from core's `WaveformPlayerOptions` via `Omit<>`.
- `style` stays Vue's CSS prop — the visual style prop is `waveformStyle`.
- Add a mirror test in `test/WaveformPlayer.test.ts` + a `CHANGELOG.md` entry.

## Cross-repo
One of 15 packages that must change together — load the `waveform-release` skill.
