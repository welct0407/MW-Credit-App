# Change notes — slip account numbers (R086), 21 October 2026

## Purpose
A real KBank K+ slip of 4,000.00 THB (21:37) was not matched to a cash account. The production extractor (`gemini-3.5-flash-lite`) returned only the sender's number xxx-x-x9562-x in 4 of 4 runs, while the owner's cash account "Dad SCB" matches the printed recipient xxx-x-x0386-x (all accounts and holders active). The owner recorded the payment manually. Recognition now asks for every printed account number and lets the host decide.

## Changes
- Extraction: the model lists every account or PromptPay number printed on the slip. The schema key `recipient_numbers` is renamed `account_numbers` (`integration-agent/src/mw_integration_agent/receipt_image.py`, `receipt_rules.py`, `receipt_hold.py`, Byte).
- Matching: the host keeps exactly one active cash account. Two of ours are ambiguous, none is unmatched. The Instagram receipt cycle uses the same shared `match_account`.
- Transition: readers accept the old key. The PWA `validRecognition` (`services/receipts/recognizer-client.mjs`, `recognizer-rules.mjs`) accepts either key; the agent's `validate_receipt` and `held_text` fall back to it. Removing the fallback is a later-release cleanup.
- Accepted residual, flagged to the owner: a slip of our own outgoing transfer (our account as sender, one foreign account) now matches our account. Both paths have human review: PWA form submission and Partner review approval.
- Deploy order: Cloud Run command service first, then the VM agent package. The deploy engine restarts `mw-receipt-recognition` since the 21 October recognizer-restart fix (fab7878), not in this batch.
- Unchanged and unlikely: `validate_receipt` fails closed (`RECIPIENT_UNREADABLE`) when the slip lists more than 5 numbers; above 5 the PWA warns `account_unmatched`.
- Documentation (Dewey): `integration-agent/docs/RECEIPTS.md` (step 5), `project/Documents/Solution_Design.md` (receipt recognition paragraph), `project/Documents/Development_Changes.md` and `project/Documents/Release_Tracker.md` (R086).

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
- `tests/integration/phase5-v7-payment-independent.test.mjs`: runs in the pull request's CI.
- The deployed path through the command service and the form.
- The Codex provider.
- Slips with 3 or more numbers.

## Recovery
Revert this batch's commit. Roll back in the reverse of the deploy order: the agent first, then the command service. If the command service is rolled back while the new agent is live, its `keysAre` check rejects `account_numbers` and every recognition returns "unavailable" (fails closed; the payment is entered by hand). Forward deploy: command service first, then the agent. After an agent rollback, restart `mw-receipt-recognition`.

## Open questions
None. The residual above is accepted and flagged to the owner.

## Remaining work
Chase, CI, promotion (command service first, then the agent package); later cleanup of the `recipient_numbers` fallback.
