# Task Ledger

States: Not started, In progress, Blocked, Verified, Deployed.

| Stage | Owner | State | Acceptance / verification | Evidence / blockers |
| --- | --- | --- | --- | --- |
| 1: Interface and workspace | Codex | Verified | Official docs + installed schema; real auth/connectivity; canonical path checks; sandbox file writes and Documents denial | `npm run probe`: CLI 0.160.0 initialized, managed ChatGPT account recognized, workspace write succeeded, Documents touch denied with no file created. Default canonical workspace checked. |
| 2: Bridge and side panel | Codex | Verified | MV3 native messaging, streaming, explicit bounded page attachment, workspace picker, owned chat resume | bridge/ and extension/ implemented. 10 unit tests pass. Syntax/manifest checks pass. Real live-smoke passed with 50 text deltas, restart/resume memory, original workspace file output and invalid paths. |
| 3: Browser and install | Codex | Verified | Browser -> native bridge -> Codex; new/resumed/restarted/invalid flows; installation docs | Actual Chrome side-panel native UI verified: capture incl. selection, response, reconnect/resume, workspace file, Documents rejection, missing workspace error, original workspace preserved. README.md and VERIFICATION.md document installation/evidence/limits. Normal Chrome host registered; test profile isolated. |
| 4: GitHub sharing | Codex | Verified | Private source repository; exclude runtime/history/logs; portable installation instructions; verify pushed commit | Private `andykumeda/chatgpt-extension` created; signed initial source commit `8b2c811` pushed to main with SSH origin. 10/10 tests, syntax/manifest and staged whitespace checks pass. Source credential-pattern scan found no matches; only 24 source/docs/test files tracked. Bitwarden agent recovered; signing remains enabled. Remote main verified against the local source commit. |

## Downloadable bundle

State: Deployed (download only, not a production application). Release: https://github.com/andykumeda/chatgpt-extension/releases/tag/v0.1.0. Source: 6562e2170877a115f0e630ae2681d9aed90a7873. macOS ZIP: 41,453 bytes; SHA-256: 2497c21aaaea2e600a8bd840017bb9a9582312793dc5fec46a20f2a066394d1a. ZIP and checksum uploaded through Composio CLI; GitHub asset digest matches local checksum. Extracted 10/10 tests and syntax/manifest checks pass. Isolated-home installer registered the canonical extracted host path and separate local state without creating Documents. The first verification assertion used a noncanonical temp path; canonical-path verification passed without changing the installer. Archive excludes runtime/output/schemas/Git history/logs and contains no bundled credentials or Node/Codex runtime. Installation instructions included. Another physical Mac has not been tested. Downloaders need access to the private repository.

## Live browser upgrade

State: Deployed (prerelease download, not full product parity). Release: https://github.com/andykumeda/chatgpt-extension/releases/tag/v0.2.0. Source: 564f2d5f445a752c3ff903d6e76bcb04796e19e4. ZIP: 59,689 bytes; SHA-256: 038c0d979232f017807611703dba2e6c547b2a5b9c189ba0a27ad3fa05ab9d15. Both assets uploaded and GitHub digest matches local. Extracted 15 tests, syntax checks, isolated installer, Downloads guard and artifact-exclusion checks pass. User approved live reading plus click/scroll/navigation/form filling. BROWSER.md records documented experimental API compatibility, implementation scope and exact verification. Upgraded live chat/file/path regression, real model dynamic tool/resume and Chrome/native model-driven actions pass. Browser action denial preserved the field value; narrow approval layout inspected. Cross-origin native site-permission dialog and updated native side-panel toolbar flow remain live-verification gaps. Existing runtime/auth/workspace boundaries remain unchanged. MacBook v0.1.0 connection succeeded after moving from Downloads; v0.2.0 MacBook verification remains pending. Henry identified as user's dot, but available agent/thread tools did not expose a Henry target; no message sent and no unresolved permission blocker.

## Current state

### Missing tab URL error (2026-10-07)

Follow-up verification: With explicit user approval, clicked Local Codex's toolbar icon on the user's selected LinkedIn tab; Chrome changed Wants access to Has access. A read-only model-driven `local_browser` request returned the correct page title and URL and reached Completed. No browser actions or workspace edits were requested or approved. This verifies recovery on the user's actual tab, not just the public example fixture.

State: Verified locally, not pushed or packaged. User's real side panel showed Invalid URL while the toolbar reported Local Codex wants access to the selected site. Chrome activeTab docs confirm URL metadata requires a tab grant and cross-site navigation revokes it. Added explicit missing-metadata guidance, guarded URL parsing, and regression coverage for withheld URL and stale grants; no new permissions. 17/17 tests, syntax/manifest and whitespace checks pass. Reloaded only the prototype extension. In the actual normal Chrome side panel on public example.com, toolbar invocation changed Wants access to Has access, the model's live read returned title Example Domain and URL https://example.com/, and the turn completed. Returned to user's original tab/chat and restored the unsent prompt and live-browser checkbox without granting access to or sending that page. Missing-metadata handling verified by unit tests; native cross-origin permission dialog remains unverified.

### Mini connectivity repair (2026-10-07)

State: Verified locally, not pushed or packaged. Reproduced normal Chrome native-panel timeout and Codex exit. Registered host and managed authentication work with fresh runtime state under both Node 22 and 26. Existing prototype SQLite runtime fails Codex initialization after approximately 30 seconds; sanitized stderr identifies SQLite runtime startup timeout, although all five databases pass read-only integrity checks. No database deleted, moved, or manually repaired. Added explicit optional `runtimeState` configuration to separate disposable Codex runtime from the unchanged extension chat index. Local ignored host config selects `~/.codex/local-sidepanel/runtime-recovery-20261007`. Actual Chrome side panel now connects using managed ChatGPT auth, streams/completes the pending test prompt, reconnects/restarts the bridge, restores the transcript in `/Users/andy/.codex/Codex`, and completes a second turn (`MINI_RESUME_OK`). Installer rerun preserves explicit runtime selection. 16/16 tests, syntax/manifest and whitespace checks pass. Underlying Codex SQLite timeout cause remains unresolved; this is isolated runtime recovery, not database repair. Cross-origin browser permission verification remains deferred as recorded above.

Prototype implemented and verified locally. Private GitHub repository: https://github.com/andykumeda/chatgpt-extension. Source is pushed on main; no production deployment. No official application, official extension, unrelated settings or existing chat database modified. Implementation and test scratch live in `/Users/andy/Dev/chatgpt-extension`. Normal Chrome prototype host: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.local_codex.sidepanel.json`. Normal prototype runtime: `~/.codex/local-sidepanel`; SQLite/logs explicitly isolated. Codex manages auth and creates its own new local session rollouts. Test profile/state are under this checkout. Superseded incorrect test-host registration was removed without touching the official host. See VERIFICATION.md for actual passing checks and compatibility limitations, including unrestricted model reads and the failed/replaced Playwright side-panel attempt.

## Chat layout and automatic page context (2026-10-08)

| Workstream | Owner | State | Acceptance / scope | Verification / release |
| --- | --- | --- | --- | --- |
| Chat layout and settings | Codex | Verified | Screenshot layout, separate App settings, no voice; `extension/panel.html`, `panel.css`, `panel.js`, `mark.svg` | Synthetic Chrome integration passed at 320, 390, 768, 1024 and 1440px; actual Chrome panel/menu/settings inspected. Duplicate in-panel header removed; Chrome supplies its own. Shared panel files require serial implementation. |
| Model picker | Codex | Verified | Runtime catalog, model/effort controls, validated `turn/start` selection; `bridge/service.mjs`, panel | Real runtime discovery passed (7 models); live picker loaded GPT-6.1-Sol; bridge pagination/filter/validation/turn selection test passed. |
| Automatic page context | Codex | Verified | Fresh snapshot before every send; no manual attach; blocked capture preserves draft and prevents stale send | Synthetic fresh-send and denied-capture checks passed; actual current-page title appeared without attachment interaction. Existing site permissions retained. |

Release: local checkout only, not committed, pushed, or packaged. Prior unrelated fixes remain preserved. Chrome still requires a site grant; unsupported pages cannot be attached. Actual native connection, picker, settings and automatic preview verified. A new real inference turn was not sent in this UI pass.

## Distribution preparation — 2026-10-08

| Workstream | State | Evidence / remaining gates |
| --- | --- | --- |
| Public repository | Deployed | Explicit switch approved; GitHub reports public and anonymous access verified; targeted history scan performed before switch |
| Companion app/setup | Verified | Swift build, 10 isolated helper tests, ARM bundled-runtime install + native handshake; real UI detects sign-in and blocks replacement while bridge runs |
| Extension compatibility/package | Verified | Protocol regressions; complete reproducible ZIP; panel smoke prevents incompatible/legacy startup |
| Local Mac packaging/release tooling | Verified | ARM app/DMG/ZIP; Intel cross-build/static signature checks; checksums; guarded workflows prepared locally |
| Production distribution | Not started | Developer ID/notarization credentials, dedicated Sparkle key, protected GitHub environments, final source/release publication and Chrome Web Store publisher/submission approval; native Intel execution and hosted CI pending |

Source changes remain local and uncommitted; existing user changes preserved. Update source of truth: [DISTRIBUTION.md](DISTRIBUTION.md). Local output is development-only and not notarized.

## Free source distribution — 2026-10-08

Supersedes the Apple signing plan: Andy declined the annual fee and approved command-line installation/updates. Earlier signed companion/Sparkle and Chrome Web Store work remains deferred.

| Workstream | State | Acceptance and evidence |
| --- | --- | --- |
| Source installer | Verified | ./install.sh, fresh default workspace, preserved state/recovery/moved checkout, active-host/unknown-host/missing-workspace refusal; isolated native handshake |
| Source update command | Verified | npm run update, official main, fast-forward only, checks before host registration; dirty/live/divergent fixture refusals |
| Source release workflow | In progress | Source-only checks/packages; manual explicit publication; paid workflow moved out of Actions; hosted CI/publication pending |

Real Chrome registration and chats were not changed. Production source publication remains a separate final step. Current source of truth: DISTRIBUTION.md and INSTALL.md.

- Source package verification completed: source ZIP extraction and all 39 tests pass; shell, syntax/manifest, YAML and updated panel smoke pass. Review candidates: output/candidates/source. Public commit/push/release is pending final approval because the candidate includes earlier uncommitted chat UI/bridge work. No paid signing or publisher setup is required for this path.

## Source release 0.3.0 publication

State: In progress. Source commit/push, hosted checks and public release authorized. Includes the prepared chat UI/model/automatic context changes, runtime/browser fixes and free source installer/updater. No Apple enrollment, signing keys or Web Store submission is part of this release. Hosted verification results will be appended after execution.
