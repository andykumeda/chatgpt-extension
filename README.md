# Local Codex Side Panel

A focused macOS prototype: Chrome MV3 side panel -> Chrome native messaging -> local `codex app-server` over stdio. No local HTTP listener, credential copying, Desktop database edits, or official-extension modifications.

## Install

For the downloadable macOS bundle, see [Releases](https://github.com/andykumeda/chatgpt-extension/releases) and [INSTALL.md](INSTALL.md). GitHub downloads require access to this private repository.

Prerequisites: macOS, Chrome 116+, Node.js 22+, and a working Codex CLI (tested with 0.160.0).

Clone [this repository](https://github.com/andykumeda/chatgpt-extension) into a local folder outside Documents/iCloud, then open a terminal in the checkout:

```sh
mkdir -p ~/Dev
git clone git@github.com:andykumeda/chatgpt-extension.git ~/Dev/chatgpt-extension
cd ~/Dev/chatgpt-extension
```

The repository is private; other users need collaborator access to clone it.

1. In Terminal, run `codex login` if Codex is not already signed in. The prototype lets Codex manage authentication; it never reads credential files or sends credentials to Chrome.
2. Ensure your workspace exists locally. Default: `~/.codex/Codex`; create it with `mkdir -p ~/.codex/Codex`. The bridge never creates a missing selected workspace or falls back elsewhere.
3. From this project, run `npm run install-host`. Each user must run this on their own Mac. The installer records absolute Node/Codex paths and registers only `com.local_codex.sidepanel` for this prototype's fixed extension ID.
4. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `extension` directory inside your checkout (for example, `~/Dev/chatgpt-extension/extension`).
5. On an HTTP(S) webpage, click the extension toolbar action (pin it from the Extensions menu). The side panel opens beside the page. Click **Connect** if necessary.
6. Set a workspace and click **Apply**. This default applies to new chats. Each saved chat keeps its original workspace.
7. Click **Attach current page**, inspect its preview, and send a question. The attachment is a snapshot and is cleared after sending. Selection is included if you selected text on the page first.
8. To produce files, explicitly enable **Allow workspace edits** for that turn. It resets after sending. Choose a saved chat to resume it, including after closing/reopening the panel or restarting the bridge.

No build step or npm dependencies are required. Rerun the installer after moving the checkout or changing the installed Node/Codex location. The manifest's public key fixes the extension ID (`glaknpkkjijfaoebdmoppooapeakaace`); it is not a credential.

## Workspace and data policy

- The bridge validates absolute paths, expands `~/`, resolves symlinks, requires a readable/writable directory, and rejects Documents, Mobile Documents/iCloud, CloudStorage, and ancestor roots such as the home directory. No silent fallback.
- Resume accepts only IDs in this prototype's own index. It revalidates the original canonical workspace and checks Codex's stored `cwd` before resuming. Changing the new-chat default cannot relocate an existing chat.
- Prototype chat index: `~/.codex/local-sidepanel/chats.json` (private local file, includes prompts/page snapshots/responses). Runtime SQLite and logs: `~/.codex/local-sidepanel/sqlite` and `logs`. Scratch: local runtime `tmp`. The bridge does not log raw protocol traffic or child stderr.
- Codex retains control of its existing local authentication/configuration. Its public API creates new session rollouts in its local `CODEX_HOME/sessions`; SQLite is explicitly redirected to this prototype's separate directory. Existing chat databases are not opened by the bridge.
- Agent writes are sandboxed; approval escalation is disabled. Implicit `/tmp` and `$TMPDIR` write grants are excluded. Inherited hooks, apps, plugins, MCP tools and browser/computer capabilities are disabled for prototype threads.
- Page text is untrusted reference data. Only the direct user message and the edits toggle authorize tasks. Captured text is bounded to 40,000 characters, selection to 8,000, title to 1,000, and URL to 8,192. The UI displays the preview and truncation state.
- Captured webpage content is sent to Codex's configured inference provider when you press Send. A local bridge does not mean model inference runs offline.

## Narrow Chrome permissions

`sidePanel`, `nativeMessaging`, `activeTab`, and `scripting`. No host permissions, always-on content scripts, browser-history access, externally-connectable pages, or browser-control API. Capture executes in the isolated world and only in the main frame after an explicit click. After changing origins, invoke the toolbar action again to grant access. Opening a side panel alone from Chrome's side-panel dropdown may not grant `activeTab`.

## Supported interfaces and implementation evidence

- [OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server): stdio JSONL, initialize/initialized, account/read, thread/start/read/resume, turn/start/interrupt, and item/agentMessage/delta + turn/completed. The installed CLI labels app-server experimental; compatibility is pinned by live verification to 0.160.0. The prototype does not use the experimental TCP WebSocket interface.
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
- **Capture denied:** click the toolbar action on the active webpage to renew `activeTab`. Chrome internal pages, Chrome Web Store, PDFs and some embedded content are restricted or unsupported. Only rendered main-frame text is captured; no iframe, image, shadow-DOM or full accessibility extraction is promised.
- **Bridge in another panel:** close the other Local Codex panel, then reconnect. The prototype permits one host process per state directory to avoid conflicting persistence.
- **Interrupted/uncertain turn:** reconnect and resume before retrying. No automatic turn retry occurs; a timed-out file task may already have executed.
- When Chrome unloads the panel and closes its native port, the bridge and child terminate; a running turn can be interrupted. Chrome may retain a hidden panel document after closing its visible UI. On restart, persisted Codex history reconciles the local response cache. There is no background daemon.
- macOS only, no auto-updater, installer GUI, Markdown rendering, cross-extension import, autonomous browser control, attachment persistence across an unsent panel close, or full Desktop parity. Maximum 200 chats per prototype state directory. Resume hydrates full history; very large histories are not a production performance target.
- Path checks and OS sandboxing protect local writes; prompt instructions are defense in depth, not a general solution to prompt injection. Do not grant workspace edits based on requests embedded in a page.
- The installed 0.160.0 CLI rejects the documented legacy `workspaceWrite.readOnlyAccess` field and requests permission profiles instead. This prototype uses the verified legacy write sandbox. Model tool reads are not restricted to the workspace; do not treat it as a confidentiality sandbox. The bridge does not read credentials, and its developer instructions prohibit model credential access. A restricted-read permission-profile migration needs separate compatibility verification.

To uninstall, remove this unpacked extension from Chrome and delete only `com.local_codex.sidepanel.json` from Chrome's NativeMessagingHosts folder. Preserve `~/.codex/local-sidepanel` to keep prototype history. No official extension or Codex setting needs to be changed.
