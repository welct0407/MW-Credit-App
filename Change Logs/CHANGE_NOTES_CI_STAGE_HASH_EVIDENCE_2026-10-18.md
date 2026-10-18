# Change notes — CI evidence reuse by stage hash (R074 tooling), 18 October 2026

## Purpose
CI evidence reuse walked the commit graph, so a records-only push on a pull request still ran every stage once `main` had moved in stage-relevant files (PR #56: 9f16621 and f3bb716 ran all stages). Reuse now matches evidence by content instead of history.

## Changes
- Evidence artifacts: each successful stage job (check, lint, terraform, e2e shards; database rebuild groups; agent-tests test and lab) uploads `evidence-<workflow>-<stage>-<hash>[-<variant>]`, kept 90 days.
- Hash: sha256 over the stage-relevant tracked files (mode, blob and path from `git ls-tree`, filtered by `scripts/ci/stages.json`), computed on the job's own checkout.
- Lookup: the `changes` job hashes each needed stage and finds artifacts by exact name. It trusts one only if it is unexpired, from a same-repository run (no fork) of the same workflow file, with event push, pull_request or workflow_dispatch, and the named job concluded success in the run's latest attempt.
- A stage is skipped only when every check has such evidence; the step summary cites the run. `--force` still runs everything. `loadStages` and `isRelevant` are unchanged, so the promotion runner keeps using them.
- Workflow permissions: `actions: read` added, `checks: read` removed.
- Linux-only database evidence: `database.yml` rebuild evidence is computed and uploaded only on Linux (`runner.os == 'Linux'`), because the evidence name carries no OS (Chase's finding 2). A Windows dispatch still always rebuilds.
- Runner hash evidence: the R074 promotion runner (`validateR074Ci`) accepts a job entry `{runId, headSha, evidence: <artifact name>}`. It recomputes the stage hash from the source commit's tree (`ls-tree` of the source, via the shared `hashEntries`) and requires the evidence name to match. The artifact in `applicationCi.artifacts[name]` must be unexpired, from the cited run and head, and not from a fork, and the run's job must have executed with success. No ancestry or diff check applies to such an entry; entries without `evidence` keep the ancestor or delivery-tool rule, and `guards` has no stage evidence so it keeps the ancestor rule only. Verify-live re-reads the artifact list from GitHub by name. Reason: hash reuse can make the `main` merge cite a pull_request run (the synthetic merge was tested, `head_sha` is the PR head) or a non-ancestor run, which the ancestor rule would reject and force another dispatch (Chase's finding 1). Details in `scripts/promotion/README.md` (Byte).
- Code and workflows are Byte's (`scripts/ci/reuse-evidence.mjs`, `.github/workflows/`, `tests/unit/ci-reuse-evidence.test.mjs`).
- Documents updated: `docs/Development.md` (CI paragraph), `project/Documents/Development_Changes.md` (delivery tooling status rows for `ci.yml`, `database.yml`, `agent-tests.yml`), `project/Documents/Rules/PWA_Orchestration.md` (lean check routine item 5), `.claude/skills/steward/SKILL.md` (reuse description). The earlier [graph-based change note](CHANGE_NOTES_CI_EVIDENCE_REUSE_2026-10-18.md) is now historical.

## Checks
| Command | Result |
| --- | --- |
| Unit tests (`ci-reuse-evidence` + `business-hosting-delivery`) | Pass, 62/62 |
| `npm run typecheck` | Exit 0 (does not cover `scripts/` or `tests/`) |
| `npx biome check` | Exit 0, one pre-existing warning |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |
| actionlint 1.7.7 on the three workflows | Exit 0 |
| Chase's adversarial review | Two medium findings fixed; low findings accepted as limits below |
| Development checks | The pull request's run |

## Not run
Reuse on a live merge is not exercised before merge. Expected proof: the next merge into `main` and the next records-only push on a pull request show "reused" with an artifact citation.

## Recovery
Revert the batch commit; the workflows return to graph-based reuse. Evidence artifacts expire after 90 days and need no cleanup.

## Open questions
None.

## Known limits
- Evidence is trusted by artifact name from any same-repository run, so a collaborator with push access could forge it. Accepted for this two-person repository; forks are excluded.
- A GitHub API error fails the `changes` job (fails closed).

## Remaining work
One-time cost: the first runs after merge rebuild the evidence store.
