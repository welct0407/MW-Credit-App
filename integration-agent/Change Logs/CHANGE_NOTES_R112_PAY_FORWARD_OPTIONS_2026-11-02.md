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
| PROD deploy of `a0cfabca` on `vm-mw-credit-agent` (Forge, 2 November 2026, UTC) | `update-from-github.sh` (checkout `adcf610b` to `a0cfabca`, clean); dry-run: 6 modules changed, units unchanged, agent schema through V11; freeze 11:18:23Z (rollback `/var/lib/mw-integration-agent/rollback/runtime-20261102T111824156344Z`); install 11:18:24Z to 11:18:29Z (no removed files, no unit change); activate 11:18:36Z to 11:18:40Z, probe `ca81b020-f05e-4b1e-9684-35aba6a2fd21`. Readback: `/ready` true on `a0cfabca`, catalogue revision 34 with the same 14 services enabled as before, configuration 89 keys with `pay_forward_options_enabled` absent, `check` ok with `activation.pay_forward_options` false, no failed units. The schema check used a temporary root-only `postgres` operator file on the VM (password over stdin, never printed), deleted at 11:19Z |
| Activation (owner, 2 November 2026: "Enable the agent as well") | Prerequisites verified live: `partner_review_execution_enabled`, `database_enabled` and `receipt_summary_enabled` true (`sending_enabled` stays false; review and options DMs go through `partner_notice.dispatch`, gated by `receipt_summary_enabled`). Prior value: `pay_forward_options_enabled` absent (off). The new file differed from the live one only in that key (89 to 90 keys). `config-only-change.py apply --tag r112-pay-forward-options`, 11:19:11Z to 11:19:23Z, exit 0; backup `/root/config.json.pre-r112-pay-forward-options` (root:mwagent 0640). Readback: `check` ok with `activation.pay_forward_options` true, `/ready` true on `a0cfabca` (receiver restarted 11:19:20Z), every trigger it paused active again, no failed units. No replay, cutover, unit change, other switch change, DM or slip |

## Not run
No Instagram send, test DM or test slip: the first live options exchange will be a real Partner's slip with money beyond what is due.

## Recovery
Active since 11:19:23Z, 2 November 2026. Rollback: `sudo python3 integration-agent/scripts/config-only-change.py restore --tag r112-pay-forward-options` (restores the backup, so the key is absent and off); approved options reviews then end MANUAL_REQUIRED. Package: `deploy-runtime.py rollback` to the 11:18:23Z freeze directory. Code: revert the batch commit; the catalogue returns to revision 33 only with a matching deploy.

## Open questions
None.

## Remaining work
Owner: watch the first live options exchange (a slip with money beyond what is due).
