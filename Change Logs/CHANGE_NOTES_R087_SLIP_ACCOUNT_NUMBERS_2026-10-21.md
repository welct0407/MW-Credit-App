# Change notes — slip account numbers (R087), 21 October 2026

## Purpose
A real KBank K+ slip of 4,000.00 THB (21:37) was not matched to a cash account. The production extractor (`gemini-3.5-flash-lite`) returned only the sender's number xxx-x-x9562-x in 4 of 4 runs, while the owner's cash account "Dad SCB" matches the printed recipient xxx-x-x0386-x (all accounts and holders active). The owner recorded the payment manually. Recognition now asks for every printed account number and lets the host decide.

## Changes
- Extraction: the model lists every account or PromptPay number printed on the slip. The schema key `recipient_numbers` is renamed `account_numbers` (`integration-agent/src/mw_integration_agent/receipt_image.py`, `receipt_rules.py`, `receipt_hold.py`, Byte).
- Matching: the host keeps exactly one active cash account. Two of ours are ambiguous, none is unmatched. The Instagram receipt cycle uses the same shared `match_account`.
- Transition: readers accept the old key. The PWA `validRecognition` (`services/receipts/recognizer-client.mjs`, `recognizer-rules.mjs`) accepts either key; the agent's `validate_receipt` and `held_text` fall back to it. Removing the fallback is a later-release cleanup.
- Accepted residual, flagged to the owner: a slip of our own outgoing transfer (our account as sender, one foreign account) now matches our account. Both paths have human review: PWA form submission and Partner review approval.
- Deploy order: Cloud Run command service first, then the VM agent package. The deploy engine restarts `mw-receipt-recognition` since the 21 October recognizer-restart fix (fab7878), not in this batch.
- Unchanged and unlikely: `validate_receipt` fails closed (`RECIPIENT_UNREADABLE`) when the slip lists more than 5 numbers; above 5 the PWA warns `account_unmatched`.
- Documentation (Dewey): `integration-agent/docs/RECEIPTS.md` (step 5), `project/Documents/Solution_Design.md` (receipt recognition paragraph), `project/Documents/Development_Changes.md` and `project/Documents/Release_Tracker.md` (R087).

## Checks
All ran on the uncommitted tree, base 7e108bc, branch `claude/receipt-account-numbers`.

| Command | Result |
| --- | --- |
| `PYTHONPATH=src:$PYTHONPATH python3 -m unittest discover -s tests` in `integration-agent/` (Byte) | 757 OK, 97 skipped |
| `ruff check --no-cache integration-agent` (Byte) | Clean |
| `node --test tests/unit/receipt-recognition-rules.test.mjs tests/unit/receipt-recognition-route.test.mjs` (Byte) | 15 pass |
| `npm test` (Byte) | 767 pass |
| `npm run lint` (Byte) | Exit 0, one pre-existing warning |
| `npm run typecheck` (Byte) | Exit 0 |
| Repo-wide consumer grep (Chase) | Clean apart from the intentional fallbacks |
| Diff review (Chase) | Done |
| Real K+ slip through the branch's `recognize()` on the agent VM, production config (`gemini-3.5-flash-lite`), read-only (Chase) | 4 of 4 runs returned both xxx-x-x9562-x and xxx-x-x0386-x and matched "Dad SCB", 2.8 to 3.4 s |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings |

## Not run
- The Codex provider and slips with 3 or more numbers.
- No payment, notification or job was run in PROD; the owner's recording of the next real slip is the first form-path check.
- `tests/integration/phase5-v7-payment-independent.test.mjs` ran in the pull request's CI (see Pull request below).

## Recovery
Revert this batch's commit. Roll back in the reverse of the deploy order: the agent first, then the command service. If the command service is rolled back while the new agent is live, its `keysAre` check rejects `account_numbers` and every recognition returns "unavailable" (fails closed; the payment is entered by hand). Forward deploy: command service first, then the agent. After an agent rollback, restart `mw-receipt-recognition`.

## Open questions
None. The residual above is accepted and flagged to the owner.

## Remaining work
- The first real K+ slip in the PWA form: confirm it fills the account "Dad SCB" without an `account_unmatched` warning.
- A later release removes the `recipient_numbers` fallback (PWA `validRecognition`, agent `validate_receipt` and `held_text`).

## Pull request
Pull request #117 merged as `bf11e408a9786963faa616fb839e890b016523f2` (merge `59c63e0` brought in main after R086 was released, and the batch moved from R086 to R087). CI on `59c63e0`: Development checks run 39632271760, Agent tests 39632271890, Database migrations 39632264520, all success.

## Promotion record

Release R087: Cloud Run command service and Debian agent package, no SQL, 21 October 2026 (UTC). Package commit `bf11e408a9786963faa616fb839e890b016523f2`.

- **Authority:** the owner's words on 21 October 2026: "Move it to production when CI is green". CI was green (Pull request above).
- **Builds:** from a clean scratch clone at `bf11e40` through `scripts/Invoke-Terraform.ps1` with the private root `~/.mw-private`.
- **DEV:** Cloud Build `c74d5cbc-2963-4da0-ba7a-7b8d57e26ad9` (`cloudbuild-command.yaml`), 16:26:11Z to 16:26:50Z; plan 0/4/0, image only; applied 16:28:37Z to 16:29:14Z, re-plan no changes. Revisions command, read, notify and jobs moved one step (`command-dev-00050-z26`, `read-dev-00038-z2k`, `notify-dev-00018-z8c`, `jobs-dev-00018-4vr`). Smoke 16:30Z: `/health` 200, unauthenticated `/api/session` 401, no ERROR logs. No keep tag, as for R080 and R081 DEV.
- **PROD:** Cloud Build `0993615b-3dcc-4375-9358-97b3009ddb1d` (`cloudbuild-business.yaml`), 16:30:37Z to 16:31:15Z; plan 0/4/0 (`business_image` and `workers.image` only); applied 16:32:04Z to 16:32:40Z, re-plan no changes. Revisions `command-prod-00024-zcc`, `read-prod-00020-pqc`, `notify-prod-00018-wft`, `jobs-prod-00018-vwd`. Keep tag `keep-r087-runtime`; `keep-r081-runtime` stays on the prior image. Smoke 16:33Z: `/health` 200, `/api/session` 401, recognizer environment unchanged, no ERROR logs 16:28Z to 16:38Z, no payment, notification or job run.
- **Agent (after the command service):** checkout `7e108bc9` to `bf11e408`; dry-run showed the schema through V8 with nothing missing, changed modules `receipt_hold`, `receipt_image`, `receipt_rules`, units unchanged; freeze 16:35:38Z (`runtime-20261021T163538908639Z`), install 16:35:45Z (no unit changes), activate 16:35:49Z to 16:35:54Z (probe `36d4214f-93a9-4121-a083-8d8756f84954`). The deploy engine restarted the recognizer (InvocationID `1ae31900…` to `f6ac10d8…`, 16:35:53Z) and the receiver (`ae77b25f…` to `d5d3b8ec…`). `/ready`: `bf11e408`, failed none; `/healthz` ok and enabled; 8 timers and both wake paths active, 0 failed units. The engine's recognizer restart, first run at R086, is confirmed again with InvocationIDs (see the [recognizer restart note](../integration-agent/Change%20Logs/CHANGE_NOTES_RECOGNIZER_RESTART_2026-10-21.md)).
- **Functional check (16:38:29Z):** the deployed `recognize()` on the real K+ slip returned `account_numbers` [xxx-x-x9562-x, xxx-x-x0386-x] and matched "Dad SCB" in 3.6 s.
- **Recovery:** roll back the agent first (`deploy-runtime.py rollback --commit bf11e408…` restores `7e108bc9` from `runtime-20261021T163538908639Z`; then check that the recognizer restarted), then PROD (restore `production.activation.before-r087-1792512671814910.tfvars`, plan 0/4/0 back to the R081 image, apply, `-PublishActivation`), then DEV the same way. Rolling the command service back while the new agent is live makes every recognition return "unavailable". Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).
- **Outcome:** applied and verified (deployed `recognize()` on the real slip, `/ready`, `/health`). Owner acceptance is the production instruction above; the first real slip in the PWA form is the remaining check.

### Closure pruning (release workflow, 21 October 2026)
- No change note left the retention window (R087, R086, R085 are the three most recent Released; the root `Change Logs/` holds only R086 and R087 notes, and R084 and R082 are agent change notes, which are not pruned). The R087 Development Changes row became one follow-up row.
