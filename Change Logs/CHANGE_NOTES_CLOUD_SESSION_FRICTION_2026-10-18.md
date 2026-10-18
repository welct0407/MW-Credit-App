# Change notes — Cloud session friction batch, 18 October 2026

## Purpose
A review of all 24 Claude Code cloud sessions (15 to 18 October 2026) found that the pinned tooling is complete and that interruptions come from permission prompts, platform guards and per-checkout gaps. This batch removes the ones the repository can remove and records the rest as rules so sessions stop retrying them.

## Changes
- `.claude/settings.json`: allow rules for the `mcp__claude-code-remote__*` housekeeping tools (session messages, scheduled tasks, archive, PR subscriptions, documentation), `Agent`, `Artifact` and the task-suggestion tools; these prompted the owner in 13 sessions. Registers the SessionStart hook.
- `.claude/hooks/session-start.sh` (new, cloud only): `npm ci` when `node_modules` is missing or stale; exports `PYTHONPATH=/workspace/.setup/python-deps`, `NO_PROXY`/`no_proxy` for `dev-lm.mw-credit.com`, `lm.mw-credit.com`, `.web.app`, `.run.app`, and `MW_LAB_DIR=/tmp/mw-labs`; creates `/tmp/mw-labs` owned by `postgres` for disposable clusters; adds the all-branches fetch refspec so the stop hook no longer reports false unpushed commits on shallow clones.
- `.gitignore`: `.claude/worktrees/`, so worker worktrees stop triggering the stop hook.
- `project/scripts/cloud-session-setup.sh`: installs `iproute2`, `net-tools` and `xxd`; points to the hook for per-checkout preparation.
- `playwright.config.ts`: adds the app origins to `NO_PROXY` when a proxy is configured, so Chromium honours the live-shell host mapping instead of loading the real DEV site.
- Rules: `CLAUDE.md` (cloud-session limits: no remote branch deletion or repository settings through the proxy, `gh` unauthenticated, no chained `sleep`, no `pkill -f` on own shell, no worktree isolation, Accept edits mode for promotion and database work); `PWA_Orchestration.md` (workers in the shared checkout, waiting without `sleep`); `Release_Workflow.md` (Accept edits mode for promotion); steward skill (no branch deletion after merge); `project/scripts/README.md` (hook pointer).

## Checks
| Command | Result |
| --- | --- |
| `CLAUDE_CODE_REMOTE=true CLAUDE_ENV_FILE=<tmp> bash .claude/hooks/session-start.sh` (twice) | Pass in this session: first run 11 s with `npm ci`, second run 0.01 s; env file holds the four exports, `/tmp/mw-labs` is `postgres`-owned 700, fetch refspec present |
| `bash -n project/scripts/cloud-session-setup.sh` | Pass (syntax only; the snapshot rebuild is owner-side) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |
| `npx biome check playwright.config.ts` | Pass, 1 file |
| `npm run typecheck` | Pass, all three projects |

## Not run
No e2e run: the Playwright change only touches process environment before launch; the next CI `Development checks` run on the pull request covers the suite. The environment setup script change takes effect when the owner pastes the updated script into the environment settings and the snapshot is rebuilt; not verifiable from a session.

## Recovery
Revert the batch commit; the hook and allow rules have no effect outside a cloud session.

## Open questions
None. Owner-side actions outside the repository are listed in the pull request: paste the updated setup script, uninstall the unused Terraform, engineering, design and Desktop Commander plugins, keep GitHub's automatic head-branch deletion on.

## Remaining work
None.
