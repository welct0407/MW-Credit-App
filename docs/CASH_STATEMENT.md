# Daily cash statement

Owner-authorized production service, 20 September 2026. It runs daily at 00:15 Asia/Bangkok.

## Report contract

Every Cash Accounts row gets a statement, including inactive/no-activity accounts. R010 `cash_statement_account_effects` supplies signed amounts, categories, counterparties and posting timestamps. Periods are `[00:00, next 00:00)` Asia/Bangkok using **posting timestamp**, explicitly selected by the owner. Default: latest completed period. `--date YYYY-MM-DD` selects its starting date; incomplete periods are rejected.

Opening = R008 Opening Balance − Baseline Cash In + Baseline Cash Out + effects posted before start. Running balances add signed amounts ordered by posting timestamp, immutable ledger ID and direction. Closing = opening + money in − money out. Missing initialization blocks reporting. Summary includes opening, money in/out, net, closing and count. Decimal arithmetic preserves source precision; displayed amounts use whole baht (nearest integer, half up). Backdated entries show their effective movement date separately.

The source is the current corrected operational ledger, not immutable bank settlement history. Corrections can restate previous periods. First preparation freezes a private snapshot; retries reuse it. Calendar-day snapshots use `cash-statements/calendar-day/YYYY-MM-DD`. Delivery keys contain the full interval. Preserve existing snapshot/send evidence when designing an explicit future revision; never erase delivery keys.

Statements use the local M&W Credit logo without repeated brand text, #D81B60 structural accents, green inflows and red outflows, HH:MM posting times without dates or seconds, and a date-free footer. English/Thai PNGs use Pillow, Garuda (Latin/Thai) and RAQM, with a required-glyph preflight. Account numbers are masked to four digits. Long statements use numbered pages of 16 transactions with opening/brought-forward and closing/carried-forward rows. Real snapshots, images, identities and provider IDs remain private below runtime state. Only synthetic samples may be committed.

## Execution and delivery

The owner-supplied logo is bundled at `mw_integration_agent/assets/mw-credit-logo.png`. Debian keeps it under `/opt/mw-integration-agent/.venv/lib/python3.13/site-packages/`; every page uses this local file. It is included in package installation and source recovery, so no Drive access or download is required during a run. Source provenance and SHA-256 are recorded beside the asset.

Install the accepted schedule from a clean published checkout with `sudo sh scripts/install-cash-statement-schedule.sh`. It backs up affected code/config/unit files, installs the package and systemd units, enables the daily and email-retry timers, and leaves the general `sending_enabled` control off. The dedicated `cash_statement_schedule_enabled` flag authorizes only this job.

```sh
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent cash-statement \
 --config /etc/mw-integration-agent/config.json \
 --catalogue /etc/mw-integration-agent/service-catalogue.json
```

Preparation creates both languages without sending. Explicit `--send` still requires live `sending_enabled=true`. The timer invokes `--scheduled`, which requires `cash_statement_schedule_enabled=true`, `email_fallback_enabled=true`, and the relevant catalogue entries. `Persistent=true` catches up one missed scheduled run after downtime; the report key and journals prevent duplicate accepted delivery.

`scripts/verify-cash-statement.py` reconciles prepared closing balances against the direct Cash Ledger without printing financial values. `scripts/cash-statement-status.py` reports controls and accepted/unknown send counts only. The editable maintained flow is [BUSINESS_PROCESS.drawio](BUSINESS_PROCESS.drawio), with [PNG preview](BUSINESS_PROCESS.png).

Every image rechecks current Partner opt-in/language, unique username, official conversation/profile binding, controls and signed-ingress messaging window with a 60-second margin. Disabled Partners receive nothing. All Partners whose current `IG Integration Enabled` value is true receive all accounts in their preferred language.

Upload directly to Meta and send by attachment ID; never create a public financial-image URL. Each period/account/partner/page has one durable send reservation. ACCEPTED means an API message ID was returned, not that a human read it. Timeout, crash or missing ID leaves UNKNOWN and prevents automatic Instagram resubmission.

If the Instagram route is unavailable, its 24-hour window is closed, or delivery is rejected, partial or unknown, send one complete fallback email to the same Partner row's current `Email`. The subject and body follow `Language Preference`; all generated account pages are attached. Microsoft Graph authenticates as `welctcodex@outlook.com` using the program-owned OAuth credential. The fallback has its own durable key. Provider acceptance is terminal; an uncertain outcome is never replayed. A definitely unsent result retries after bounded backoff, at most three attempts, through the five-minute retry timer. A changed/disabled Partner or changed email cancels a queued retry. Inbound email commands are outside scope.

## Validation and recovery

Source: project `clever-oasis-508610-n7`, instance `appsheet-pg-prod-20260914`, proxy `127.0.0.1:5432`, database `loan_manager_prod`, role `mw_integration_agent`. Fixed SELECT only, repeatable-read snapshot. R010 V27 remains owned by AppSheet-Loan-Project; no schema/app/model change.

Run `python -m unittest discover -s tests -v`, `python scripts/render-statement-sample.py`, and `python scripts/generate-business-process.py`; review the statement samples and process diagram. Coverage includes cutoff, reversals, zero activity, uninitialized balances, opt-out/duplicate identity/language, profile mismatch, window margin, unknown/restart, duplicate delivery, email reservation/retry and configuration gates. Live results are in the change log.

Rollback reinstalls backed-up Python package and old catalogue/config. Preserve current delivery journals and snapshots; never overwrite later sends with stale state. The independent webhook receiver needs no restart for manual statements.

Only the current completed-day format is runnable. Temporary incomplete-day preview and forced-language review options have been removed. Normal delivery always uses each enabled Partner's current language preference. Historical private snapshots and send journals remain retained as audit evidence and cannot be replayed by the current scripts.
