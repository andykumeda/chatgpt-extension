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
| Source CI/release workflows | Codex | Deployed | Hosted checks and release passed; public v0.3.0 source/extension ZIPs and checksums verified anonymously; extracted source tests and isolated installation passed |
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

Source version 0.3.0 is published at https://github.com/andykumeda/chatgpt-extension/releases/tag/v0.3.0 from commit `3ed4b41ab257bb98530562fbd5b5a8b768e4883a`. Both hosted workflows passed. Anonymous downloads match GitHub asset digests and published checksums. The downloaded source ZIP passes all 39 tests, syntax checks and isolated-home installation. A fresh public Git clone also passes installation and npm run update. Installation/update verification uses isolated homes and local repositories; real Chrome registration, user chats, Node/Codex installation and running turns remain untouched. See INSTALL.md for the supported user flow and VERIFICATION.md for test results.

## Latest patch: 0.3.1

Published at https://github.com/andykumeda/chatgpt-extension/releases/tag/v0.3.1 from `f9bf42807f9a076990bb7495bfd82c9fa4ecd74f`. Chrome internal pages/Web Store now allow ordinary chat with No page attached; normal website capture failures still block sending without stale text. Local ARM tests and panel smoke pass; hosted Intel CI 37812257099 and release 37812289315 pass. Four public assets verified anonymously; downloaded source passes 42 tests, syntax and isolated installation. A real public Git update from 0.3.0 to the patch preserved synthetic history, a custom workspace and explicit runtime recovery. MacBook itself was not accessed.

The original ARM jobs 37811537454/37811576615 were cancelled while queued; source-only workflows now use macos-15-intel to avoid that runner-capacity delay. Apple native companion packaging remains deferred.

## Dock-free companion development update: 0.3.2

The requested companion fix adds LSUIElement and direct background sign-in with cancellation and an in-window Quit button. Optional ad-hoc-signed development ZIPs are distinct from the supported source installer; Developer ID signing, notarization, Sparkle publication and Web Store remain deferred. ARM runtime checks verified accessory activation policy (no Dock entry), fixture sign-in/cancellation without a Terminal process, and the packaged native host handshake in an isolated home. No real authentication or MacBook runtime was exercised. Published at https://github.com/andykumeda/chatgpt-extension/releases/tag/v0.3.2 from `45b1c9c5e2966c6e1c111db3ad6130abafaecef7`. Hosted source checks 37859400897 and release 37859410539 passed. All eight public assets were downloaded anonymously and matched GitHub digests and published checksums. Both companion ZIPs preserve valid ad-hoc signatures after extraction; Intel was verified statically, not executed on this ARM host. Final ARM app fixture login completion also refreshes automatically; cancellation and Quit pass.

## Automatic website access update — 0.3.3

Verified locally; publication pending. App settings now offers an explicit optional HTTP(S) website-access request so automatic page attachments survive site changes. Chrome confirmation is required once per installation; no access is requested automatically, no draft is submitted after approval, and restricted pages remain excluded. The real missing-permission failure, grant/cross-origin capture/revocation and internal-page exclusion pass in an isolated Chrome test. Panel integration and 42 tests/checks pass. Release contains source/extension ZIPs only; existing 0.3.2 companion/bridge remains compatible. Sparkle remains unconfigured.
