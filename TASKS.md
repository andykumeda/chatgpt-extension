# Task Ledger

States: Not started, In progress, Blocked, Verified, Deployed.

| Stage | Owner | State | Acceptance / verification | Evidence / blockers |
| --- | --- | --- | --- | --- |
| 1: Interface and workspace | Codex | Verified | Official docs + installed schema; real auth/connectivity; canonical path checks; sandbox file writes and Documents denial | `npm run probe`: CLI 0.160.0 initialized, managed ChatGPT account recognized, workspace write succeeded, Documents touch denied with no file created. Default canonical workspace checked. |
| 2: Bridge and side panel | Codex | Verified | MV3 native messaging, streaming, explicit bounded page attachment, workspace picker, owned chat resume | bridge/ and extension/ implemented. 10 unit tests pass. Syntax/manifest checks pass. Real live-smoke passed with 50 text deltas, restart/resume memory, original workspace file output and invalid paths. |
| 3: Browser and install | Codex | Verified | Browser -> native bridge -> Codex; new/resumed/restarted/invalid flows; installation docs | Actual Chrome side-panel native UI verified: capture incl. selection, response, reconnect/resume, workspace file, Documents rejection, missing workspace error, original workspace preserved. README.md and VERIFICATION.md document installation/evidence/limits. Normal Chrome host registered; test profile isolated. |

| 4: GitHub sharing | Codex | Blocked | Private source repository; exclude runtime/history/logs; portable installation instructions; verify pushed commit | Private `andykumeda/chatgpt-extension` created; local Git initialized on main with SSH origin. Fresh 10/10 tests, syntax/manifest and staged whitespace checks pass. Source credential-pattern scan found no matches; only 24 source/docs/test files staged. Initial signed commit failed: configured Bitwarden SSH agent socket refuses connections. Commit and push pending agent recovery; signing remains enabled. |

## Current state

Prototype implemented and verified locally. Private GitHub repository: https://github.com/andykumeda/chatgpt-extension. Source publication is in progress; no production deployment. No official application, official extension, unrelated settings or existing chat database modified. Implementation and test scratch live in `/Users/andy/Dev/chatgpt-extension`. Normal Chrome prototype host: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.local_codex.sidepanel.json`. Normal prototype runtime: `~/.codex/local-sidepanel`; SQLite/logs explicitly isolated. Codex manages auth and creates its own new local session rollouts. Test profile/state are under this checkout. Superseded incorrect test-host registration was removed without touching the official host. See VERIFICATION.md for actual passing checks and compatibility limitations, including unrestricted model reads and the failed/replaced Playwright side-panel attempt.
