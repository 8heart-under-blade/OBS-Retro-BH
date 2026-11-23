# OBS Retro-BH 0.1.0 — draft release notes

Local OBS Browser Sources for Starting, BRB, and Goodbye. The portable downloads bundle Node.js, fonts, and artwork; no separate Node installation or cloud account is needed.

## Downloads planned

- **Windows x64:** `obs-retro-bh-0.1.0-windows-x64.zip`
- **Linux x64 (glibc):** `obs-retro-bh-0.1.0-linux-x64.tar.gz`
- **Checksums:** `SHA256SUMS`

macOS is deferred for this release. Linux ARM64 is a build target, not a verified release download.

## Quick start

1. Extract the archive. Run `Start.cmd` on Windows or `./start.sh` on Linux. The studio opens in your default browser, or visit http://127.0.0.1:8090/config.
2. Choose a scene, edit its titles or timers, and click **Save to OBS**. Paste each scene URL into an OBS Browser Source set to **1920 × 1080**.
3. Audio reactions start off on a new install. Enable them in the Audio tab to use the local OBS WebSocket connection. Keep the launcher open while streaming; press **Ctrl+C** to stop.

Settings live outside the app folder. Stop the studio before replacing it with a newer version. The packages are unsigned and bind to localhost only.

See [Portable quick start](PORTABLE.md) and the [release checklist](RELEASE-CHECKLIST.md). The software is MIT-licensed, with separate licenses for the bundled runtime, fonts, and textures. Do not publish until the remaining release checks are complete and the owner approves publication.
