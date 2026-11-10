# Change notes — no scheduled-task popup after a PR merge, 10 November 2026

## Purpose
After every merge the owner was asked "Claude wants to delete a routine". The session was cancelling its own one-shot PR check-in with `delete_trigger`, which the service always puts to the owner. This batch stops that.

## Changes
- `.claude/skills/steward/SKILL.md`: under After the merge, leave a pending `send_later` check-in alone (no `delete_trigger`, no `update_trigger` disable); when it fires on a merged or closed PR, end the turn without action.
- `.claude/settings.json`: removed the `mcp__claude-code-remote__delete_trigger` allow entry; the service asks the owner regardless of it.

## Checks
| Command | Result |
| --- | --- |
| Session logs of the PR #265, #268, #270 and #272 sessions | Each shows a `can_use_tool` request for `delete_trigger` with `server_policy_ask_only: true`, title "Claude wants to delete a routine", right after the merge |
| `update_trigger` with `enabled: false` on a test reminder | Owner was prompted ("Allow Claude to update a scheduled task?", always-allow lasts for the session only), so disabling is no alternative |
| `npm run check:docs` | Pass, 0 failures, 0 warnings, on this batch before commit |

## Not run
No application checks: the batch changes agent configuration only.

## Recovery
Revert the commit that adds this note.

## Open questions
None.

## Remaining work
None. The disabled test reminder "Prompt test (ignore)" can be deleted from the app's scheduled tasks list by the owner if wanted.
