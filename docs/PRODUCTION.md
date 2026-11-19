# Production scope — Full HD first

## Confirmed requirements

- Canonical output: 1920×1080. Smaller previews scale that composition, not the logical design.
- Preserve the accepted solar system, black-hole physics/stippling/flow, Earth/Moon geometry and audio behavior from the POC.
- Remove observatory branding, technical labels, chapter/kicker defaults, all footers/rules, navigation, audio controls and POC credits from scene output.
- Replace the old title treatment; do not delete status titles. No audio-reactive typography.
- Dedicated configuration page; saved changes propagate to already-open OBS outputs without refreshing/restarting the artwork.
- Basic controls plus advanced CSS that users or AI can author. No user JavaScript or HTML injection.
- Per-scene optional title, subtitle, countdown or elapsed-break timer, clock, date, announcement, social text and next-stream message.
- Start on `development`; retain `scratch/poc/`. No automatic push or main-branch publication.

## Implemented foundation

`public/js/config-schema.mjs` defines schemaVersion 1, defaults, strict field/type/length validation, loopback OBS address (4455), time-zone/locale validation, per-scene modules/layout/theme, and global/per-scene CSS strings. It clones accepted input; it does not interpret text as HTML. Titles do not get silently hidden or shrunk by the schema.

`public/js/timers.mjs` defines deterministic start/pause/resume/reset, absolute countdown deadlines, elapsed-break accounting and display formatting. These do not depend on rendered frame count. Server responses include `serverNow` so clients can account for clock offsets.

`server/store.mjs` persists a versioned configuration and all three timer states atomically under `.local/`. Concurrent edits with stale revisions return a conflict instead of overwriting each other. Visual/style saves preserve an active timer. Changing that scene's timer duration/mode resets only its timer; disabling a module hides it and does not implicitly stop it. Invalid stored files are not silently replaced.

`server/index.mjs` is loopback-only. Writes require a same-origin configuration token and JSON; Host/Origin checks prevent ordinary cross-site/rebinding access. Static paths are restricted to `public/`. CSP permits local resources/inline CSS but disallows external scripts, external fonts/images/network connections, objects and foreign framing. This is a local tool, not a remotely hosted authenticated service.

## API

- `GET /api/state`: `{revision, config, timers, serverNow}`.
- `GET /api/session`: ephemeral write token for the local configuration page.
- `GET /api/events`: SSE `state` events, including an initial snapshot and reconnect snapshots.
- `PUT /api/config`: `{revision, config}`, header `X-Config-Token`.
- `POST /api/timers/:scene/:action`: `{revision}`, same token. Actions: start/pause/resume/reset.

All persisted changes increment the shared revision. Import/export should operate on `config`, not token, live connections or secrets. Passwords are explicitly not part of the public configuration schema. Application state is local, not localStorage-only, so OBS and the operator browser can share it.

## Implemented application layer

The clean /scene/starting, /scene/brb and /scene/goodbye pages now render the extracted library from public/celestial/ without a scratch runtime dependency. The separate /config studio supports all configured modules, global/per-scene CSS, preview-only drafts, saving/live updates, JSON export/import, overflow warnings and timer controls. Local Jost/Spectral fonts and licenses are bundled. CSS lives in a nested text-overlay document, independent of the canvas and studio. The server now owns one read-only OBS connection; its smoothed envelopes are broadcast to outputs. Optional authentication is session-only or via OBS_PASSWORD, never public configuration. Production tests cover config/persistence/timers/security/protocol integration and the browser suite exercises the real UI with a simulated OBS server.

## Delivery checklist

1. **Done:** Extract the accepted renderer into production assets/modules while leaving the POC intact.
2. **Done:** Implement clean `/scene/starting`, `/scene/brb`, `/scene/goodbye` outputs and a dedicated `/config` UI.
3. **Done:** Connect live state events without resetting the renderer, audio source, timer or frame clock on text/CSS saves.
4. **Done:** Implement the stable CSS hooks below and a scaled preview isolated from configuration controls and artwork.
5. **Done:** Local fonts/license files, measured overflow warnings, JSON/CSS import/export and OBS URL copying.
6. **Audio bridge implemented:** no secrets in browser URLs/exported config. **Still required:** real OBS/CEF, encode-time performance and longer-session review on the streaming machine.

## CSS contract for the scene layer

Stable hooks: `.scene-root[data-scene]`, `#scene-title`, `#scene-subtitle`, `#scene-timer`, `#timer-label`, `#timer-value`, `#scene-clock`, `#scene-date`, `#scene-announcement`, `#scene-social`, `#scene-next-stream` and `.module`.

Variables: `--ink`, `--muted`, `--title-size`, `--title-width`, `--module-size`, `--font-title`, `--font-body`, `--caption-x`, `--caption-y`, `--align`.

See [CSS-STYLING.md](CSS-STYLING.md) for the implemented hooks, examples and an AI prompt. Load defaults, then global CSS, then per-scene CSS. The editor must allow real CSS positioning/styles rather than a restrictive list of canned choices. Scope its **effect** to the scene overlay document so it cannot restyle the configuration controls or the celestial canvas; no simple regex is claimed to be a full CSS sandbox. External URLs/imports are blocked by the resource policy, and fonts should be bundled locally. CSS is applied as style text, never inserted with arbitrary HTML.

Warn about overflow/collisions in the configuration preview; never silently remove enabled content. CSS can intentionally override safe-zone recommendations. Basic control values remain useful defaults, not hard constraints on advanced CSS.
