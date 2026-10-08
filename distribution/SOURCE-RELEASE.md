Local Codex 0.3.2 adds Dock-free behavior to the optional companion development build: browser sign-in runs directly without Terminal, with Cancel sign-in and Quit controls. Source installation and updates remain the supported distribution. Optional companion ZIPs are ad-hoc signed, not Developer ID signed or notarized; automatic updates and the Chrome Web Store remain deferred.

Fixes chat being blocked when Chrome Extensions, Settings, New Tab or the Web Store is active. Those pages now show **No page attached** and allow ordinary chat. Supported webpages still attach automatically; failed website captures preserve the draft and do not reuse stale content. Live browser access still requires a normal webpage.

Local Codex source installation for macOS. No Apple Developer membership, Xcode, signed Mac app, or notarization required.

Requires Node.js 22+, Git (for updates), Chrome 116+, Codex CLI, and your own Codex account. See INSTALL.md in the source ZIP or repository.

Run ./install.sh from a permanent local folder outside Downloads/Documents/iCloud. Load the extension directory through chrome://extensions → Developer mode → Load unpacked.

For Git clones, close Local Codex panels and run npm run update. Reload the extension in chrome://extensions afterward. ZIP users download/extract the new source package and rerun ./install.sh; history and original chat workspaces remain in ~/.codex/local-sidepanel.

This release does not install software silently or provide automatic Chrome extension updates. Page context is attached automatically when sending and is passed to your configured model provider.
