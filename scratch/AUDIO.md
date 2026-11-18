# Audio-reactive celestial POC

Everything remains in `scratch/`. Run the same local server:

```sh
node scratch/poc/serve.cjs
```

## Connect to your OBS

1. In OBS → Tools → WebSocket Server Settings, enable the server on port **4445** (as in your screenshot).
2. Refresh the page / OBS Browser Source cache. The pages now try `ws://127.0.0.1:4445` automatically.
3. Open **AUDIO** in the preview. Select an exact input name (for example `Desktop Audio` or `Music`) from the suggestions, or enter a UUID. Blank selects the **strongest active input**, not a sum or the master/program mix.
4. Adjust **Reaction intensity**. Defaults are deliberately restrained and smoothed.
5. In OBS Browser Source → **Interact**, press **A** to open the same settings even with `obs=1` hiding the preview controls.

Your screenshot shows authentication disabled, which the client supports. Do not expose an unauthenticated OBS socket on a public/LAN interface. Prefer enabling OBS authentication and using firewall/loopback restrictions. If enabled, enter the password in AUDIO settings. It stays in memory, is cleared from the form after connecting, and is never stored in localStorage, URLs or source files. The client computes OBS's challenge-response hash. A page reload/source shutdown requires re-entry; unattended authenticated persistence would need a separately designed local bridge/configuration mechanism.

No OBS settings, scenes or audio controls are changed. The client sends only Identify and subscribes to the high-volume `InputVolumeMeters` events (subscription 65536). It does **not** record, play, monitor, or upload audio. No microphone permission is requested. OBS meters expose magnitudes and peaks, **not a waveform/FFT or bass/mid/treble bands**. This is loudness/peak-reactive art, not beat/BPM detection or a physical simulation.

## URLs

Existing scene URLs continue to work; OBS audio is the default:

- `http://127.0.0.1:8088/?scene=starting&obs=1&audio=obs&source=Desktop%20Audio`
- `http://127.0.0.1:8088/?scene=brb&obs=1&audio=obs&source=Music`
- `http://127.0.0.1:8088/?scene=goodbye&obs=1&audio=obs&source=Music`

Optional `obsws=ws%3A%2F%2F127.0.0.1%3A4445` sets the endpoint. Never put a password in a URL.

- `audio=off`: disable connection/reactions.
- `audio=demo`: explicitly labeled **synthetic visual demo**; not live sound.

## Reactions

| Object | Response |
|---|---|
| Saturn rings | Smooth brightness waves, very small ring ripple, orbiting reactive dust; planet shadow retained |
| Jupiter Great Red Spot | Subtle breathing of the oval and sound-driven internal swirl phase |
| Sun | Grain luminance rises gently; flares/prominence arches brighten on peaks |
| Sunspots | Small changes to area and contrast, retaining the independent sunspot cycle |
| Earth oceans | Mapped oceans gain moving wave-like shimmer; continents remain prominent |
| Black-hole disk | Gentle particle brightness and flow-speed increase; central shadow/ray geometry unchanged |
| Asteroid belt | New subtle stippled belt between Mars/Jupiter responds to energy |
| Polar aurora | New monochrome ribbons around Goodbye Earth's poles |
| Stars / Moon | Restrained star pulses and lunar surface shimmer |

These are artistic effects. Relative planetary orbits, Earth–Moon plane angles, tidal locking and black-hole ray tracing are not audio-modulated. No full-screen flashes or randomized per-frame grain are added. Sunspot edges and sphere grain coverage use continuous transitions rather than binary thresholds.

## Smoothing / lifecycle

- Meter normalization: approximately -50 to -6 dB, bounded to 0–1.
- Level attack ~0.20 s, release ~0.85 s; slower swell ~1.6 s; peak accents have their own easing.
- Missing events after 0.4 s decay toward silence. A disconnected socket also decays rather than freezing at the last loud value.
- Automatic reconnect backs off from 1 to 10 seconds. Missing/bad credentials, unsupported RPC, and an OBS-kicked session stop instead of looping.
- Pause and reduced-motion freeze visual motion **and reactions**. A page's settings remain in memory only. `pagehide` cleans up sockets, retry/UI timers and workers.
- Prefer OBS “Shutdown source when not visible” for inactive scene sources.

## Validation

```sh
node --test scratch/poc/*.test.cjs
node scratch/poc/browser-smoke.cjs
node scratch/poc/browser-smoke.cjs brb-smoke.html
node scratch/poc/browser-smoke.cjs audio-smoke.html
```

45 unit tests currently pass. The audio browser smoke uses a loopback **simulated OBS v5 server**, verifies the actual browser WebSocket handshake/subscription, changing meters, input filtering, settings dialog, and visible image changes in all three scenes. It never connects to or controls real OBS. The existing two scene smokes also pass. Live OBS/CEF integration, stream-time performance and perceptual intensity still need review on the streaming machine.

`poc/mock-obs.cjs` is only a test fixture; it is not needed for normal use.

## Protocol research

- Official OBS WebSocket v5 protocol: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
- Event implementation: https://github.com/obsproject/obs-websocket/blob/master/src/eventhandler/EventHandler_Inputs.cpp

The upstream protocol documents 50 ms input-meter updates, explicit high-volume subscriptions, and SHA256/base64 authentication. Our client implementation is independent; no OBS plugin source is copied into the library.
