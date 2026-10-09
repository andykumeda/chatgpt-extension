Local Codex 0.3.3 fixes repeated page-attachment failures after switching websites. In App settings → Page context, click Enable automatic page access and approve Chrome’s HTTP(S) website-access prompt once. Access is requested only by that explicit click; captured page content is sent to your model only when you send. Without this opt-in, the toolbar must grant access on each new site. Chrome internal pages and the Web Store still allow ordinary chat without an attachment.

The fix is extension-only. Existing 0.3.2 companion apps/bridges remain compatible; no app replacement is needed. Git users run npm run update with panels closed, then reload the extension. Companion users can load the new extension ZIP from a permanent local folder. History and chat workspaces are preserved.

Source installation requires Node.js 22+, Chrome 116+, Codex CLI and your own account. Git is required for source updates. Run ./install.sh from a permanent folder outside Downloads/Documents/iCloud and load its extension folder through chrome://extensions → Developer mode → Load unpacked. See INSTALL.md.

No Apple Developer membership is required. Sparkle automatic updates, Developer ID signing/notarization and Chrome Web Store publication remain deferred. This release contains source and extension ZIPs/checksums; it does not silently install or grant access.
