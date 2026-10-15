# Repository Codex configuration

- Date: 6 October 2026 (Asia/Bangkok).
- Purpose and scope: install the owner's supplied project-level Codex settings in `.codex/config.toml`.
- Changed files: `.codex/config.toml` and this change log. No app, database, report or model changes; no product release number required.
- Settings: schema directive; `approval_policy = "on-request"`; `approvals_reviewer = "auto_review"`; `sandbox_mode = "workspace-write"`; `web_search = "live"`; workspace sandbox network access enabled.
- Rollback: starting Git commit `9ded8599f411a749748ea8659553472187b84573`; remove the new configuration or revert the task commit. Existing unrelated working-tree changes are preserved and excluded from publication.
- Checks: repository configuration did not previously exist; checked the official Codex configuration reference, exact saved content and Git whitespace/staged diff. Only the two task files are included in the commit.
- Status: repository configuration complete; publication follows the standing commit/push instruction.
- Runtime verification: no new Codex session was launched to verify effective settings. This file edit does not establish a change to the current session's permissions.
- Reference: [Official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## 14 October 2026 refinement (Asia/Bangkok)

- Purpose: owner requested removal of automatic approval review.
- Change: removed `approvals_reviewer = "auto_review"` and its comment from `.codex/config.toml`; retained all other settings.
- Recovery: starting Git commit `8f25a2c01c135a4637eb3499a04b36e05444bf97`; revert the refinement commit to restore the previous repository setting.
- Checks: saved configuration readback and focused Git diff/whitespace checks; unrelated working-tree changes excluded from the task commit.
- Outcome: repository auto-review override removed. Effective runtime settings were not tested in a new session.
