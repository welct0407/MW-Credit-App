# Change notes — R112 pay-forward options reply, 2 November 2026

## Purpose
Pay Forward Release 3 (owner, 2 November 2026: "start release 3, test it and promote to prod too"). A slip above what is due can be answered on the existing review DM with a numbered reply (pay forward, repay principal, split), and the agent posts the chosen plan through the shared receipt API's agent schemaVersion 9. Orchestrator decision: there is no DEV agent, so the loop ships behind a configuration switch that stays off until the owner activates it.

## Changes
- `config.py`, `config.example.json`, `cli.py`: `pay_forward_options_enabled` (default false; non-boolean refused; true needs `partner_review_execution_enabled` and `database_enabled`); `check` reports it as `activation.pay_forward_options`.
- `review_proposal.py`: with the switch on, a slip of today above what is due (not a loan payoff) becomes `Pay forward options` with the server plans' choices and `planSha256` (reads `pwa_pay_forward_plan_v1` through `read_query`, values as psql variables); otherwise unchanged. `same_posting_outcome` keeps an options approval only while `planSha256` is unchanged.
- `partner_review.py`: the reply grammar (`1`, `2`, `2 <n>`, `3 <amount>`; Reject; anything else `OPTIONS_REQUIRED`, nothing decided), the purpose saved in the review detail, `review:<id>:options:<sha>` notice keys, Echo AG-1/AG-2/AG-4 request text.
- `review_cycle.py`: proposals pass the configuration; an unclear reply re-sends the options once per reply; execution re-plans (same day, same `planSha256`, chosen plan covers the remainder) and sends schemaVersion 9; switched off after approval ends MANUAL_REQUIRED; the posted notice adds Echo AG-5.
- `receipt_api.py`: `payload(..., plan=)` builds schemaVersion 9 (v8 keys plus `purpose`, `allocations`, `materialize`, `principal`) under the slip's one request id; 7 and 8 unchanged.
- `service-catalogue.json` revision 34 (no service or switch change), `SERVICE_CATALOGUE.md` revision entry and the two rows; `scripts/deploy-runtime.py` accepts the live 33 to 34 change only with every service and switch unchanged.
- Docs: `PARTNER_REVIEW.md` (new section), `SHARED_RECEIPT_PAYMENT_API.md`, `OPERATIONS.md`.
- Tests touched for the revision: `test_config.py`, `test_receipt_recognition.py` (revision 34), `test_deploy_runtime.py` (the 33 to 34 rule). The options tests are Chase's files.

- Deploy fix (2 November 2026, after Forge's PROD activate refused "R112 catalogue must keep every switch" and rolled back to `232a4bce`): the 33 to 34 rule compared the live switches with the repository defaults. It now requires the candidate's services to equal the repository revision 33 template (`R112_TEMPLATE_SHA256`), the live service names and capabilities to match, and keeps the live switches unchanged (asserted after the transition); `test_deploy_runtime.py` covers a live host with three services enabled.

## Checks
| Command | Result |
| --- | --- |
| Agent tests (`python -m unittest discover -s tests`, 694 tests) | Every existing test passes; the only failures are in Chase's four new options files, written before the shapes were fixed (ALIGN items sent) (Byte) |
| `ruff check integration-agent` | Byte's files clean (Byte) |
| `mw-integration-agent check` (example configuration and catalogue) | ok, `pay_forward_options: false` (Byte) |

## Not run
No VM deploy, no live configuration change, no Instagram send. The switch stays off; activation is a separate owner decision.

## Recovery
Before activation: nothing to do (off). After activation: set `pay_forward_options_enabled` to false with the configuration-only route; approved options reviews then end MANUAL_REQUIRED. Code: revert the batch commit; the catalogue returns to revision 33 only with a matching deploy.

## Open questions
None.

## Remaining work
Chase's verification; activation by the owner after PROD has V125.
