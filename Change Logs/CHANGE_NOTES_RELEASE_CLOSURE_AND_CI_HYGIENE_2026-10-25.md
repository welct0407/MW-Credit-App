# Change notes — One closure pull request per release and CI hygiene (Batch 1), 25 October 2026

## Purpose
Owner instruction of 25 October 2026 ("Adopt the newly proposed methodology"): 40 of the 80 pull requests merged between 19 and 25 October were records-only ceremony. Adopt option A (one closure pull request per release) and option C (records ride code pushes) of the Development Checks tune-up plan, and ship CI hygiene Batch 1 in the same pull request. Options B (several promotions per release number) and D (dropping the `ci.yml` push-to-main trigger) are not adopted.

## Changes
- `project/Documents/Rules/Release_Workflow.md`: freeze step 2 pins the freeze in the promotion record instead of a separate tracker update and says what `main` shows until the closure lands (the promoted release still Open, DEV builds labelled with it, only frozen-scope corrections merged); Promotion step 4 creates the tag on the package commit first, then publishes freeze pin, promotion record, tag record and prune in one closure pull request after verified deployment; the prune is listed in that same pull request; owner acceptance goes into the next closure or product pull request; revision line 25 October 2026.
- `project/Documents/Release_Tracker.md`: rule text matches (the state change, Released or Frozen when the session ends before closure, and the next Open number published with the closure); the next-number row no longer says the number opens at promotion start.
- `project/Documents/Rules/PWA_Orchestration.md`: lean check routine item 3 and the owner revision line.
- `project/Documents/Rules/Development_Workflow.md`: records-publication bullet under retention.
- `project/scripts/releases/templates/promotion-checklist.md`: freeze row, close row and revision date.
- `AGENTS.md`: Records rule and owner revision line.
- `.claude/agents/dewey.md`, `.claude/agents/echo.md`, `.claude/skills/steward/SKILL.md`: no records-only pull requests or pushes during development.
- `tests/e2e/startup-generations-independent.spec.ts`: the PR runs of #162 and #163 failed this spec twice each with "Execution context was destroyed" at the cache-pruning read. Root cause (CI trace): activating build D reloads the page by itself (R072/R083), and the `publicCaches()` read in the un-guarded prune poll can land in that navigation. Pre-existing on main (4 of 12 failed under 4-worker load at 45204c5); not caused by this batch. `publicCaches()` now waits for the new page and reads again on that one error, at most five times; every other error and every assertion is unchanged. Batch 1 with the fix: 28 loaded runs without the navigation error, 6 of 6 at CI-like load. A separate, rarer 5 s timeout on "Unable to check app version" (line 49) seen only under 4-worker local load stays open.
- Grafana MCP bridge (owner instruction of 25 Oct to fold it into this PR): the workflow re-pin ran `grafana-mcp-bridge / offline-security`, whose `npm audit` failed on new high-severity advisories against the bridge's exact pins (`@modelcontextprotocol/server` 2.2.0: GHSA-jm63-cq47-j5jp, GHSA-46jr-4wx8-v453, GHSA-rvq5-wwqv-78pq; `zod` 4.3.6: GHSA-mrhx-c7xc-m3w5). Pinned `@modelcontextprotocol/server` 2.4.0 and `zod` 4.6.7 (lockfile regenerated with npm 11.19; `/node` 2.1.0 dedupes to the new server). Bridge `npm test` 78/78, `npm audit` 0, `npm run estimate` pass; Docker builds run in CI only. The deployed bridge keeps the old image until its next deployment, which this change does not authorize.
- Workflows (`ci.yml`, `database.yml`, `agent-tests.yml`, `grafana-mcp-bridge.yml`, `release-tag.yml`): Node 24 action pins with SHAs verified by `git ls-remote` (checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2, cache v6.1.0, setup-python v7.1.0, setup-terraform v4.0.1); inputs unchanged. `ci.yml` e2e caches the Playwright browsers keyed on the Playwright version and `ImageOS` and skips the apt install on a hit.
- `package.json` and `package-lock.json`: `allowScripts` for `@firebase/util`, `esbuild` and `protobufjs` by name, no version pin; `cloud-sql-connector` 1.12.1; override `rimraf ^6` removes `glob@10`.
- `vite.config.ts`: `chunkSizeWarningLimit` 1000 (largest chunk 770 kB measured).
- `biome.json`: `noEmptyPattern` off for `tests/e2e/**`; the reason is in `docs/Development.md` because `biome.json` is plain JSON and cannot carry a comment. Safe `biome --write` fixes across 23 files.
- `tests/e2e/receipt-recognition-independent.spec.ts`: flaky (reproduced 1 in 20). Auto-assign finished after the form snapshot taken before the language switch; the spec now waits for the Auto-assign request and "Allocated฿110".
- `integration-agent/`: `contextlib.closing` in four tests and in `state_migration.py` `backup_journals` (ResourceWarnings 29 to 0); see its own change note.
- The lockfile also moves `@googleapis/sqladmin`, `gaxios`, `google-auth-library` and `p-throttle` with the connector 1.12.0 to 1.12.1: a production dependency update, to watch at the next DEV deploy.
- `project/Documents/Development_Changes.md` (`ci.yml` row) and `docs/Development.md` (CI paragraph) updated.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | 0 failures, 0 warnings on the working tree over 45204c5 |
| `npm run lint` | 0 errors; warnings 792 to 731 (the plan's about 540 needs Batch 2), 5 infos (Byte) |
| `npm run check` | Pass, 913 pass and 1 skipped (Byte) |
| `npm run build:live-dev` | Pass (Byte) |
| `npm audit --omit=dev` | 0 vulnerabilities (Byte) |
| `check-binary-evidence`, actionlint 1.7.12, YAML parse, ruff | Pass (Byte) |
| Agent tests (`-W error::ResourceWarning`) | 618 OK, 70 skipped; ResourceWarnings 29 to 0 (Byte) |
| Flaky spec `receipt-recognition-independent.spec.ts` | 20/20, and the spec 140/140 with `--repeat-each 10` (Byte) |
| Chase verification | Ready to push, no blocking defects. All 6 action pins re-verified with `git ls-remote` and every input exists at the new SHAs (node24); `npm ci` on a clean copy of `package.json` and the lock passes (rimraf 6.1.3, glob 13.0.6, 0 vulnerabilities); `allowScripts` matches exactly the 3 packages with install scripts; the Playwright version lookup resolves (1.63.0); the 23 Biome fixes reviewed by word diff, no behaviour change; flaky-spec fix adds waits only, no weakened assertion; `state_migration.py` closing preserves commit and rollback; docs and release rules consistent; `ci.yml` routes every stage on the PR (Chase) |
| Development checks (pull request) | The pull request's run on this commit |

## Not run
Playwright cache hit path: the first run after merge is a miss; the next pull request that runs e2e proves the hit. To confirm on the pull request run: DEP0040 and DEP0169 warnings, the git "master" hint and the cache-save warning on the first miss (the three e2e shards may log "unable to reserve cache" warnings, harmless). Accepted upstream limits: `node-domexception` and the Terraform "resource targeting" warning.
No promotion, deployment or PROD effect. The new closure flow is first exercised by the next release.

## Recovery
Revert the batch commit; the previous three-pull-request ceremony is restored from Git. Prior releases' records are unchanged.

## Open questions
None. Owner decisions of 25 October 2026: Option B (several promotions under one release number) is not adopted for now; Batch 3 hook warnings are to be fixed with review (reject render-created dependencies, suppress intentional cases with reasons).

## Remaining work
Chase's verification; Batch 2 and 3 of the tune-up plan.
