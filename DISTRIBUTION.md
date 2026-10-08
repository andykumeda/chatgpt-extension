# Distribution status

## Current decision — 2026-10-08

The supported release uses the command-line alternative to paid Apple signing. The supported path is a public Git clone or source ZIP, `./install.sh`, and `npm run update`. No Apple membership, Xcode, notarization, Sparkle key or Mac companion is needed. Chrome uses an unpacked extension with a manual Reload after updates. Chrome Web Store publication remains optional and deferred.

The earlier Swift companion, Mac packaging and Sparkle tooling are preserved as deferred work. Their paid signing workflow has been moved out of `.github/workflows` to `distribution/deferred/signed-release.yml`; it cannot run automatically. No signing credentials or keys have been created.

## Ledger

| Workstream | Owner | State | Acceptance / evidence / remaining gates |
| --- | --- | --- | --- |
| Public repository | Codex | Deployed | Approved public visibility and anonymous access verified in prior phase |
| Source installer | Codex | Verified | Fresh workspace, repeat install and moved checkout preserve history/config; refuses active hosts, unknown origins and missing saved workspace; isolated native-message handshake |
| Source updater | Codex | Verified | Official main only, clean checkout, idle host, fast-forward only, tests/checks before re-registration; local two-version Git fixture with dirty/live/divergence refusal |
| Source CI/release workflows | Codex | In progress | No Apple credentials; tests/checks/source ZIP/extension ZIP; publication authorized; hosted CI and release verification in progress |
| Signed companion / Sparkle / Web Store | Deferred | Not started | User declined paid Apple distribution; not part of current delivery |

## Runtime contracts

- Native host `com.local_codex.sidepanel`; extension ID remains `glaknpkkjijfaoebdmoppooapeakaace`.
- Source launcher/config live in the checkout's ignored `.runtime`. Launcher records absolute Node and bridge paths; registration lives under Chrome's user NativeMessagingHosts directory.
- Preserve existing state, Codex home and explicit runtime recovery settings when reinstalling or moving folders. Default chat index is `~/.codex/local-sidepanel/chats.json`. Saved chats keep their original workspace.
- Page context is automatically captured on send. Model and reasoning effort remain in the composer; other controls remain in App settings.
- Extension handshake checks bridge protocol compatibility before initializing Codex. Source setup/update guidance replaces companion-app instructions.

## Release preparation

`npm test`, `npm run check` and `/bin/sh -n install.sh` verify source. A clean committed checkout is required for `npm run bundle` and `npm run bundle:extension`; artifacts/checksums go to ignored `output/releases`. No credentials, ignored state or Git history are packaged by `git archive`.

`.github/workflows/distribution.yml` checks and packages source on main/PR/manual runs. `.github/workflows/release.yml` publishes only via workflow_dispatch with approve_publication=true on main, after tests/checks and packaging. Existing version tags are refused. No tag push automatically invokes Apple tooling or publishes a source release.

Source publication and the 0.3.0 release are authorized and being verified. Installation/update verification uses isolated homes and local repositories; real Chrome registration, user chats, Node/Codex installation and running turns remain untouched. See INSTALL.md for the supported user flow and VERIFICATION.md for test results.
