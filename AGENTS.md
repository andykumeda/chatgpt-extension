# Repository Instructions

## Mandatory Completion Workflow

- Document every completed task in `TASKS.md`, including the changed behavior, verification results, remaining limitations, and deployment status. Keep `README.md` and other affected project documentation current.
- Before reporting a task complete, inspect the final diff and run the relevant tests and checks. Do not claim verification or deployment that was not performed.
- Commit all completed task changes locally before the final response, without waiting for a separate commit request. Use focused commits and stage an explicit file allowlist.
- Preserve unrelated user changes. Never include credentials, private data, runtime state, logs, local handoff notes, or unrelated files in a commit.
- An explicit user request to leave changes uncommitted takes precedence. If a commit is blocked by permissions, signing, a failed check, or incomplete work, report the blocker and clearly identify what remains uncommitted; do not call the task complete.
- Push completed task commits to GitHub after committing locally, per the user’s standing authorization. Report the commit hash and push result. Releases and deployments still require separate authorization.
- Keep a concise local-only handoff in the ignored `.runtime/HANDOFF.md`; never stage or publish it.
