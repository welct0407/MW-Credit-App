# Change notes — PWA team roster and worker reuse, 18 October 2026

## Purpose
Owner instruction of 18 October 2026: the six PWA workers get fixed names used in every session, and a session starts each worker once and gives it every later task instead of creating a new worker per task. Documentation only; no release number, deployment or live change. Open release at the time: R072.

## Changes
- `project/Documents/Rules/PWA_Orchestration.md`: the role table gains a Name column (Archie A, Byte B, Chase C, Dewey D, Echo E, Forge F); new section "Named workers, started once per session" sets the display name format `<Name> (<letter> — <role>)`, one start per role per session, continuation of the running worker for later tasks, the only replacement cases (worker gone, or an escalation it cannot adopt) and that workers do not outlive the session. Revision date 18 October 2026.
- `project/Documents/Rules/Model_Work_Mapping.md`: both assignment tables use the names; the PWA team paragraph points at the roster and the once-per-session rule; the escalation paragraph says a running worker keeps its setting unless replaced under the same name. Revision date 18 October 2026.
- `AGENTS.md`: the PWA hard rule names the team and the once-per-session reuse. Revision date 18 October 2026.
- `CLAUDE.md`: Claude Code mechanics: start a role with `Agent` under its display name, continue with `SendMessage` to that name, start again only for the replacement cases.
- `project/Documents/Rules/Development_Workflow.md`: the delegation bullet and the documentation-maintenance paragraph use the names.
- Names approved by the owner in the same session (18 October 2026).
- New Claude Code agent definitions (owner approval in the same session): `.claude/agents/archie.md`, `byte.md`, `chase.md`, `dewey.md`, `echo.md`, `forge.md`. Each pins the worker's name, role brief, default model and effort from the Claude alternative table, and the hard rules it must keep; escalations stay per-call overrides. `CLAUDE.md`, the roster section and the Claude alternative table point at them.

## Checks
| Command | Result |
| --- | --- |
| `node scripts/check-docs.mjs` | Pass: 0 failures, 0 warnings; `AGENTS.md` 782 words |

## Not run
Product CI, tests and live audits: documentation-only change with no executable input.

## Recovery
Revert the batch commit on `claude/quirky-gauss-rf24f1`; Git baseline `a3bffa3` on `main`.

## Open questions
None.

## Remaining work
None. The definitions take effect in the next Claude Code session that loads the repository.
