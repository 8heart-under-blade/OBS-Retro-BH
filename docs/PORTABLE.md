# OBS Retro-BH — Portable quick start

End-user quick start for the portable release candidate. This is the cross-platform quickstart intended for the root of the portable archives, where it ships as `PORTABLE.md`.

## What this is

A portable build of OBS Retro-BH:

- the official pinned **Node.js** runtime for your OS/architecture, bundled under `runtime/` (with its license);
- the local server and static artwork/studio assets under `app/`;
- a thin launcher in the bundle root: `Start.cmd` (Windows), `Start.command` (macOS), `start.sh` (Linux).

The portable candidate runs the bundled runtime directly; no system Node.js installation or `PATH` change is required. Candidate platforms: Windows x64, macOS Intel and Apple Silicon, and glibc Linux x64 and ARM64.

This is an **unsigned** candidate and **not** a public release. It is not notarized or Finder-approved, and no platform-support claim is made. OS trust prompts may appear; there are no steps here to bypass them.

## Run

1. Extract the archive for your platform into a writable folder.
2. For macOS and Linux candidates, **launch from a terminal** in the extracted bundle root. Do not bypass OS security warnings. Use the matching launcher:
   - macOS: `./Start.command`
   - Linux: `./start.sh`
   - Windows: `Start.cmd` (double-click or from a terminal)
3. Keep the terminal open while the server runs; press **Ctrl+C** to stop it.

On macOS and Linux the launcher must be executable; archives preserve the executable bit, and if your extraction loses it, run `chmod +x Start.command` (macOS) or `chmod +x start.sh` (Linux) in the bundle root before step 2.

The launcher starts the bundled portable entry in the **foreground** via the bundled runtime and keeps the process in the foreground for its lifetime. There is no background/daemon mode, no tray/menu-bar app, no native executable, no installer, no cloud component, no stop endpoint, no PID management and no port-probe fallback; the process runs until you stop it.

The launcher tries to open the studio in your default browser. If that does not work, use the printed URL. Pass `--no-open` to skip the browser launch.

While the server is running, open:

- Studio: http://127.0.0.1:8090/config
- Starting: http://127.0.0.1:8090/scene/starting
- BRB: http://127.0.0.1:8090/scene/brb
- Goodbye: http://127.0.0.1:8090/scene/goodbye

Keep the server running while using the Browser Sources.

The server binds to **loopback only** and listens on **port 8090** by default; override with the `PORT` environment variable (still loopback only; no fallback port is used).

## First run

- The first run creates settings if the external data directory has no saved state. Later launches reuse the same state. The portable launcher never imports the source checkout’s settings automatically.
- A fresh portable state starts with **audio reactivity off**. The source checkout (`npm start`) and the configuration schema defaults are unchanged.

## OBS setup (optional)

- The server holds one read-only OBS WebSocket connection; default `ws://127.0.0.1:4455`. Configure endpoint, source and intensity in the Audio tab, then Save; reconnect/authenticate after saving if needed.
- Authentication is session-only or via `OBS_PASSWORD`. The OBS bridge is optional; the studio and artwork run without it.

## Where your data lives

- Windows: `%LOCALAPPDATA%\obs-retro-bh`
- macOS: `~/Library/Application Support/obs-retro-bh`
- Linux: absolute path from `$XDG_DATA_HOME/obs-retro-bh`, or `~/.local/share/obs-retro-bh`
- Override: set `OBS_RETRO_BH_HOME` to an absolute path.
- Only one portable instance may write to a data directory, even if another port is selected. Stop with Ctrl+C. After a forced exit or crash, if the studio reports a stale `.studio-lock` directory, first verify that no studio is using that data directory, then remove **only** the empty `.studio-lock` directory. Leave `state.json` in place.

## Upgrade, import, export, uninstall and security

- **Upgrade:** stop the app, extract the new bundle, and start it with the same user data directory. It reuses your saved state. To transfer configuration from the source checkout or another machine, use the studio’s JSON export/import.
- **Import/export:** export/import operates on configuration via the studio.
- **Uninstall:** delete the app bundle; user data lives outside the bundle and may need separate removal.
- **Security:** the server is loopback only and never exposes the OBS socket or the studio to the LAN/internet; keep it local.

## Source checkout

- The source run remains: Node.js 22+, `npm start`; see the project [README](README.md).

## Gates

- The project code is MIT-licensed (see `LICENSE` at the bundle root). The separate Node runtime license is at `runtime/LICENSE`; the asset and font notices are included under `app/public/`.
- This quickstart covers the unsigned portable candidate only. Consult the release checklist for validation status and remaining publication gates.
