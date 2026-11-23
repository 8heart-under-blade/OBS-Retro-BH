# OBS Retro-BH

A local-first OBS scene studio: warm monochrome ink stippling, celestial motion, live-configurable typography, timers and restrained sound reactions.

## Portable candidates

Unsigned Windows x64, macOS Intel/Apple Silicon and glibc Linux x64/ARM64 candidates bundle Node and keep settings outside the archive. See [portable quick start](docs/PORTABLE.md) and the [release gates](docs/RELEASE-CHECKLIST.md). These are candidates, not claims of real OBS support on every target.

Build on the matching OS/architecture with current Node and a ZIP-capable `tar` (Windows includes `tar.exe`): `node scripts/build-portable.mjs --target windows-x64` (replace the target for other platforms). Outputs and SHA-256 checksums are in `dist/`. Verify your own built archive with `node scripts/build-portable.mjs --verify <archive> --target <target>`; verification runs the bundled executable. The `prod` workflow builds and verifies Windows x64 and Linux x64. An explicit version tag on `prod` prepares a draft GitHub Release. See the [production release runbook](docs/PRODUCTION-RELEASE.md).

## Run

Node.js **22 or newer**. No dependencies or build step:

```sh
npm start
```

Open **http://127.0.0.1:8090/config**. The server binds to loopback only. Keep it running while using the Browser Sources.

### Clean OBS outputs

Set each Browser Source to **1920 × 1080**, preferably 30 FPS:

- Starting: http://127.0.0.1:8090/scene/starting
- BRB: http://127.0.0.1:8090/scene/brb
- Goodbye: http://127.0.0.1:8090/scene/goodbye

These contain only artwork and enabled user elements—no navigation, branding, telemetry, footers, audio dialogs or diagnostics. Enable OBS “Shutdown source when not visible” to avoid spending CPU on inactive scenes. Smaller browser windows letterbox/scale the Full HD composition.

The original POC remains in `scratch/poc/`, independently runnable on port 8088. The production app does not use that folder at runtime.

## Configure

1. Choose a scene in the studio.
2. Edit title/subtitle, countdown or elapsed break timer, clock/date, announcements, social text or a next-stream message. Everything is individually optional.
3. Draft changes appear **only in the preview**.
4. **Load defaults** in the left sidebar restores all scenes and shared settings (including custom CSS and audio) in the preview after confirmation. It does not change live OBS until you Save. The Layout tab also has a per-scene reset.
5. **Save to OBS** broadcasts the saved configuration to all open outputs without replacing their artwork canvas or reconnecting OBS audio.

Typography defaults to **Meridian / Jost**, with **Plate / Spectral** as an editorial alternative. Transit adds a thin orbital mark, Ephemeris a serif title with a measuring rule, and Contact Sheet bold type with film marks. **Layout → React to OBS audio** lets a scene's title and design marks respond to the selected OBS input. It's off by default and respects reduced motion and preview pause. Both fonts and their SIL OFL licenses are bundled locally. Layout presets, size, width, offsets and text colors are configurable. Long text wraps; warnings do not automatically hide or shrink content.

The timer buttons use **saved settings**. Start/restart, pause, resume and reset are shared across outputs. Absolute deadlines persist across page refreshes and server restarts. Editing visual styles preserves active timers; changing a timer's duration/mode resets that timer on Save. Countdown completion changes its displayed message; it does not switch OBS scenes.

Clock/date support configurable IANA time zones and locales. For the Philippines use **Asia/Manila**. Friendly entries such as **Manila**, **Philippines Manila**, and **UTC+8** are also accepted and saved as standard identifiers. Whole-hour UTC/GMT offsets are supported; use an IANA zone for fractional offsets. Next-stream/announcement/social fields are text, not an automatic scheduling service.

## Custom CSS / AI styling

The CSS tab supports a global stylesheet plus a per-scene stylesheet loaded last. **Copy AI brief** supplies the selectors, dimensions, fonts and constraints. CSS runs inside an independent text-overlay document, separate from the artwork and studio controls. User strings are text, not executable HTML or JavaScript. External resources/imports are blocked; fonts work offline.

See [CSS styling guide](docs/CSS-STYLING.md) for selectors, variables and examples. Export/import settings as JSON; exports include your draft CSS but never OBS passwords or session tokens. Reload saved settings or reset a scene if a stylesheet hides/misplaces its content.

## OBS audio

The server maintains **one read-only OBS WebSocket connection** for all outputs. Default: `ws://127.0.0.1:4455`. Configure endpoint, source name/UUID and intensity in the Audio tab, then Save. Blank source uses the strongest active input, not the master/program mix. Reconnect/authenticate after saving if needed.

Passwords entered there remain in server memory, not state files, exports, URLs or browser scene pages. They must be re-entered after server restart; alternatively provide the server's `OBS_PASSWORD` environment variable. Local `.env` files are ignored by Git but are not loaded automatically; Node's `--env-file` option may be used explicitly. Never expose an unauthenticated OBS socket or this studio to the LAN/internet.

Sound responses use smoothed input loudness/peaks, **not FFT/frequency bands or BPM detection**. Rings breathe subtly, Jupiter's storm responds, the Sun/sunspots and oceans shimmer, and accretion particles brighten/speed up gently. Asteroid dust, aurora, stars and Moon details add restrained responses. No geometric solar flare loops. Reduced-motion preferences freeze artwork motion/reactions.

## Persistence & security

- Private state/timers: `.local/state.json` (Git-ignored). Back it up before deleting it.
- Concurrent edits are revision-checked, not silently overwritten.
- Save/auth/timer actions require an ephemeral local write token; Host/Origin checks, request limits and a local-resource CSP apply.
- Public files are restricted by resolved filesystem path. No credentials in the public configuration schema.
- Configuration errors or missing assets are reported in the studio, not as technical labels over the live scenes.

This is a local desktop tool—not an internet-hosted multi-user service. `PORT` overrides 8090.

## Tests

```sh
npm test             # 28 production unit/integration tests
npm run test:poc     # 51 accepted POC regressions
npm run test:browser # real headless Chrome end-to-end checks
```

Set `CHROME_BIN` if Chrome is not in a standard installation path. The browser suite uses temporary settings and a simulated loopback OBS server, never a real OBS instance. It verifies draft isolation, live updates, renderer preservation, CSS isolation, both bundled fonts, settings export/import, conflicting edits, synchronized timer pause/resume/reload, clock/date validation, overflow warnings, scene/asset rendering and the server-side audio bridge. It saves an ignored diagnostic screenshot under `.local/browser-results/`.

Real OBS/CEF, encoding-time performance, perceptual audio intensity and longer streaming sessions still need review on the target machine.

## Structure

- `public/celestial/`: extracted renderer, physics, grain, maps and read-only audio client.
- `public/js/`: configuration editor, clean output/overlay controllers, schema, timers and live client.
- `public/css/`: separate studio, artwork viewport and text-overlay styles.
- `server/`: persistence, HTTP/SSE API and OBS audio bridge.
- `tests/`, `scripts/`: production tests and browser runner.
- `scratch/`: retained POC and its documentation; research/browser caches excluded.

See [design decision](docs/DESIGN.md), [production notes](docs/PRODUCTION.md), and [renderer provenance](public/celestial/NOTICE.md). Project code is licensed under the [MIT License](LICENSE). The bundled Node runtime, maps and fonts retain their own licenses and notices. Work is on `development`; no `main` commit/push has been made.
