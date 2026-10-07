# Verification Record

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
