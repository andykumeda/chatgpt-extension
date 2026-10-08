# Install and update on macOS

No Apple Developer membership, Xcode, signed app or npm dependencies are required. Install Node.js 22+ and Codex CLI, and use Chrome 116+. Sign in with your own account using `codex login`; credentials are never bundled or copied.

## Recommended: Git clone

Git is required for the update command. Keep the checkout in a permanent local folder outside Downloads, Documents and iCloud:

```sh
mkdir -p ~/Dev
git clone https://github.com/andykumeda/chatgpt-extension.git ~/Dev/chatgpt-extension
cd ~/Dev/chatgpt-extension
./install.sh
```

Setup registers Chrome's local native bridge and creates `~/.codex/Codex` only for a fresh installation. Existing chat history, workspaces and explicit runtime recovery settings are preserved. A running bridge or missing saved workspace stops installation.

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the checkout's `extension` folder. Pin Local Codex and click its toolbar action on a webpage. Set your workspace through **••• → App settings**, choose a model in the composer and send. Supported webpages are attached automatically; Chrome site access is still required. On Chrome Extensions, Settings, New Tab or the Web Store, the composer shows **No page attached** and ordinary chat works without page context. Live browser access requires a normal webpage. Voice is not included.

## Update

Close all Local Codex side panels, then run:

```sh
cd ~/Dev/chatgpt-extension
npm run update
```

The command fetches the official repository's `main`, applies a fast-forward update, runs tests/checks, and registers the updated host. It refuses local source changes, non-main branches, unknown remotes and divergent commits; it never resets or stashes your work. If checks fail after updating the source, it stops before registration and reports the failure; it does not claim an automatic rollback.

Finally, open `chrome://extensions`, click **Reload** for Local Codex and reopen its toolbar action. Unpacked extensions do not update themselves. Node and Codex updates remain managed separately.

## ZIP installation

Download the source ZIP and matching checksum from [GitHub Releases](https://github.com/andykumeda/chatgpt-extension/releases). Verify it with `shasum -a 256 -c <download-name>.sha256`, extract into a permanent folder under `~/Dev`, then run `./install.sh` there and load its `extension` directory.

ZIP copies have no Git history and cannot use `npm run update`. For an upgrade, close the panels, extract the new source ZIP into a new permanent folder and run its installer. Remove the old unpacked extension entry and load the new `extension` folder. Keep `~/.codex/local-sidepanel`; it contains your chats and original workspace references. Do not remove the old installation until the new one connects successfully.

If you move a checkout or change Node/Codex paths, rerun `./install.sh`. To choose another Codex executable explicitly: `CODEX_BINARY=/absolute/path/to/codex ./install.sh`.

The source flow has no Apple signing or notarization step. Chrome Web Store publication remains optional and separate; the supported free path uses **Load unpacked**. See README.md for browser permissions, data handling and limitations.

## Find your workspace files

A fresh installation uses `~/.codex/Codex`. The `.codex` folder is hidden in Finder: press **⌘⇧G**, enter `~/.codex/Codex`, then press Return. The installation folder under `~/Dev/chatgpt-extension` contains the program, not your chat workspace files.

For a saved chat, open **App settings** and read **Chat workspace**; it may differ from the workspace for new chats. Files are created only when **Allow workspace edits** is enabled for that message and the task succeeds. An attachment error that blocks sending also prevents the file task from running. Chat history is stored separately in `~/.codex/local-sidepanel`.

## Optional companion development app

The source installer above is the supported path. Optional companion development ZIPs are provided for Apple Silicon (`arm64`) and Intel (`x64`). These apps are ad-hoc signed; they have no paid Developer ID signature, notarization or automatic updates. macOS may require you to approve opening the downloaded app in Privacy & Security.

To replace an earlier companion, close the Chrome panel, open the existing Local Codex setup window and quit it (older builds use its application menu). Extract the matching companion ZIP and replace `~/Applications/Local Codex.app` in Finder. Open the new copy and use **Install and connect Chrome** if needed. The installer preserves the existing history and workspace configuration. Use the extension bundled in `Local Codex.app/Contents/Resources/extension` when updating an earlier companion extension.

Local Codex does not appear in the Dock. Its **Sign in with Codex** button starts browser authentication directly without Terminal; **Cancel sign-in** stops it. Reopen the app from Finder for setup or the **Quit** button. Chrome starts the bridge directly in the background, so normal chat requires neither a setup window nor Terminal. Terminal used for an earlier installation can be quit once that command has finished; the app does not hide or quit unrelated Terminal sessions.

If an old Local Codex shortcut was pinned to the Dock, remove that shortcut once; the updated app does not create a running Dock entry.
