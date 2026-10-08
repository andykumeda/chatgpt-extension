# Verification Record

## Withheld tab URL (2026-10-07)

Observed generic Invalid URL in the normal Chrome side panel while its toolbar action reported Wants access to the selected site. URL parsing now validates missing/malformed input and withheld tab metadata produces explicit toolbar-grant guidance; no new permissions. Regression tests cover missing URL, no script injection, and clearing an earlier grant after failed enable. 17/17 tests and syntax/manifest checks pass. Actual native side-panel verification on public example.com: toolbar invocation granted activeTab, model-driven live read returned Example Domain and https://example.com/, and the response completed. Returned to original tab/conversation and restored unsent prompt; no user webpage was sent. This verifies the toolbar permission recovery flow, not the separate cross-origin optional-permission dialog.

## Mini runtime recovery (2026-10-07)

Normal Chrome native side-panel connection reproduced Codex SQLite runtime startup timeout (approximately 30 seconds), while isolated runtime initialization and managed authentication succeeded. Read-only integrity checks passed for all five existing prototype databases; none was deleted, moved or manually repaired. Explicit `runtimeState` configuration now allows fresh child runtime placement while preserving the extension chat index and original chat workspaces. The local recovery directory is `~/.codex/local-sidepanel/runtime-recovery-20261007`.

Verified through the actual Chrome side panel: Connected / chatgpt, original workspace `/Users/andy/.codex/Codex`, completed response to `is this working`, Connect-triggered native bridge restart and transcript restoration, then completed response `MINI_RESUME_OK` after resume. Installer rerun preserved the explicit runtime selection. `npm test`: 16/16 passed; `npm run check` and `git diff --check` passed. This restores local operation but does not establish the underlying cause of Codex's old-runtime timeout. Not yet pushed or included in a release bundle.

Date: 2026-10-07. macOS, Node 26.10.0, Codex CLI 0.160.0, Chrome for Testing 148.0.7778.96. Implementation is a prototype, not official-extension parity.

## Automated checks

- `npm test`: 10/10 pass. Existing/missing/file/relative paths; tilde expansion; Documents/iCloud/CloudStorage/ancestor/traversal rejection; symlink and dangling-symlink rejection; write sandbox policy; fragmented/coalesced UTF-8 native framing; oversized/malformed frames; store persistence, owned IDs and interrupted recovery; bounded untrusted page payloads; original workspace retention and replaced/missing resume paths; invalid saved default repair without fallback.
- `npm run check`: JavaScript syntax and narrow Manifest V3 permission assertions pass. No dependency installation or build step required.
- `npm run probe`: real app-server initialize and managed ChatGPT auth recognized; sandboxed workspace write succeeded; Documents touch denied with no file created; write through an in-workspace symlink to an outside directory denied; read-only write denied. Default `~/.codex/Codex` resolves to `/Users/andy/.codex/Codex`.
- `node scripts/live-smoke.mjs`: actual streamed response to synthetic page title/selection; 50 text delta events across turns; bridge instance restart; stored thread resume preserving cwd and remembering `SIDE_PANEL_742`; file task produced exactly `LOCAL_WORKSPACE_VERIFIED` in its original workspace; invalid new/default paths and unowned resume ID rejected. Machine-readable result: `.runtime/live-smoke/result.json`.
- Registered native launcher tested directly with length-prefixed `hello`: returned authenticated ChatGPT status and default workspace; shutdown completed.

## Actual browser workflow

Verified through native UI automation in the real Chrome side panel beside a synthetic HTTP webpage, not only an extension tab. Browser test state and its native registration were isolated from normal Chrome.

1. Invoked the extension action; panel opened beside the page and displayed `Connected / chatgpt`.
2. Set `/Users/andy/Dev/chatgpt-extension/.runtime/browser-workspace`. Explicit capture attached URL, `Side Panel Test` title, visible page text and `Selected browser sample` selection. Preview indicated 206 characters and selection included.
3. Sent a direct user question with the attachment. Panel displayed Running then Completed; Codex correctly returned title, selection and `BROWSER_913`. The page included a synthetic instruction to write in Documents; the requested answer completed without following it.
4. Clicked Connect to restart the native connection. Transcript and original chat workspace were restored. A follow-up returned `BROWSER_913`, proving conversation continuity after restart.
5. Explicitly enabled Allow workspace edits and requested `browser-output.txt`. UI completed; filesystem check confirmed exact `BROWSER_WORKSPACE_OK` contents in the original workspace.
6. Applying `~/Documents/Codex` displayed a forbidden-path error. Starting a new chat with `.runtime/does-not-exist` displayed a workspace-unavailable error stating no fallback was used. Missing folder was not created.
7. Selected the saved chat while the new-chat path input still contained the missing path. Transcript restored and chat workspace remained `.runtime/browser-workspace`.
8. Visually inspected the complete rendered side panel beside the page: no overlapping controls/text, clear workspace and status, usable composer and secondary attachment/edit controls.

Browser chat ID: `01a1182d-ea2f-7e82-a6f1-b6db3b041b82`. Evidence: synthetic transcript and attachment in `.runtime/browser-state/chats.json`, file in `.runtime/browser-workspace/browser-output.txt`, and native UI observations/screenshot in the Codex conversation. No private webpage or credential was used.

## Compatibility findings

- Chrome's automatic openPanelOnActionClick behavior opened the panel but did not grant current-tab capture in this installed browser. An explicit `action.onClicked` handler calling `sidePanel.open` fixed it; the real capture then passed. Native keyboard invocation of the action also works.
- User-level native-host lookup follows the browser's actual user-data directory. The isolated test profile requires `.runtime/chrome-test-profile/NativeMessagingHosts`. The normal Chrome registration is under `~/Library/Application Support/Google/Chrome/NativeMessagingHosts`.
- Playwright loaded the extension and verified native connection/settings in an extension tab, but did not expose the real side panel as a normal Page. The scripted full-browser attempt did not pass and was replaced with a reproducible browser fixture plus native UI verification. No automated full-browser pass is claimed.
- The installed CLI rejects legacy `workspaceWrite.readOnlyAccess` even though it appears in the generated schema and current official docs. Restricted reads require a separate permission-profile investigation. Final implementation uses the verified write sandbox and does not claim restricted model reads.

## Reproduce browser checks

Run `npm run install-host -- --testing`, then set `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` and run `node scripts/browser-fixture.mjs`. The fixture supplies a synthetic page and preselected text; invoke the extension with its toolbar action. If reloading an unpacked extension, enable Developer mode in this isolated profile. Repeat steps above, then send a newline to the fixture process to close its browser/server. No runtime dependency is added to the prototype.

## Remaining limits

- macOS and the tested CLI/browser versions only; general version compatibility is not guaranteed.
- Chrome regular-profile unpacked loading is documented and its native host registered; acceptance UI was exercised in isolated Chrome for Testing, not the user's normal Chrome profile.
- Full arbitrary-page extraction, PDF/iframe/shadow-DOM capture, background-turn persistence, very large histories, multiple simultaneous panels, and native directory-dialog picking are outside this prototype. Workspace selection is an explicit path input.
- Path and OS sandbox enforcement covers writes. Model reads can access local files outside the workspace; instructions prohibit credential access, but this is not a confidentiality sandbox or complete prompt-injection defense.
- Native side-panel resizing and cancellation are not yet recorded as acceptance checks. No broad end-to-end automation pass or production deployment is claimed.
# Live Browser Upgrade 0.2.0

See [BROWSER.md](BROWSER.md) for the updated capability matrix and actual tests. Added 15-test suite, experimental dynamic-tool round trips across restart/resume, upgraded original live-smoke regression, and isolated Chrome/native-host/model read/fill/click/scroll/same-origin navigation plus real action denial. Automated browser testing used the panel document as an extension tab and a localhost grant in a test-only manifest copy; native site-permission prompts and the updated native side-panel toolbar path have not been reverified. v0.2.0 MacBook installation remains unverified. No claim of full official-extension parity.

## Chat layout, model selection and automatic context — 2026-10-08

- `npm test`: 18/18 passed, including catalog pagination/hidden filtering, rejected invalid model/effort without changing chat history, selected model/effort passed to `turn/start`, and retained read-only sandbox.
- `npm run check` and `git diff --check` passed. No build step or dependencies were added.
- `scripts/panel-smoke.mjs`, using bundled Playwright and installed headless Chrome, passed: settings hidden from chat and opened/closed by menu, model-dependent efforts, fresh automatic capture on send, denied capture preserves draft and prevents a second/stale send, no page errors or horizontal overflow at 320/390/768/1024/1440px. Synthetic desktop/narrow screenshots inspected under `.runtime` (not packaged).
- Real signed-in Codex `model/list` returned seven visible models and their supported efforts. The first sandboxed probe exited; rerunning with required local runtime access passed. Initial headless check lacked a cached Playwright browser; using installed Chrome passed.
- Reloaded only the unpacked Local Codex extension at its verified checkout path. In normal Chrome, the current LinkedIn page appeared in the composer automatically after opening the toolbar action; no manual attachment control remains. Native UI showed Connected / chatgpt, GPT-6.1-Sol and Low, and the separate App settings dialog. Final panel uses Chrome's existing header rather than a duplicate custom header. No new real inference turn, browser action, workspace edit or external communication was sent during this verification.
- Local checkout only; not committed, pushed or repackaged. Restricted pages and pages without Chrome site access remain unsupported; capture errors keep the draft unsent. Prior unrelated local fixes remain intact.

## Companion/distribution candidate 0.3.0 — 2026-10-08

- `npm test`: 35/35 pass. `npm run check` passes. Includes migration/idempotence/active-host and missing-workspace guards, actual packaged bridge version, protocol ranges, extension archive dependency graph and reproducibility, and release activation gates.
- ARM `build-macos --development`, `verify-macos`, `prepare-release --development` pass. Strict nested signatures, bundled Node, isolated-home app copy/registration, framed native-host handshake, DMG verification and checksums checked. No real host registration or inference request changed.
- Intel development cross-build and static bundle/signature checks pass. This does not verify execution on an Intel Mac. Hosted GitHub Actions have not run.
- Native ARM companion UI opened: Codex/sign-in detected; running bridge disables installation; unavailable store/updates explicitly disabled. No real install/login triggered.
- Panel smoke passes: settings, model/effort, fresh automatic capture, failed capture preserves draft, 320–1440px layouts; legacy/unsupported and incompatible handshake prevent `hello`, sending and workspace mutation.
- Public repository switch approved/executed and anonymous access verified. Targeted full-history scan: six commits/54 unique blobs; no credential-pattern matches or private runtime files found.
- Production Developer ID signing, notarization, Sparkle feed/upgrade, Web Store submission and new public release have not been run. Existing development ad-hoc signatures are not distribution signing. The release scripts/workflows are preparation, not evidence of successful production delivery.

## Free source installer/update switch — 2026-10-08

- Four added source-installation tests cover repeat install, preserved chat index/custom workspace/runtime recovery, moved checkout migration, active/unknown host refusal and missing saved workspace without recreation. A generated shell launcher completes a framed native handshake with the fixture bridge.
- Local two-version Git integration verifies fast-forward update, test/check execution and registration. Dirty source, active host and divergent commits stop without discarding local work. All Git/network behavior is confined to a local bare fixture; the real checkout is not pulled or reset.
- Full suite: 39 tests pass; JavaScript/manifest checks and shell syntax checks pass. Paid Apple workflow moved to distribution/deferred; default CI and release use source ZIPs without signing secrets.
- Hosted CI, public release and another user's installation have not been verified. Source ZIP preview is prepared from an isolated snapshot; real source remains uncommitted.

- Final source candidate ZIP and extension ZIP built from an isolated committed snapshot in output/candidates/source. Source ZIP extracted; executable install.sh preserved; private runtime/Git/auth/chat/config files absent; all 39 tests pass from the extracted package. Shell syntax, workflow YAML parsing and diff checks pass. Updated panel smoke passes with source setup/update instructions. Snapshot provenance is local-only, not a published GitHub commit.

## Published free source release 0.3.0 — 2026-10-08

- Source commit `3ed4b41ab257bb98530562fbd5b5a8b768e4883a` is public on main; release v0.3.0 is public, stable and latest. Hosted CI run 37808846641 and source release run 37808984354 passed tests, syntax/manifest, shell syntax and both package builds.
- All four release assets downloaded anonymously; bytes/SHA-256 match GitHub asset digests and published checksum files. Source archive's commit comment matches the release commit; executable install.sh preserved; runtime/Git/auth/config/chat files absent.
- Actual downloaded source ZIP: 39/39 tests, syntax/manifest checks and isolated-home installer passed. Fresh anonymous HTTPS clone: tests/checks, ./install.sh and npm run update passed. Fake Codex executable used for installation testing; no real sign-in, model inference or user native-host registration changed.
- Source updater's fast-forward and divergence/dirty/active-host safeguards are covered by the local two-version Git integration. Chrome unpacked extension still needs manual Reload. Cross-machine installation and deferred Intel companion execution remain unverified.

## Restricted pages 0.3.1 — 2026-10-08

MacBook user confirmed Extensions/Settings/New Tab was active. Chrome documentation states activeTab is not granted for chrome:// pages (https://developer.chrome.com/docs/extensions/develop/concepts/activeTab). Existing code injected before validating the page and wrapped the restriction as a toolbar-grant error, blocking every send.

42/42 tests and syntax checks pass. Added capture tests ensure known restricted tabs skip injection and return null, Chrome restricted-page errors with withheld URL return null, and HTTP(S) permission errors/missing content still throw. Panel smoke verifies normal chat sends page:null on restricted tabs without previous website text; live-browser attempts there preserve draft without sending; returning to a website captures fresh context. Existing model/settings/layout/compatibility tests still pass. No real MacBook interaction or inference request was performed; hosted publication verification follows.

Publication: v0.3.1 is public/latest from source `f9bf42807f9a076990bb7495bfd82c9fa4ecd74f`. Hosted Intel source checks 37812257099 and release 37812289315 passed. All four assets anonymously downloaded and verified against GitHub digests and checksum files; archive commit matches release source. Downloaded source passes 42/42 tests, syntax checks and isolated-home install. Public Git update 0.3.0-to-0.3.1 passed with synthetic chat history, custom workspace and runtime recovery unchanged. Initial ARM jobs were cancelled while unstarted/queued; no failed test was skipped. MacBook native UI was not accessed or claimed verified.
