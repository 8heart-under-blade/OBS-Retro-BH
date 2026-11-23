# Portable release gates

## Decision

Ship unsigned candidate archives containing the official Node runtime, static assets, local server and a thin platform launcher. Keep the server in the foreground; Ctrl+C stops it. Keep configuration outside extracted files; no automatic migration from the source checkout. Keep OBS and the studio on loopback. Port 8090 is stable (explicit `PORT` override, no fallback). No process termination by PID, remote shutdown route, installer, auto-updater or cloud service.

The council considered a native menu-bar app, background launchers and single-file executables, but deferred them to keep the first release auditable and the startup/shutdown behavior predictable. Candidates target Windows x64, macOS Apple Silicon and Intel, and glibc Linux x64/ARM64. A built candidate is **not** a platform support claim.

## Automated gate (candidate artifacts)

- Run production and POC suites, plus browser integration with mock OBS.
- Verify the pinned Node downloads before extracting; package only the intended payload and licenses/notices; verify archive checksums on download.
- Smoke-test the extracted artifact on a matching runner, separate from the source tree, with a clean outside data directory and no reliance on system Node for launch. Verify settings persistence, conflict handling, loopback binding and graceful shutdown.
- Confirm executable bits on Unix artifacts and shell quoting for spaces in extracted paths. OS trust prompts and OBS CEF behavior are outside these automated checks.
- Branch and PR jobs only build/upload CI artifacts. An explicitly pushed version tag on `prod` can create a draft using a job-scoped write token. No workflow creates a tag, publishes a release, or changes repository visibility.

## First release scope: Windows and Linux

The owner asked to skip macOS testing for this release. Keep the macOS build targets for later, but do not include macOS downloads or list macOS as supported in the first release. Treat Linux ARM64 as a candidate only unless verification on that architecture is recorded.

## Confirmed on the Windows x64 portable candidate

- The owner verified that `Start.cmd` reports an occupied port, launches the studio after port 8090 is free, shows the expected external settings folder, and stops with Ctrl+C.
- The owner verified audio reactions in real OBS on all three scenes: Starting, BRB, and Goodbye. Upgrade, sustained encoding, and other platform checks are not confirmed by this test.

## Linux confirmation

The owner reported that the Linux test worked. The distribution, CPU architecture, OBS version, and exact test scope were not provided; do not infer ARM64 or real-OBS audio coverage from that report.

After the user checks, the Windows x64 and Linux x64 archives were rebuilt with Node.js 24 LTS to avoid the newer runtime's additional Linux library requirement. Both rebuilt archives passed checksum and extracted-package smoke tests (Windows and x64 Ubuntu on WSL respectively). Those checks do not replace real OBS tests of the final downloads.

## Manual gate before public distribution

- [x] Owner approved MIT licensing for project code, including their reused original Retro-BH code. Keep the project MIT license, the Node runtime license, font OFLs and map attribution in each bundle.
- [ ] On each claimed OS/architecture, extract the actual release archive on a clean account without installed Node; launch the app, save settings, stop and restart. Check the default-browser action and the documented manual URL fallback.
- [ ] Upgrade from the previous candidate without replacing the external settings directory. Verify titles, CSS, timers and OBS URLs stay intact.
- [ ] In real OBS, load all three Browser Sources at 1920×1080, verify scene switches and title changes, and test the audio bridge with the user's intended OBS WebSocket port and authentication. Check a sustained session under real encoding load.
- [ ] Record OS version, CPU architecture, OBS version, artifact hash and any limitations. Label hardware/OS combinations not exercised as unverified.
- [ ] Document platform trust prompts and signing status accurately. A checksum is not Authenticode or Apple notarization. Do not recommend disabling SmartScreen or Gatekeeper.
- [ ] Owner explicitly approves publication of the draft. The repository is already public; that does not publish a release.
