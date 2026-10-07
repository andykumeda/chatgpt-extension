# Install on Another Mac

This is a source-based prototype bundle, not a signed app or Chrome Web Store package. It supports macOS only. Node.js 22+, Chrome 116+, and a working Codex CLI are required (verified with Codex 0.160.0).

1. Download the ZIP and extract it. Move the extracted folder into `~/Dev` or another permanent local folder outside Documents/iCloud. Do not install from an iCloud-synced Downloads folder.
2. Open Terminal in the extracted folder. Run `node --version` and `codex --version` to check prerequisites. Install Node and Codex separately if missing; the bundle contains neither runtime nor credentials.
3. Run `codex login` to sign in with your own account, unless already signed in. No credentials from the original machine are included or needed.
4. Run `mkdir -p ~/.codex/Codex` to create the default local workspace, then `npm run install-host` to register this Mac's native bridge. There is no `npm install` or build step.
5. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the extracted folder's `extension` directory.
6. Open a webpage, click the extension toolbar button, and connect. Apply your local workspace, click **Attach current page**, inspect the preview, and send a message.

Keep the extracted folder in place. If you move it or change Node/Codex paths, rerun `npm run install-host`. Installing another copy updates only this prototype's host registration, not the official extension.

To verify a download, place its `.sha256` file beside the ZIP and run:

```sh
shasum -a 256 -c local-codex-sidepanel-0.1.0-macos.zip.sha256
```

The GitHub repository is private: downloaders need repository access and must sign in to GitHub. You can also transfer the ZIP directly to your other Mac.

See README.md for errors, uninstall steps, data retention and security limitations. In particular, local writes are guarded but model reads are not confined to the workspace, and webpage context is sent to Codex's inference provider. This is not full parity with the official extension.
