# Celestial renderer provenance

The production renderer is extracted from this project's accepted `scratch/poc` implementation, retaining the celestial geometry, stipple rendering, particle flow and audio responses. Production-only integration resolves asset/worker URLs relative to this library and removes diagnostic text from the clean output; health messages go to the configuration preview instead. Surface maps load only for the current scene (none for BRB) and are reused on scene changes; stale image/worker callbacks are ignored after cleanup.

The black-hole physics and worker originate from the owner's project:
https://github.com/8heart-under-blade/Retro-BH
Inspected upstream commit: ad884f24cde3fb2051e71916133a738efb5bca13.

The remaining custom library/application work was developed in this repository. No OBS plugin source is copied into the WebSocket client; it implements the documented read-only meter protocol.

Surface maps have their own CC BY 4.0 attribution in `assets/ATTRIBUTION.md`. Fonts are under their respective SIL OFL licenses in `public/fonts/`. No additional software license is assigned by this notice.
