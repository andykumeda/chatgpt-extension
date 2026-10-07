# Live Browser Work

Requested scope: live page reading, click, scroll, navigation and form filling, while retaining the existing workspace boundary and managed authentication. Full official-extension parity is not claimed.

## Plan

1. Verify the documented experimental app-server dynamicTools / item/tool/call round trip with installed Codex 0.160.0 before implementing dependent Chrome execution.
2. Expose bounded browser tools scoped to a user-enabled tab for one turn. Read/scroll use that grant; click/fill/navigation require an explicit per-action confirmation. Element references are document-bound. No arbitrary JavaScript tool, credential fields, downloads, browser history or blanket website grants.
3. Test live model/tool calls, DOM actions, stale references, permission denials, cancellation and resume; verify Chrome integration and package a versioned update. Keep Documents/iCloud forbidden and preserve existing chats' workspace.

## Interface Evidence

- https://learn.chatgpt.com/docs/app-server documents dynamicTools and item/tool/call as experimental, requiring initialize.capabilities.experimentalApi. This is a documented, version-sensitive extension point, not the official extension's private transport.
- https://learn.chatgpt.com/docs/chrome-extension describes the official product's broader permissions and browser workflows. Its private Desktop integration is not a public compatibility contract.
- https://developer.chrome.com/docs/extensions/reference/api/scripting documents isolated script execution with activeTab or host permissions. Navigation to a new origin requires a new user grant.

## Compatibility Questions

- Real managed-auth tool invocation/result: verified by scripts/browser-compat.mjs and scripts/browser-live-smoke.mjs on 0.160.0.
- Definitions survive app-server restart/resume and are callable again: verified by both scripts. Existing v0.1.0 chats have no browser tools; start a new conversation without relocating or replacing old chats.
- Selected tab ID, origin, snapshot and Chrome documentId gates: executor tests pass; actual Chrome DOM fill/scroll and consumed-reference rejection pass. No arbitrary page-selected tab IDs are accepted.
- Cross-origin navigation requires a user-triggered per-origin permission request and fails closed without it (unit tested). The native Chrome site-permission dialog has not been live-tested; end-to-end navigation verification used the same origin.

## Verification

- npm test: 15 tests pass, including existing filesystem boundaries, bounded tool operations, correlated one-shot replies, timeout/cancel, denied actions, origin changes, revocation, thread/turn scoping and stop.
- npm run check: syntax and narrow manifest assertions pass.
- node scripts/live-smoke.mjs: streaming, page attachment, restart/resume, workspace file and invalid paths pass with the upgraded bridge.
- scripts/browser-live-smoke.mjs: isolated Chrome for Testing, real native messaging, managed Codex authentication and model calls. Read, fill, click, scroll, same-origin navigation and post-restart live tools pass. One real fill request was denied through the panel and the field stayed unchanged. Three actions were approved in the successful workflow.
- The automation opens the exact panel document as an extension tab to access it with Playwright; only its isolated test copy grants localhost host permission. The production manifest remains activeTab plus optional per-site permissions. This does not constitute a new native side-panel/toolbar permission acceptance test. v0.1.0's native side-panel test remains recorded in VERIFICATION.md.
- Narrow 320px layout and approval screenshots inspected; no horizontal overflow. Screenshots and synthetic state stay under .runtime/browser-upgrade, not the release.
- MacBook user confirmed v0.1.0 connects after moving out of Downloads. v0.2.0 is not yet tested on that MacBook.

## Limits

DOM actions do not promise trusted keyboard/pointer event equivalence, cross-origin iframe access, or visual computer-use parity. Password/payment/credential fields must be denied. A page may still change after inspection; confirmations are not a general solution to prompt injection.

No Chrome download API is exposed. File inputs, explicit download links and known file URLs are denied. Page JavaScript can still have side effects when a user-approved action runs; the executor is not a browser-wide download blocker. Do not approve tasks intended to download files. Managed bridge/agent files remain subject to the workspace path policy and OS write sandbox.
