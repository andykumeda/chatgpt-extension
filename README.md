# Local Codex Side Panel

A focused macOS prototype: Chrome MV3 side panel -> Chrome native messaging -> local `codex app-server` over stdio. No local HTTP listener, credential copying, Desktop database edits, or official-extension modifications.

## Install

For the downloadable macOS bundle, see [Releases](https://github.com/andykumeda/chatgpt-extension/releases) and [INSTALL.md](INSTALL.md). The repository and existing downloads are public. The supported distribution is a source installer plus an update command. Apple Developer ID, Xcode and a signed Mac app are not required.

Prerequisites: macOS, Chrome 116+, Node.js 22+, and a working Codex CLI (tested with 0.160.0).

Clone [this repository](https://github.com/andykumeda/chatgpt-extension) into a local folder outside Documents/iCloud, then open a terminal in the checkout:

```sh
mkdir -p ~/Dev
git clone https://github.com/andykumeda/chatgpt-extension.git ~/Dev/chatgpt-extension
cd ~/Dev/chatgpt-extension
```

Anyone can clone this public repository.

1. In Terminal, run `codex login` if Codex is not already signed in. The prototype lets Codex manage authentication; it never reads credential files or sends credentials to Chrome.
2. Close any existing Local Codex panels. A fresh installation creates the default `~/.codex/Codex` workspace; existing saved workspaces must already exist.
3. From this project, run `./install.sh`. Each user must run this on their own Mac. The installer records absolute Node/Codex paths and registers only `com.local_codex.sidepanel` for this prototype's fixed extension ID.
4. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `extension` directory inside your checkout (for example, `~/Dev/chatgpt-extension/extension`).
5. On an HTTP(S) webpage, click the extension toolbar action (pin it from the Extensions menu). The side panel opens beside the page. Open **••• → App settings → Connect** if necessary.
6. Open **••• → App settings**, set a workspace and click **Apply**. This default applies to new chats. Each saved chat keeps its original workspace.
7. Choose a model and reasoning effort in the composer and send a question. The current page is included automatically and recaptured before each message; there is no page picker or attachment label. Selection is included if you selected text first. Chrome internal pages and the Web Store allow ordinary chat without webpage context. If capture fails on a regular website, the message stays unsent; enable global website access in App settings or click the extension toolbar icon on that webpage, then send again. Use the copy icon below a Codex response to copy its complete text, including streamed or resumed output.
8. In **App settings**, to produce files, explicitly enable **Allow workspace edits** for that turn. It resets after sending. Choose a saved chat to resume it, including after closing/reopening the panel or restarting the bridge.
9. In **App settings**, enable **Live browser this turn** for one message, or choose **Global website access → This session / Permanently**, optionally check **Skip browser-action confirmations**, and click **Enable global access**. Chrome confirms website access. The opt-in also enables live browser on subsequent website messages and preapproves supported clicks, form filling and navigation. These actions can affect accounts or submit forms; enable it only when that is intended. Otherwise each action needs **Allow once / Deny**. Session preferences expire on browser restart or extension reload/update; permanent preferences remain until **Revoke global access**. Workspace edits still require their separate per-message toggle. Browser tools stay pinned to the current tab for each turn and retain credential/download restrictions. See [BROWSER.md](BROWSER.md) and [INSTALL.md](INSTALL.md).

For source installation, no build step or npm dependencies are required. For a Git clone, close the panel and run `npm run update`, then click Reload for Local Codex in `chrome://extensions`. Updates refuse dirty/divergent checkouts. Rerun the installer after moving the checkout or changing the installed Node/Codex location. The manifest's public key fixes the extension ID (`glaknpkkjijfaoebdmoppooapeakaace`); it is not a credential.

## Workspace and data policy

- The bridge validates absolute paths, expands `~/`, resolves symlinks, requires a readable/writable directory, and rejects Documents, Mobile Documents/iCloud, CloudStorage, and ancestor roots such as the home directory. No silent fallback.
- Resume accepts only IDs in this prototype's own index. It revalidates the original canonical workspace and checks Codex's stored `cwd` before resuming. Changing the new-chat default cannot relocate an existing chat.
- Prototype chat index: `~/.codex/local-sidepanel/chats.json` (private local file, includes prompts/page snapshots/responses). Runtime SQLite and logs: `~/.codex/local-sidepanel/sqlite` and `logs`. Scratch: local runtime `tmp`. The bridge does not log raw protocol traffic or child stderr.
- Codex retains control of its existing local authentication/configuration. Its public API creates new session rollouts in its local `CODEX_HOME/sessions`; SQLite is explicitly redirected to this prototype's separate directory. Existing chat databases are not opened by the bridge.
- Agent writes are sandboxed; approval escalation is disabled. Implicit `/tmp` and `$TMPDIR` write grants are excluded. Inherited hooks, apps, plugins, MCP tools and built-in browser/computer capabilities are disabled. Only this extension's bounded `local_browser` tool is exposed, gated by per-turn browser access and per-action approval or an explicit session/permanent action opt-in.
- Page text is untrusted reference data. Only the direct user message and user-selected permissions authorize tasks. Captured text is bounded to 40,000 characters, selection to 8,000, title to 1,000, and URL to 8,192. Current-page identity is available in settings; no alternate page can be selected.
- Captured webpage content is sent to Codex's configured inference provider when you press Send. A local bridge does not mean model inference runs offline.

## Chrome permissions

Required: `sidePanel`, `nativeMessaging`, `activeTab`, `scripting`, and `storage`. Optional HTTP(S) host permissions are requested only on an explicit settings click and Chrome confirmation. `storage.local` stores local-only preferences; `storage.session` tracks the browser-session lease, surviving panel close and worker suspension but clearing on browser restart or extension reload/update. Because Chrome host grants are persistent, the worker/panel explicitly remove expired session-managed HTTP(S) grants before page capture. Permanent grants remain until revoked. Nothing uses cloud-synced extension storage. Without global access, the toolbar grants temporary activeTab access per site. There are no required blanket host grants, always-on content scripts, browser-history access, debugger permission, or externally-connectable pages. Capture/DOM actions execute in the isolated world/main frame. Browser-action bypass is separately opted into and requires both the active lease and current Chrome website permissions.

## Supported interfaces and implementation evidence

- [OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server): stdio JSONL, initialize/initialized, account/read, thread/start/read/resume, turn/start/interrupt, and item/agentMessage/delta + turn/completed. The installed CLI labels app-server experimental; compatibility is pinned by live verification to 0.160.0. The prototype does not use the experimental TCP WebSocket interface.
- Live tools use documented **experimental** `dynamicTools` / `item/tool/call`, enabled by `initialize.capabilities.experimentalApi`. Tool definitions survive restart/resume on tested CLI 0.160.0. This is our own Chrome executor, not reuse of the official extension's private transport.
- [OpenAI configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference): runtime `sqlite_home`/`log_dir` overrides and sandbox configuration. Overrides are passed to this child process; no user config is edited.
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging): exact extension-origin allowlist, persistent port and length-prefixed UTF-8 JSON. Prototype frames are capped at 512 KiB, below Chrome's 1 MiB host-message cap. History is chunked.
- [Chrome sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) and [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): toolbar opens the panel and grants temporary page access.

Installed implementation inspection used `codex --version`, `codex app-server --help`, `codex features list`, and `codex app-server generate-json-schema --out schemas`. Generated schemas are ignored local artifacts. No private Desktop socket, extension handshake, chat database schema, undocumented originator workaround, or application patch is part of this implementation. The prior Desktop-vs-official-extension workspace observation is background only; this prototype supplies `cwd` explicitly.

## Verification

Maintainers can run `npm run bundle` from a clean committed checkout to create a source-only ZIP and SHA-256 checksum under `output/releases`. No local runtime state or Git history is included.

Run `npm test` for filesystem boundaries, symlink escapes, native framing, chat ownership/recovery, and page payload limits. Run `npm run check` for JavaScript syntax and narrow manifest assertions. `npm run probe` starts a real Codex child and tests a workspace write plus a denied Documents write. `node scripts/live-smoke.mjs` runs real synthetic-page chat, streaming, bridge restart, conversation resume and workspace-file tests. These live commands need normal local Codex/network access.

Optional browser verification uses an existing Playwright installation; it adds no runtime dependency:

```sh
npm run install-host -- --testing
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/browser-fixture.mjs
```

Test installation uses `.runtime/chrome-test-profile/NativeMessagingHosts`, `.runtime/testing`, `.runtime/browser-state`, and `.runtime/browser-workspace` in this checkout. The fixture opens a synthetic page for native UI verification; it does not assert a passing browser test automatically. Playwright did not expose the actual side panel as a normal Page, so browser acceptance was checked through native UI automation. See [VERIFICATION.md](VERIFICATION.md) and [TASKS.md](TASKS.md) for evidence and remaining limits.

## Errors and limitations

- **Host not found:** run the installer for the Chrome profile you use. A custom `--user-data-dir` needs its own `NativeMessagingHosts` registration; the default installer targets standard Chrome's user-data directory.
- **Workspace unavailable/forbidden:** create or repair the intended local directory, or select another existing local folder. Resuming a chat requires restoring its original folder; choosing a different default will not move it.
- **Capture denied on a website:** click the toolbar action on the active webpage to renew `activeTab`. Chrome internal pages and the Web Store cannot be attached; ordinary chat works there with **No page attached**. PDFs and some embedded content remain unsupported. Only rendered main-frame text is captured; no iframe, image, shadow-DOM or full accessibility extraction is promised.
- **Chrome has not granted access to this tab:** click the pinned Local Codex toolbar icon while viewing the intended webpage, then enable **Live browser this turn** and retry. Keeping the panel open while switching sites does not grant access to the new site. The extension does not guess a missing tab URL or request blanket site access.
- **Multiple panels:** panels in the same Chrome profile share one worker-owned native host, chat index and Codex runtime. Different chats can run concurrently; a chat with a running turn cannot be resumed or sent from another panel until completion. Browser events, approvals and Stop stay scoped to the owning panel. Close all panels and reload the extension once when upgrading from the old direct-native transport. Both extension and bridge must include this update; the previously published 0.3.2 companion cannot handle the new session envelope. Source installations use the updated checkout; packaged companion distribution needs a new release. An old panel or another Chrome profile using the same state directory may still hold the process lock; close that connection before reconnecting. Never delete a live lock. Separate Chrome profiles sharing one state directory are not supported concurrently.
- **Codex runtime SQLite startup timeout:** preserve the existing databases. After closing the Local Codex panel, explicitly select a fresh runtime directory with `LOCAL_CODEX_RUNTIME_STATE="$HOME/.codex/local-sidepanel/runtime-recovery" npm run install-host`, then reopen the panel. This changes only child-process SQLite/log/scratch placement, not the chat index or chat workspaces. Reinstalling preserves that explicit selection. It is a recovery workaround, not a database repair; there is no automatic runtime or workspace fallback.
- **Interrupted/uncertain turn:** reconnect and resume before retrying. No automatic turn retry occurs; a timed-out file task may already have executed.
- When Chrome unloads a panel and disconnects its worker port, only that panel's active turn is interrupted; other panels keep their connection and turns. The native host and Codex child terminate after the last panel port disconnects. Chrome may retain a hidden panel document after closing its visible UI. On restart, persisted Codex history reconciles the local response cache. There is no independent background daemon. This uses Chrome's documented [long-lived ports](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) and [native-port worker lifetime](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), plus Codex's [thread/turn identifiers](https://developers.openai.com/codex/app-server).
- macOS only; the published source bundle has no auto-updater or installer GUI. Companion development is deferred; source updates use the explicit command. No Markdown rendering, cross-extension import, visual computer use/screenshots, iframe control, browser history, download API, attachment persistence across an unsent panel close, or full Desktop parity. DOM events may not work on sites requiring trusted keyboard/pointer events. Password/payment/file inputs and known download links are denied; do not approve actions intended to download files. Page scripts can have side effects; this is not a general browser sandbox. Maximum 200 chats per state directory. Existing 0.1.0 chats retain their workspace and history but require a new chat for live tools.
- Path checks and OS sandboxing protect local writes; prompt instructions are defense in depth, not a general solution to prompt injection. Do not grant workspace edits based on requests embedded in a page.
- The installed 0.160.0 CLI rejects the documented legacy `workspaceWrite.readOnlyAccess` field and requests permission profiles instead. This prototype uses the verified legacy write sandbox. Model tool reads are not restricted to the workspace; do not treat it as a confidentiality sandbox. The bridge does not read credentials, and its developer instructions prohibit model credential access. A restricted-read permission-profile migration needs separate compatibility verification.

To uninstall, remove this unpacked extension from Chrome and delete only `com.local_codex.sidepanel.json` from Chrome's NativeMessagingHosts folder. Preserve `~/.codex/local-sidepanel` to keep prototype history. No official extension or Codex setting needs to be changed.

## Chat interface

The panel follows the supplied ChatGPT layout while retaining the Local Codex name: chat picker and three-dot menu at the top, conversation in the center, and a rounded composer with model/effort selection at the bottom. Connection, workspace and per-message permissions live in App settings. There is no voice control or manual page-attachment step. Model discovery uses the local runtime `model/list`; selections are validated and passed to `turn/start`. Model/effort preferences are stored locally in the extension.

Synthetic browser integration: `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/panel-smoke.mjs` (uses installed Chrome; no runtime dependencies added). Original Local Codex artwork: `extension/logo.png`, with 16/32/48/128px Chrome icons. The generated mark combines a chat bubble, code brackets and a cursor; it does not use the OpenAI logo. The unused legacy `mark.svg` is an OpenAI mark from [Simple Icons v11.15.0](https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/openai.svg), CC0, and is excluded from the extension archive. This remains an independent local prototype, not an official OpenAI extension; see [OpenAI's brand guidelines](https://openai.com/brand/).

## Distribution

Source releases contain `install.sh`, the native bridge and the unpacked Chrome extension. GitHub Actions tests/packages source without Apple signing credentials. Release publication requires an explicit manual workflow approval. See [INSTALL.md](INSTALL.md) and [DISTRIBUTION.md](DISTRIBUTION.md). Earlier companion/Sparkle tooling remains deferred and is not used by the source installation or default workflows.

The optional, ad-hoc-signed companion development build runs without a Dock icon. Its Sign in button launches Codex directly and opens browser authentication without Terminal. Reopen Local Codex from Finder to access setup or Quit. The source bridge also runs without Terminal during normal Chrome use; Terminal is needed only for source installation and update commands. Developer ID signing, notarization and automatic companion updates remain deferred.
