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

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the checkout's `extension` folder. Pin Local Codex and click its toolbar action on a webpage. Set your workspace through **••• → App settings**, choose a model in the composer and send. For attachment across websites, open **App settings → Page context → Enable automatic page access** and approve Chrome’s one-time HTTP(S) website-access prompt. Without this opt-in, click the toolbar action on each new site; the temporary grant expires after changing sites. Supported webpages are recaptured automatically before every send. On Chrome Extensions, Settings, New Tab or the Web Store, the composer shows **No page attached** and ordinary chat works without page context. Live browser access requires a normal webpage. Voice is not included.

## Update

Close all Local Codex side panels, then run:

```sh
cd ~/Dev/chatgpt-extension
npm run update
```

The command fetches the official repository's `main`, applies a fast-forward update, runs tests/checks, and registers the updated host. It refuses local source changes, non-main branches, unknown remotes and divergent commits; it never resets or stashes your work. If checks fail after updating the source, it stops before registration and reports the failure; it does not claim an automatic rollback.

Finally, open `chrome://extensions`, click **Reload** for Local Codex and reopen its toolbar action. Unpacked extensions do not update themselves. Node and Codex updates remain managed separately.

## Connection recovery

Homebrew Node upgrades previously broke source installations because the generated launcher saved Node's version-specific `Cellar` path. The installer now uses the same formula's stable `opt/<formula>/bin/node` link when it resolves to the installing runtime; it does not select an unrelated Node installation. To repair an older launcher after a Node upgrade, close all panels and run `./install.sh` once from this updated checkout, then reconnect. Chat history and host settings are preserved. Authentication is checked after the native connection starts: a disconnected bridge alone does not mean that `codex login` is needed. Non-Homebrew installations retain their executable path; rerun installation if that path changes.

If Connect does not respond, close the side panel, reload Local Codex in `chrome://extensions`, and reopen the toolbar icon. Check the extension's **Errors** entry if it still fails. Reloading source files alone does not install the native bridge: Git does not include the generated `.runtime` launcher/configuration. A Chrome registration pointing to a missing launcher must be repaired without deleting `~/.codex/local-sidepanel` or changing saved workspace paths. The source installer deliberately preserves unknown registrations; do not delete a live bridge lock or unrelated native hosts.

If a model is missing, the picker reflects the native Codex `model/list` response, not a hardcoded list. A shared `model_catalog_json` setting can replace the catalog with a static custom list that omits newer OpenAI models. Reconnecting or updating the CLI alone does not establish that such a list was refreshed. Diagnose the effective catalog and account availability before changing shared Codex/Ollama settings; do not add an unverified model to the picker or assume that displaying its name proves access. See [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

For a source installation, an explicit bridge-only catalog can override that inherited setting without editing global Codex configuration. Close all panels, place a valid Codex `{"models": [...]}` catalog in a permanent local file, then run:

```sh
LOCAL_CODEX_MODEL_CATALOG=/absolute/local/path/models.json ./install.sh
```

The installer saves this as `modelCatalog` in its private host configuration and preserves it across updates. The bridge passes it to the supported app-server `-c model_catalog_json` option. Missing files, directories, Documents/iCloud paths and unsafe symlinks fail clearly without falling back to the inherited catalog. Reconnect after installation. Use `LOCAL_CODEX_MODEL_CATALOG='' ./install.sh` to restore inherited catalog behavior. A catalog snapshot is static: refresh its model metadata when needed and verify actual model access. Never include account identity, authentication data or conversation content in a catalog, and never publish runtime catalogs with a release.

If a message stays **Running** without text, inspect **App settings → Connection** for the effective inference provider and endpoint origin. Authentication and model discovery can succeed while inference is routed to an unavailable service. Codex response errors now appear beside the composer while it retries; Stop remains available. A recovered stream clears the warning. The bridge does not resubmit the turn or switch services.

The side panel normally inherits Codex routing. A shared `openai_base_url` aimed at Ollama can redirect even a selected cloud model to that local endpoint. For an installation intended to use ChatGPT sign-in and cloud models, close all panels and explicitly configure its endpoint:

```sh
LOCAL_CODEX_OPENAI_BASE_URL=https://chatgpt.com/backend-api/codex ./install.sh
```

This stores `openaiBaseUrl` in the private host configuration and passes the supported `-c openai_base_url` override only to this bridge's Codex child. It does not edit shared Codex/Ollama settings, change the selected provider/model, or update credentials. This ChatGPT endpoint was verified with CLI 0.162.1 and GPT-6.1 Sol; API-key/custom-service installations must use their intended compatible endpoint instead. There is no automatic fallback if the endpoint is unavailable. The installer validates absolute HTTP(S) URLs and rejects credentials, queries and fragments before writing files. An explicit environment value takes precedence over the saved bridge value; updates preserve that saved value. `LOCAL_CODEX_OPENAI_BASE_URL='' ./install.sh` explicitly restores inherited routing. App settings displays only the effective origin, not credentials or URL queries. Existing panels must be closed and the extension reloaded to pick up the updated UI and bridge.

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

## Published extension-only update 0.3.3

The published 0.3.3 extension ZIP contains the website-access fix and works with the published 0.3.2 companion. This does not describe the newer source checkout: commit `3d621ef` adds multi-panel session routing, requiring both the extension and native bridge from that checkout. Its displayed version still reads 0.3.3, so the version label alone cannot establish compatibility. No matching new companion release has been published.

For the current source installation, close every Local Codex panel, run `npm run update` from the Git clone, then reload Local Codex in `chrome://extensions`. The update registers the bridge from the same checkout. Do not combine the current source extension with the older companion bridge. ZIP users must install matching extension/bridge source together using `./install.sh` from a permanent local folder outside Downloads, Documents and iCloud. Preserve `~/.codex/local-sidepanel` and the original chat workspaces; do not delete history or a live bridge lock to recover a connection.
