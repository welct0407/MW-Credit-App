# Change notes — R098 group sender learns the payer name, 2026-10-25

## Purpose
After R095 a slip that a borrower sends in a group with several enabled borrowers (context C4′) posted correctly but never saved the slip's payer name, while the same slip in the borrower's own chat or in the PWA did. The owner reported one such PROD receipt on 25 October 2026 (the borrower's payer name stayed empty). This batch makes C4′ learn the payer name like the borrower's own chat; the posting decision is unchanged.

## Changes
- `integration-agent/src/mw_integration_agent/receipt_identity.py`: the `group_sender` context has `fill` true, and `resolve_payer` returns `learned(borrower, slip)` for it as for `sender` and `forwarded`. The sender still decides the borrower; no hold, no candidate narrowing and no `payer_step` for C4′.
- `integration-agent/tests/test_payer_resolution.py`: the C4′ test now checks, through the poll capture and `process()`, that an empty payer name is filled, a new payer is appended as another line, a matching name changes nothing, and the borrower stays the sender.
- `integration-agent/docs/OPERATIONS.md`: the strong-context list names C4′.

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache .` (in `integration-agent`) | Pass |
| `PYTHONPATH=src:tests python3 -m unittest discover -s tests` (in `integration-agent`) | 617 run, OK (70 skipped) |
| Agent PostgreSQL lab suites (CI list: `test_postgres_state` to `test_statement_snapshot`, disposable clusters from `tests/lab/setup.sh`) | 79 run, OK |
| Read-only trace of the reported receipt (PROD command journal, `mw_agent` jobs and reviews, command-prod logs) | Job after `payer_name_cutoff`, context C4′ (two candidate borrowers, no `payer_step`), slip payer name recognized, `payer_lines` null, posted automatically with `schemaVersion` 7 and no `payerLines`; the only agent receipt since the cutoff |

## Not run
Wide browser suite and SQL tests: no PWA, service or SQL change. The VM deploy is a promotion step.

## Recovery
Revert this commit and redeploy the previous agent commit with `deploy-runtime.py rollback`, or set `payer_name_cutoff` to null. A name already learned stays in `"Communication Name"`; the owner can edit it in the app.

## Open questions
None.

## Remaining work
Deploy to the VM. The borrower from the report has no payer name yet: the next slip in that group fills it, or the owner types it in the app.

## Promotion record

[Template](../../project/scripts/releases/templates/promotion-checklist.md), revision 14 October 2026. One record for both R098 fixes (the other note: [receipt posting hold](CHANGE_NOTES_R098_RECEIPT_POSTING_HOLD_2026-10-25.md)). Recovery: [Release recovery runbook](../../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../../project/Documents/Environment_Inventory.md). No borrower names appear here.

### Continue here
- Outcome/scope and affected components: R098 is agent only: #156 `654f9812` (a borrower's slip in a multi-borrower group learns the payer name) and #157 `dbd2c897` (`retry_after=0` in `ReceiptJournal.accept`, so an approved payment posts in about 40 s instead of about 5 minutes). No SQL, API, Hosting, migration, configuration, catalogue or unit change. Components: the PROD agent on `vm-mw-credit-agent`, and one data fill (below).
- State and next action or actual blocker: frozen; next the VM deploy.
- Source/artifact/configuration pins; runner manifest link: `main` `dbd2c897` (package). No image, no manifest, no SQL release file. Pins go to the Environment inventory after the deploy.
- Existing owner authority and any explicit hands-on checkpoint: the owner's answer "yes" in this conversation, to merge #156, deploy R098 (with #157) to DEV and the PROD agent, and fill one borrower's payer name in PROD from the agent's slip, only if empty, with audit. No other data write, no forced notification or job.
- Previous deployed baseline and recovery: VM at `14c4a403` (R095 deploy 24 October 2026; later releases R096 and R097 did not touch the VM), `payer_name_cutoff` `2026-10-24T18:36:14+00:00`; recovery is `deploy-runtime.py rollback` to the freeze directory this deploy creates.
- Scope freeze/next-number handoff: R098 Frozen and R099 opened with the counter at R100 in the [tracker](../../project/Documents/Release_Tracker.md).
- Checks: #156 agent tests (test and lab) run 40174451126 and run 40174450999; #157 `Development checks` and agent tests (test and lab) on `2633117`, input-equivalent to `dbd2c897` (cited, not rerun); local: `ruff` clean, 618 tests OK, 70 lab-only skipped (see the notes above).

### Promotion
| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | Owner answer above; target `vm-mw-credit-agent` (PROD agent, `mw_agent` and `loan_manager_prod`); live `code_version` and the freeze directory captured at deploy: Pending |
| Required affected checks passed or explicit owner deferral recorded | CI runs above; no deferral |
| Tested package captured; tracker freeze/handoff published | `main` `dbd2c897`; tracker updated (R098 Frozen, R099 Open, counter R100) |
| Changed components deployed in dependency order | DEV: not applicable (below). PROD VM: Pending. Payer-name fill: Pending |
| Version/environment and affected PROD smoke verified once | Pending |
| Actual outcome/changed owning facts recorded; intended publication and final tag verified | Pending (inventory, tracker, Development Changes; tag `R098` through the Release tag workflow) |

**DEV: not applicable.** The integration agent (receipt cycle, review cycle, conversation poll, audit relay, recognizer service) exists once, on `vm-mw-credit-agent`, and works against PROD (`receipt_environment` prod, `mw_agent`, `loan_manager_prod`). There is no separate DEV agent runtime or DEV agent database; DEV only calls the shared recognizer service on the same VM, told apart by caller identity, which the VM deploy restarts. R094 and R095 (the agent changes since the Instagram conversation retirement) therefore had DEV deploys for SQL and the Cloud Run services only, and one VM deploy each; R096 and R097 had none. R098 changes only agent modules, so it has one VM deploy.

**PROD VM deploy** (`codex-cloud` through the IAP SSH key, then root on the VM; owner go recorded above), as OPERATIONS "Deploying a reviewed commit":
1. `update-from-github.sh` (fast-forward to `dbd2c897`; `main` is already merged) and confirm the checkout HEAD equals `dbd2c897`.
2. `sudo python3 integration-agent/scripts/deploy-runtime.py dry-run --commit dbd2c897…` (needs the temporary root-only `mw_agent` operator connection file, created from Secret Manager over SSH stdin and removed after the deploy, as at R094 and R095); expect: the changed modules `receipt_identity.py` and `receipt_journal.py` only, no unit, requirements, catalogue or configuration change, agent schema unchanged.
3. `freeze`, `install`, `activate --probe-request-id <unused uuid>` with the same commit; the helper removes a stale `build/` first. Do not touch `payer_name_cutoff` (unchanged).

**One-borrower payer-name fill** (PROD data, owner "yes"): the borrower is the one reported in the Purpose of this note; the name comes from the agent's recognition of that borrower's slip (the job in `mw_agent`), read-only, never written into any record. Guarded as the commands' `payerLines` write: one transaction as `postgres` over the tunnel and Secret Manager route of `Invoke-CloudFlyway.py` (the session is `codex-cloud`), after the V111 verify checks (flyway 111, target `loan_manager_prod`, instance identity): `UPDATE public."Borrowers" SET "Communication Name"=<name from the slip> WHERE "Row ID"=<borrower> AND coalesce(btrim("Communication Name"),'')=''`, expect exactly one row; zero rows (not empty) means stop and report, never overwrite. Audit: the V97 row-change trigger records the update in `pwa_row_changes` and `pwa_borrower_version_v2` changes (an open borrower edit sees a normal version conflict). The private SQL and receipt (row id, before NULL, counts) stay outside Git. Order: after the VM deploy is verified, because the deployed agent fills it itself on the next group-sender slip with the same value; if that slip arrives first the guarded update affects zero rows and nothing is done.

### Verification and recovery
- Verify (read-only, once): `/ready` true and `code_version` `dbd2c897…`; `mw-integration-agent check` ok; recognizer `/healthz` ok (restarted by the deploy); no failed units and no err-priority journal lines for `mw-*` after activation; first `mw-receipt-summary` and `mw-conversation-poll` cycles succeed. Behaviour, only as real traffic allows and never forced: the next approved automatic payment reaches POSTED about 40 s after capture (compare capture and result-notice times in the audit), and the next group-sender slip saves a payer name (a new line or an empty column filled). Counts after the fill: the borrower's name non-empty, one `pwa_row_changes` row.
- Recovery: `deploy-runtime.py rollback --commit <freeze commit>` restores the previous package (R095 `14c4a403`) from the freeze directory; no state change needs undoing, since the previous package ignores a cleared `retry_after` and the new fill behaviour is only a write the old package does not make. The filled name is editable in the app, or set back to NULL for the one row with the private SQL's row id.

### Close
- Outcome: Pending (applied / verified / owner-accepted, with actual limitations).
- Recovery reference: above.
- Changed documents, if any: Pending (inventory VM row, tracker, Development Changes).
- Published evidence/tag: Pending (`R098`).
- Outstanding owner action, if any: none expected.
