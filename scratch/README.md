# Celestial Ink — research + POC

All experimental work is isolated here. Nothing is installed or changed outside scratch.

## Run

From the project root:

```sh
node scratch/poc/serve.cjs
```

Open http://127.0.0.1:8088 for the scene switcher. HTTP is required for the black-hole worker; do not open index.html directly.

OBS Browser Source URLs (1920 × 1080, 30 FPS):

- Starting: http://127.0.0.1:8088/?scene=starting&obs=1
- BRB: http://127.0.0.1:8088/?scene=brb&obs=1
- Goodbye: http://127.0.0.1:8088/?scene=goodbye&obs=1

The local server must remain running. obs=1 hides preview buttons. Optional title and subtitle query parameters override copy (URL-encode values). Enable “Shutdown source when not visible” in OBS to release resources for inactive sources. This restarts scene time on reactivation.

## Audio-reactive update

OBS WebSocket loudness/peak reactions are now implemented across all three scenes, including the requested objects plus asteroid dust, aurora and stars; the Sun reacts through its surface and sunspots, without geometric flare loops. See **[AUDIO.md](AUDIO.md)** for setup, exact mappings, security and test details. Pages default to the local OBS socket on port 4455. Use the AUDIO button (or A in OBS Interact) for source/intensity/authentication settings; `audio=off` disables connection and `audio=demo` is an explicitly synthetic visual test.

## Research findings

Reference: https://github.com/8heart-under-blade/Retro-BH
Inspected commit: ad884f24cde3fb2051e71916133a738efb5bca13
OBS reference: https://obsproject.com/kb/browser-source

The reference is dependency-free Canvas 2D, not a shader or video. A worker computes Schwarzschild null-geodesic disk intersections using RK4. Flux, radius and azimuth maps are transferred to the UI. Stable per-pixel grain, exposure, warm monochrome colors and slowly advected texture provide its visual identity. Geometry only needs recalculation on camera or viewport changes. This separation is suitable for a custom library.

The owner confirmed ownership during this session. The POC therefore incorporates the original physics.js and raytracer-worker.js under poc/blackhole, and adapts the grain/exposure treatment from script.js. No slides, controls, styles, or other original page UI are reused. The repository has no license file: add an explicit license before publishing the resulting library for others to use.

## POC architecture

poc/celestial-ink.js exposes window.CelestialInk.Scene:

```js
const scene = new CelestialInk.Scene(canvas, {scene:'brb', fps:30});
scene.setScene('goodbye'); // starting | brb | goodbye
scene.pause();
scene.start();
scene.destroy();
```

- Starting: eight mapped planets with JPL J2000 eccentricities, inclinations, nodes and perihelion directions. Kepler's equation sets orbital position and nonuniform speed; actual relative periods run at 12 simulated days per second. Sun-centered directional Lambert lighting is computed in the same camera frame as the planets. Jupiter bands, Venus clouds and Saturn rings are retained in monochrome. Saturn's rings use a tilted 3D annulus with front/back occlusion, Sun-facing ring illumination, and a sphere/ray shadow test so Saturn casts a shadow onto its rings. Shadow edges are artistically feathered for resolution stability; ring self-shadowing and rings casting onto the planet are not modeled. Jupiter's existing mapped Great Red Spot is enhanced with a darker oval, lighter rim and stylized swirl detail, anchored to the map's southern storm location. Its opening spin phase presents the spot toward the camera; it rotates and receives Sun lighting with the surface. This is a readability enhancement, not present-day storm tracking or fluid simulation.
- BRB: original curved-light-path physics, 75-degree inclination and warm monochrome colors. No interactive dust displacement. Approx. 180,000 sampled-ray cap. The ray map supplies geometry/flux, not visible upscaled pixels: seeded, jittered display-resolution samples are drawn as soft-edged round sprites (roughly 1.45–1.8 CSS px cores with 2.5–3.1 CSS px tapered footprints), with smoothly varying opacity and normalized brightness to reduce subpixel shimmer. Higher display resolutions add grains rather than enlarging squares. A very faint continuous disk layer uses image smoothing; the bright grains remain sharp. Map interpolation is a display approximation, not extra physical ray tracing. Main-disk grains advect along mapped constant-radius contours using the local radius/azimuth Jacobian, with restrained differential angular playback, bounded velocity, and midpoint integration. Velocity interpolation uses the same pixel-center convention as flux sampling. Each grain carries fixed seeded coverage with it; lighting is eased over 0.45 seconds instead of repeatedly crossing a visibility threshold. Local motion spans are short (5–8 second lifetimes, 1.4 second fades, maximum 3.5% normalized travel), and grains retire before entering velocity sinks or abrupt speed changes. The faint widened base is cached rather than recalculated each frame. The upper arc flows right-to-left and foreground left-to-right. Samples fade/recycle at lifetime or discontinuities rather than jumping across the shadow. Singular main-disk map regions may remain stationary. The thin lower lensed image (below 66% of scene height) now has its own slow, bounded flow: each grain moves right-to-left on a quadratic curve fitted to the lower image's flux-weighted centerline, retaining its seeded offset and fading before recycling. Screen-space motion bends down on the right and up on the left, following the underside crescent. Source-map support is eased over 0.35 seconds at boundaries; no lower-arc particle integrates into a velocity sink. Its motion is limited to less than 1.5% normalized distance from its seed, preserving the secondary image without the previous pileups/streaks. This is visual tracer motion, not a fluid simulation. Pause/reduced-motion freezes both positions and texture. Outer horizontal coordinates are gently expanded by up to 18%, leaving the central shadow region unchanged; this is an artistic screen-space adjustment, not a new physical disk model. A status message is shown while tracing.
- Goodbye: real equirectangular Earth day and Moon maps, sampled in rotating body coordinates (not generated continents/craters). Earth's map colors are classified into subdued blue-dominant ocean and brighter land/ice before stippling, emphasizing the existing real coastlines without drawing fictional contours. Earth's rendered spin axis and the Moon's orbit share a rigid 3D ecliptic/camera reference frame: Earth obliquity is 23.43928 degrees, lunar inclination to the ecliptic is 5.145 degrees. The lunar node is fixed at an illustrative 45 degrees, not a current-date value; the resulting angle to Earth's equator is derived, not independently hand-tilted. Tests cover the full 18.29428–28.58428 degree mutual-inclination range as node orientation varies. The Moon follows this inclined circular orbit (60-second display period), passes in front/behind with depth ordering, and uses a full orthonormal attitude basis to keep its near-side normal pointed at Earth. Goodbye now auto-fits the full lunar orbit across the available width (4.5–95.5% of the screen), with larger Earth/Moon bodies and a shallower shared camera view. The full orbit and body extents stay inside 11.5–67.5% of screen height to leave the title and footer clear. At 1920×1080 Earth radius is ~286 px, Moon radius ~78 px and orbital radius ~798 px. Higher sphere sample counts preserve grain density as Earth grows; none of this changes the enforced relative plane angles. Both use the same distant Sun direction. Solar System Scope NASA-based maps are resampled to monochrome stipple; see poc/assets/ATTRIBUTION.md for CC BY 4.0 credits and modifications.
- Shared presentation: near-black green, warm ivory, subdued telemetry, restrained text. Titles and preview controls are a new POC shell, not the reference's UI.
- Seeded grain, resize handling, scene selection, lifecycle cleanup, reduced-motion initial state and hidden-page render skipping.

## Validation and limits

Passed: fifty-one POC math/orbit/layout/sunspot/photosphere/storm/ring-shadow/black-hole-grain/flow/frame-timing tests, JavaScript syntax checks, all 13 upstream physics/particle tests, and real-time headless Chrome smoke tests loading all nine surface maps, rendering solar and Earth/Moon scenes, and tracing/rendering BRB with the actual original worker and new rounded grain, including assertions that main-disk and lower-arc tracer positions move over multiple frames and the lower arc stays within its motion bounds. Unit tests also simulate a minute of lower-arc motion with pause, fixed grain coverage and recycling checks. The browser runner uses real time so workers can finish before assertions. The animation clock preserves scheduled frame deadlines with timestamp tolerance, avoiding the old irregular 30 FPS cadence on fractional 60 Hz timestamps. Timing regressions cover jitter and stalls; perceptual flicker and OBS performance still require viewing on the streaming machine. These do not establish OBS performance. OBS/CEF rendering, frame timing, source switching and 1080p GPU/CPU cost still need testing on the streaming machine. The audio update additionally passes a browser smoke with a simulated OBS v5 WebSocket server: authentication math/unit handshake, live meter ingestion, source filtering, UI off/demo modes and reactive scene rendering are tested. This does not substitute for live OBS/CEF audio integration or encode-time performance testing. No claim of a production-ready package.

The solar system uses frozen J2000 orbital shape/orientation elements, not a current-date/live ephemeris or n-body simulation. Initial mean longitudes are deliberately composed per planet to spread them around the screen (not a shared historical alignment); Keplerian evolution and relative periods are retained thereafter. Earth uses the Earth/Moon barycenter approximation from JPL. Each orbit has a separate display-distance scale to keep the inner planets legible, but retains its eccentricity and inclination; body radii now follow one square-root-compressed physical-radius scale (including the Sun), rather than independent hand-picked planet sizes. A literal common radius scale would make terrestrial planets too small. The whole system, orbit paths and Saturn rings auto-fit the full scene region (3.5–96.5% width, 10.5–90% height) on resize. Camera elevation adjusts to the available aspect ratio to use both dimensions instead of leaving a flat upper strip. Titles/buttons overlay this expanded scene; planets may pass behind overlays as time progresses. Relative orbital periods are preserved under a shared accelerated clock. Solar-system spin and axial-tilt presentation remain illustrative; Goodbye instead enforces the shared Earth-axis/lunar-orbit plane relationship described above. The Sun uses an even photosphere with gentle limb darkening (no sinusoidal bands). Grain is sampled from smooth seeded 3D noise in rotating body coordinates, with subtle evolving granulation, rather than a static screen-space mask. To reduce shimmer, solar rotation and fine-detail frequency are restrained and grain uses smooth opacity coverage instead of binary visibility. A temporal regression test checks average opacity changes at 30 FPS; actual display/OBS perception still needs review. Pause/reduced-motion freezes the time-dependent detail. Seeded paired sunspots emerge, rotate, and fade; a 90-second artistic activity cycle represents the roughly 11-year solar cycle, with active latitude bands migrating equatorward. This cycle is intentionally separate from the 12-days-per-second orbital clock; it is not solar activity prediction. Solar illumination direction is physical, but exposure omits inverse-square dimming so outer planets remain visible. Earth/Moon composition uses exaggerated separation and an illustrative circular lunar orbit with accelerated playback, not a lunar ephemeris or two-body barycentric model. The Moon/Earth radius ratio is approximately physical; eclipse shadows, nodal precession, lunar eccentricity, lunar axial obliquity and libration are not modeled. Earth spin/lunar orbital periods still use independent display timing, so their real period ratio is not enforced. Maps include provider adjustments/infill, not raw scientific albedo data. The original black-hole model is Schwarzschild (non-spinning), an infinitely thin disk and simplified emission, not full radiative transfer.

## Next decisions

1. Review the three looks, framing and title placement at stream resolution.
2. Review actual mapped Earth/Moon contrast and Sun-facing phases; decide whether to offer a separate true-distance scale mode.
3. Benchmark during an actual OBS encode before choosing Canvas CPU vs WebGL acceleration.
4. Then extract a distributable library (module exports, worker URL configuration, public types, tests and license). This version deliberately remains a scratch POC.

## Tests

```sh
node --test scratch/poc/*.test.cjs
node scratch/poc/browser-smoke.cjs
node scratch/poc/browser-smoke.cjs brb-smoke.html
node scratch/poc/browser-smoke.cjs audio-smoke.html
```

`scratch/research/` is local-only and excluded from Git, including the upstream clone, downloaded research pages and Chrome profiles. To reproduce the optional upstream physics/particle checks on a fresh checkout:

```sh
git clone https://github.com/8heart-under-blade/Retro-BH.git scratch/research/Retro-BH
git -C scratch/research/Retro-BH checkout ad884f24cde3fb2051e71916133a738efb5bca13
node --test scratch/research/Retro-BH/physics.test.js scratch/research/Retro-BH/particles.test.js
```

The POC already contains the black-hole physics/worker files it needs; the research clone is not required to run it.
