# Change notes — CI evidence reuse and lean check routine, 18 October 2026

## Purpose
Owner request of 18 October 2026: review the development and testing process, remove duplicate testing and CI, reuse existing evidence, and make development shorter and cheaper in tokens. A session on PR #56 showed one batch tested three times (Byte locally, Chase with the wide local Playwright suite, then CI on every push), nine `Development checks` runs on one pull request including records-only commits, the same commit run twice by `Database migrations` when pushed to two branches, and manual dispatches on commits whose automatic run already existed. Open release at the time: R072 (no product change, no deployment).

## Changes
- `scripts/ci/reuse-evidence.mjs`, `scripts/ci/stages.json`: a stage the workflow selected is skipped when a successful check run of that stage exists on a nearby commit (this commit on another branch or event, a parent, an earlier head of the branch, up to 20) whose stage-relevant files are identical to the tree under test; the stage definitions name the check runs and the path patterns that invalidate them. Outputs `run_<stage>` and `evidence` to the job, a table to the step summary. `--force` runs everything selected.
- `.github/workflows/ci.yml`: `checks: read`; the `changes` job checks out 40 commits of history and runs the reuse step after the classification; `check`, `lint`, `terraform` and `e2e` take their condition from it; the `result` job prints the reused evidence; `workflow_dispatch` input `force`.
- `.github/workflows/database.yml`: `checks: read`; new `changes` job gating the four rebuild groups (`guards` always runs); a Windows dispatch forces a rebuild; `!**/*.md` and `scripts/ci/**` in the path filter.
- `.github/workflows/agent-tests.yml`: `checks: read`; new `changes` job gating `test` and `lab`; `!**/*.md` and `scripts/ci/**` in the path filters.
- `tests/unit/ci-reuse-evidence.test.mjs`: ten tests for the decision (not needed, reused, invalidated, partial or failed earlier run, merge of main into a branch, same commit elsewhere, force, summary).
- `project/Documents/Rules/PWA_Orchestration.md`: new section "Lean check routine" (the owner's instruction: Byte runs the fast checks once in a clean tree and records them; Chase reuses them and adds only adversarial review and targeted or real-resource checks; the pull request's CI run is the one broad run; one push per verified batch; wait without polling; never a duplicate run or manual dispatch when evidence exists); step 3 of the process and the consolidated-run paragraph point at it.
- `project/Documents/Rules/Development_Workflow.md`: the change-note Checks row names the commit or run; a check is listed once and reused evidence is cited; Chase's documentation check is part of its verification report, not a separate round; the working-method bullet links the routine.
- `project/Documents/Rules/Release_Workflow.md`: evidence reuse names the automatic skip and which run to cite.
- `database/README.md`: "Each change" names the Markdown exclusion and the rebuild reuse.
- `docs/Development.md`: delivery process and CI description updated.
- `project/Documents/Development_Changes.md`: delivery tooling status rows for the three workflows; duplicate-run suppression moved from future work to done.
- `.claude/agents/chase.md`, `byte.md`, `echo.md`: worker briefs follow the routine (Byte records command, result and commit; Chase reuses and never runs the wide suite; Echo reviews once before the push).
- `CLAUDE.md`: the routine for Claude Code sessions and the pointer to the new `.claude/skills/steward/SKILL.md`, which the Claude Code harness reads on pull requests this session opened (evidence first, one push per verified batch, no polling, no manual dispatch or re-run when evidence exists). This is a configuration file for the tool, created for the requested process change; delete it if unwanted.

## Checks
| Command | Result |
| --- | --- |
| `node --test tests/unit/ci-reuse-evidence.test.mjs` | Pass: 10 of 10 (this commit) |
| `npm test` | Pass: 596 of 596 (this commit) |
| `npm run lint` | 0 errors; 781 pre-existing warnings, none in `scripts/ci` or the new test |
| `python3 -c "yaml.safe_load"` on the three workflows | Parse: jobs `changes, check, lint, terraform, e2e, result`; `changes, guards, rebuild`; `changes, test, lab` |
| `node scripts/ci/reuse-evidence.mjs` candidate listing on this checkout | 23 candidates; `e0285b2` and `6e3c368` differ in no file, `3b2c3be` in 10 |
| Replay: real check runs of `c54abef` (PR #51 head, fetched with `gh api`) through `fetchChecks` and `decide` | `check`, `lint`, `e2e` reused from run 39000205825; `terraform` "no evidence" (it was skipped there). The same response shows the duplicate this batch removes: `rebuild (*)` ran twice on that commit, runs 38999320634 and 38999318260, one per branch |
| `node scripts/check-docs.mjs` | Pass: 0 failures, 0 warnings (this commit) |

## Not run
The reuse step inside GitHub Actions (with `GITHUB_TOKEN` rather than a local token) runs for the first time on this branch's own pull request; its `changes` step summary is the proof. The e2e shards run on this PR because `.github/workflows/ci.yml` changed (no earlier run covers it). A raw API call from this cloud session returned HTTP 401 (the session's GitHub access is proxied for `gh` only), so the live call was validated through `gh api` and the parser instead.

## Recovery
Revert the batch commit on `claude/sleepy-ride-k0i3wz`; Git baseline `e0285b2` on `main`. Reverting restores the previous workflow behavior (every selected stage runs on every push); no live service, database or deployment is involved.

## Open questions
None.

## Remaining work
None. The first pull request after this merge shows the reuse decisions in the `changes` job's step summary; if a stage is ever skipped wrongly, add the missing path pattern to `scripts/ci/stages.json`.
