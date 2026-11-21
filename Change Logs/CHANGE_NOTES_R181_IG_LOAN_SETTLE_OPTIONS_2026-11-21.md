# Change notes — R181 Instagram options offer closing loans, 21 November 2026

## Purpose
Owner request of 21 November 2026: a borrower's slip equalled the combined payoff of two open loans but the Instagram request offered no way to close them. The request now offers closing one or several loans, on the Reviewer's approval. Design and build are authorized; PROD promotion is not yet authorized.

Evidence (read-only, PROD, 21 November 2026): a 3,300 slip equal to both principals plus the day's interest; the review was "Pay forward options" with an empty principal list and both loans blocked with reason `settles`; only pay forward and recheck were offered.

## Changes
- Migration `database/migrations/V153__agent_receipt_settle.sql`: patches `pwa_submit_agent_receipt_v1` and its status function in place (owner and grants kept); command schemaVersion 11 adds the loans to settle, each pinned to its Loan Close quote; reviewed mode only, slip dated today; the server re-checks the loans and quotes; one atomic payment; versions 7 to 10 unchanged; no table or column.
- Command service: `services/agent-receipts/contract.mjs` accepts version 11.
- Agent: switch `loan_settle_options_enabled` (strict boolean, default off; needs `pay_forward_options_enabled` and `receipt_payment_api_enabled`; no catalogue revision). Up to three close choices under code 4 of the options request (one loan with the rest paid forward, or several loans), each confirmed by a plan read and every loan's quote; execution needs the identical settled set and plan hashes, else STALE "Loans not closed"; switch off after approval means manual. The legacy reply "4 = recheck" is withdrawn. The rebate is shown per loan from the quote.
- Data Dictionary: the entries for these routines are PROD captures; refresh them after promotion.
- Documents updated: `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `integration-agent/README.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `RECEIPTS.md`, `SHARED_RECEIPT_PAYMENT_API.md`, `database/README.md`.

## Checks
| Command | Result |
| --- | --- |
| ruff | Pass (Byte, `9c7f62dc`) |
| Agent unit tests | 1,184 OK, 84 skipped (Byte, `9c7f62dc`) |
| Biome; `tsc` for services; receipt-command and late-charge unit tests | Pass; 20/20 (Byte, `9c7f62dc`) |
| `mw-db-ci` migrations and phase8, including `Test-AgentReceiptSettle.sql` | Exit 0 (Byte, `9c7f62dc`) |
| Chase adversarial review of `fbe0a848..9c7f62dc` | Pass, no defect above Low. V153 only adds the v11 branches (7 to 10 unchanged); v11 is reviewed-only and today-only; all-or-nothing through the P4C05 rollback; owner and ACL kept; no table or column. Agent close choices and the STALE and manual paths pass; a legacy "4" on a request without close choices gives OPTIONS_REQUIRED and nothing posts; the rebate is recorded by the same server rule as the PWA |
| `test_r181_a_stale_close_choice_keeps_its_recheck_and_a_legacy_four_changes_nothing` (added in `4f89628b`) | File 33 OK, ruff clean (Chase) |
| `npm run check:docs` | 0 failures (Dewey) |

## Not run
- Low findings, recorded and not fixed: `Test-AgentReceiptSettle.sql` covers only the offset rebate path, not the expense path or two loans of one referrer in one payment (it needs the DEV command-IAM harness); a quote failure at execution goes STALE instead of retrying (fail-closed).
To be filled. PROD promotion and any live financial write are not authorized.

## Recovery
Git baseline `main` `e88337ee` plus the acceptance commit `24836460`. No deployment has happened.

## Open questions
To be filled.

## Remaining work
Design (Archie), implementation (Byte), tests (Echo), review (Chase), then documentation and this note.
