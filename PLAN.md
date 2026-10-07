# Local Codex Side Panel Prototype

## Scope and assumptions

- macOS prototype, Chrome Manifest V3, Node.js 22+, installed Codex CLI.
- Project inspected at `/Users/andy/Dev/chatgpt-extension`: empty, no Git repository or project instruction files. Parent `/Users/andy/Dev/AGENTS.md` and supplied global instructions apply.
- Use documented app-server stdio JSON-RPC and Chrome native messaging. No Desktop private sockets, credential extraction, database edits, or official-extension changes.
- Workspace default is `~/.codex/Codex`. All workspace choices must already exist and be writable; no implicit directory creation or fallback.
- Extension owns a separate chat index and transcript cache. Codex owns its authentication and session persistence through its public interface.
- Page capture is explicit, limited to visible main-frame text plus URL/title/selection. Page content is untrusted reference material.

## Ordered implementation

1. Connectivity and workspace boundary. Inspect installed schema; initialize app-server, check account status, validate canonical workspace paths, test real sandbox writes and forbidden paths. Resolve compatibility blockers before chat implementation.
2. Native messaging bridge and MV3 side panel. Add bounded framing, extension-owned chat persistence, streaming/cancel/resume, explicit page preview/attachment, workspace picker and state/error handling. Verify unit and process integration tests.
3. Browser workflow and installation. Register only this prototype's native host, load unpacked in an isolated browser profile, verify new chat, context, streamed response, workspace file production, resume after bridge restart, and invalid workspace behavior. Document actual evidence and limitations.

## Compatibility questions

- Does installed Codex support the documented initialization, account/read, thread/start, thread/resume, turn/start, streaming and sandbox fields? Investigate using its own generated schema and live calls.
- Can workspace-write enforce only a validated workspace with temporary roots disabled, including symlink escapes to Documents? Verify with live command/exec probes.
- Can Chrome native messaging launch the runtime with absolute executable paths and stream safely below its message-size cap? Verify framing and a real extension connection.
- Does Chrome activeTab support capture after opening the side panel? Use toolbar invocation to grant access; show an actionable error when navigating to an ungranted origin.

## Deferred

Importing other extensions' chats, full Desktop parity, non-macOS support. Packaging/distribution completed in v0.1.0. Live browser reading and scoped actions were explicitly requested after v0.1.0; see BROWSER.md for the new implementation gates.
