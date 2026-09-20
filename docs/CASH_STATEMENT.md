# Manual daily cash statement

Owner-authorized service, 20 September 2026. Scheduling awaits acceptance.

## Report contract

Every Cash Accounts row gets a statement, including inactive/no-activity accounts. R010 `cash_statement_account_effects` supplies signed amounts, categories, counterparties and posting timestamps. Periods are `[06:00, next 06:00)` Asia/Bangkok using **posting timestamp**, explicitly selected by the owner. Default: latest completed period. `--date YYYY-MM-DD` selects its starting date; incomplete periods are rejected.

Opening = R008 Opening Balance − Baseline Cash In + Baseline Cash Out + effects posted before start. Running balances add signed amounts ordered by posting timestamp, immutable ledger ID and direction. Closing = opening + money in − money out. Missing initialization blocks reporting. Summary includes opening, money in/out, net, closing and count. Decimal arithmetic preserves cents. Backdated entries show their effective movement date separately.

The source is the current corrected operational ledger, not immutable bank settlement history. Corrections can restate previous periods. First preparation freezes a private snapshot; retries reuse it. Preserve existing snapshot/send evidence when designing an explicit future revision; never erase delivery keys.

English/Thai PNGs use Pillow, Garuda (Latin/Thai) and RAQM, with a required-glyph preflight. Account numbers are masked to four digits. Long statements use numbered pages of 16 transactions with opening/brought-forward and closing/carried-forward rows. Real snapshots, images, identities and provider IDs remain private below runtime state. Only synthetic samples may be committed.

## Execution and delivery

Install from a clean published checkout with `sudo sh scripts/deploy-cash-statement.sh`. It backs up affected installed code/config and adds fonts/dependencies without enabling sending or schedules.

```sh
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent cash-statement \
 --config /etc/mw-integration-agent/config.json \
 --catalogue /etc/mw-integration-agent/service-catalogue.json
```

Preparation creates both languages without sending. Explicit `--send` also requires live `sending_enabled=true` and catalogue permissions. Restore sending to false after the manual run. No timer, catch-up, inbound commands, fallback email or financial operations are included.

For an owner-authorized latest-period delivery, `sudo /opt/mw-integration-agent/.venv/bin/python scripts/send-cash-statement-once.py` temporarily enables sending and restores it in `finally`. `scripts/verify-cash-statement.py` reconciles the prepared closing balances against the direct Cash Ledger without printing financial values. `scripts/cash-statement-status.py` reports controls and accepted/unknown send counts only. The initial four-account English run was accepted by Meta; see the change log. No schedule has been installed.

Every image rechecks current Partner opt-in/language, unique username, official conversation/profile binding, controls and signed-ingress messaging window with a 60-second margin. Unknown/closed windows block delivery; that Partner must message the agent before manual retry. Disabled Partners receive nothing. All enabled Partners receive all accounts per owner scope.

Upload directly to Meta and send by attachment ID; never create a public financial-image URL. Each period/account/partner/page has one durable send reservation. ACCEPTED means an API message ID was returned, not that a human read it. Timeout, crash or missing ID leaves UNKNOWN and prevents automatic resubmission. Reconcile through read-only API evidence before recovery; never delete the reservation. A file lock serializes runs.

## Validation and recovery

Source: project `clever-oasis-508610-n7`, instance `appsheet-pg-prod-20260914`, proxy `127.0.0.1:5432`, database `loan_manager_prod`, role `mw_integration_agent`. Fixed SELECT only, repeatable-read snapshot. R010 V27 remains owned by AppSheet-Loan-Project; no schema/app/model change.

Run `python -m unittest discover -s tests -v` and `python scripts/render-statement-sample.py` on Debian; review both images. Coverage includes cutoff, reversals, zero activity, uninitialized balances, opt-out/duplicate identity/language, profile mismatch, window margin, unknown/restart and duplicate delivery. Live results are in the change log.

Rollback reinstalls backed-up Python package and old catalogue/config. Preserve current delivery journals and snapshots; never overwrite later sends with stale state. The independent webhook receiver needs no restart for manual statements.
