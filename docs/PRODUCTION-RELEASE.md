# Production releases

`development` is the working branch. Promote reviewed changes to `prod`; it is the release branch. A push or pull request to `prod` builds unsigned Windows x64 and glibc Linux x64 candidates, runs the source regressions, and smoke-tests the extracted bundles. macOS and Linux ARM64 are not in the production matrix.

## Create a release draft

1. Confirm the production run on the exact `prod` commit is green. Download and test the actual candidates in OBS as described in [the checklist](RELEASE-CHECKLIST.md).
2. Ensure `package.json` has the intended version and `docs/RELEASE-NOTES-<version>.md` exists on `prod`.
3. Create and push an explicit version tag on the current `prod` commit. Example:

   ```sh
   git fetch origin
   git tag -a v0.1.0 origin/prod -m "OBS Retro-BH 0.1.0"
   git push origin refs/tags/v0.1.0
   ```

4. GitHub Actions re-runs the Windows/Linux builds. It checks that the tag equals `v<package version>` and points to the current `prod` commit, verifies the downloaded archive digests, then creates a **draft GitHub Release** with both archives and `SHA256SUMS`. Keep `prod` still until the tag run ends. A branch push alone does not create a release.
5. Check the draft’s release notes, assets and checksums. Publish in GitHub only after the final release checks. The workflow never publishes the draft.

Build jobs have read-only repository permissions. Only the tag-only draft job can write release metadata. There is no signing, notarization, or real OBS validation in CI. The separate portable candidate workflow can build additional targets when dispatched from GitHub; manual dispatch availability depends on the repository's default branch.
