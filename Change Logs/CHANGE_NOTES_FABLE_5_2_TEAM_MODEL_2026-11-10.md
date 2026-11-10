# Change notes — Fable 5.2 for the Claude team allocation, 10 November 2026

## Purpose
The owner asked to replace Fable 5.1 with Fable 5.2 wherever the Claude team orchestration uses it, keeping the same effort.

## Changes
- `.claude/agents/archie.md`: Archie's default model is `claude-fable-5-2` (effort stays medium).
- `project/Documents/Rules/Model_Work_Mapping.md`: Claude alternative table lists Archie as `claude-fable-5-2` / medium; the A (high) and B (medium) escalations and the unavailability fallback name Fable 5.2.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (local, before commit) |

## Not run
No application checks; the batch changes only agent configuration and documentation.

## Recovery
Revert this commit.

## Open questions
None.

## Remaining work
None.
