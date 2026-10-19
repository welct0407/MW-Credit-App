# Change notes — recognition timeouts and slip downscale (R077), 19 October 2026

## Purpose
The owner's 100-baht PWA upload of 19 October 2026 (about 14:44 Bangkok) was not processed. The command service's Cloud Run request timeout of 15 s returned 504 while the recognizer was still working; the recognizer itself gave up at about 17 s because Gemini is slow on real slips. Owner decisions: shrink the slip before it goes to Gemini and triple the limits. Source only until promotion.

## Changes
- Agent (commit `81f0173`): the recognizer downscales the image to at most 1600 px before sending it to Gemini; the recognizer bounds become 42 s, 40 s and 36 s (were 18, 17 and 12 s). The Instagram receipt cycle bounds are unchanged.
- API and PWA (Byte, commit `650bf1f`): the command route waits up to 45 s for the recognizer, the PWA deadline is 60 s, plus a timing test that keeps the chain in order (recognizer, route, Cloud Run, PWA).
- Infrastructure (Forge, commit `304fe11`): the command service Cloud Run request timeout is 55 s in DEV and PROD (was 15 s). Reader, notify and jobs keep their timeouts.
- Not changed: SQL, the recognition wiring, callers, model, and the Instagram receipt rule. The Instagram image at 14:43:46 was ignored with `BORROWER_NOT_UNIQUELY_ENABLED` by the existing rule (the sender is not exactly one enabled borrower); that is correct behaviour and needs no change.

## Checks
| Command | Result |
| --- | --- |
| Agent tests and `ruff check` | To be filled from the agent worker |
| `npm run lint`, `npm run typecheck`, `npm test`, synthetic build | To be filled from Byte |
| `terraform fmt`, `validate`, `terraform test` (DEV, PROD) | To be filled from Forge |
| `npm run check:docs` | To be filled at commit |
| DEV and PROD promotion | To be filled from the readbacks |

## Not run
- To be filled at closure (for example a PROD check with a real slip by the owner).

## Recovery
Restore the previous image, Hosting version and agent pin recorded as rollback in the [environment inventory](../project/Documents/Environment_Inventory.md), and the previous activation tfvars generation (the command timeout returns to 15 s). No SQL is involved.

## Promotion authority
Owner instruction, 19 October 2026: "yes, merge and push to dev and production once checks pass." This is the scoped approval under the release workflow for R077: DEV and PROD, a new application image on the four Cloud Run services (all four share one image), Hosting, the command service request timeout change by PROD Terraform, and the agent redeploy on the Debian host, with the required promotion records and evidence. It covers no SQL, no financial correction and no forced notification. R077 was frozen at source `683cfceed724778151e1e305adaea50b9ab20c94` (PR #79) at about 08:09Z and R078 opened in the same tracker update.

## Open questions
None.

## Remaining work
Promotion and closure records; the owner's PROD check with a real slip (also still pending from R076).
