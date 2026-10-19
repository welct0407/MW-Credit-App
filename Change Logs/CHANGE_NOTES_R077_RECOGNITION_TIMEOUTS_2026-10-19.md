# Change notes — recognition timeouts and slip downscale (R077), 19 October 2026

## Purpose
The owner's 100-baht PWA upload of 19 October 2026 (about 14:44 Bangkok) was not processed. The command service's Cloud Run request timeout of 15 s returned 504 while the recognizer was still working; the recognizer itself gave up at about 17 s because Gemini is slow on real slips. Owner decisions: shrink the slip before it goes to Gemini and triple the limits. Released to DEV and PROD on 19 October 2026 (source `683cfce`, PR #79).

## Changes
- Agent (commit `81f0173`): the recognizer downscales the image to at most 1600 px before sending it to Gemini; the recognizer bounds become 42 s, 40 s and 36 s (were 18, 17 and 12 s). The Instagram receipt cycle bounds are unchanged.
- API and PWA (Byte, commit `650bf1f`): the command route waits up to 45 s for the recognizer, the PWA deadline is 60 s, plus a timing test that keeps the chain in order (recognizer, route, Cloud Run, PWA).
- Infrastructure (Forge, commit `304fe11`): the command service Cloud Run request timeout is 55 s in DEV and PROD (was 15 s). Reader, notify and jobs keep their timeouts.
- Not changed: SQL, the recognition wiring, callers, model, and the Instagram receipt rule. The Instagram image at 14:43:46 was ignored with `BORROWER_NOT_UNIQUELY_ENABLED` by the existing rule (the sender is not exactly one enabled borrower); that is correct behaviour and needs no change.

## Checks
| Command | Result |
| --- | --- |
| Agent tests and `ruff check` | Pass in the PR #79 run, Agent tests 39219602837 |
| `npm run lint`, `npm run typecheck`, `npm test`, synthetic build | Pass in the PR #79 run, Development checks 39219602724 (includes the timing test and Terraform validation) |
| Database guards and rebuild | Evidence reused from run 39219109717 (no SQL change) |
| `npm run check:docs` | 0 failures |
| DEV promotion, 19 October 2026 | Command image built and applied (plan 0/1/0), revision with request timeout 55 s; Hosting deployed, label R078 |
| PROD promotion, 19 October 2026 | One image on the four services plus the command request timeout 55 s (plan 0/4/0, applied 08:13:52Z to 08:14:28Z); Hosting deployed, marker R077; no SQL (readback V96 at 08:10:24Z); agent deployed 08:16:21Z. Smoke: build-version R077, read and command `/health` 200; synthetic cycle slip of 4000 px sent as 1600 px, valid in 7.07 s. Pins are in the inventory |

## Not run
- The owner's retry of a real slip in PROD: pending.
- Wide browser suites beyond the PR run: the lean check routine runs them once.

## Recovery
Restore the previous image, Hosting version and agent pin recorded as rollback in the [environment inventory](../project/Documents/Environment_Inventory.md), and the previous activation tfvars generation (the command timeout returns to 15 s). No SQL is involved.

## Promotion authority
Owner instruction, 19 October 2026: "yes, merge and push to dev and production once checks pass." This is the scoped approval under the release workflow for R077: DEV and PROD, a new application image on the four Cloud Run services (all four share one image), Hosting, the command service request timeout change by PROD Terraform, and the agent redeploy on the Debian host, with the required promotion records and evidence. It covers no SQL, no financial correction and no forced notification. R077 was frozen at source `683cfceed724778151e1e305adaea50b9ab20c94` (PR #79) at about 08:09Z and R078 opened in the same tracker update.

## Open questions
None.

## Remaining work
The owner retries a real slip in PROD (also still pending from R076). Gemini latency watch and the other follow-ups stay in [Development changes](../project/Documents/Development_Changes.md).
