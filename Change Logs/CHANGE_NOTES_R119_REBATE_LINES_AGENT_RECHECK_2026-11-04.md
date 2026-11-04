# Change notes — R119 every rebate line and the agent recheck, 4 November 2026

## Purpose
The owner deferred three items from R118 into R119 (3 November 2026) and instructed "There're some items queued for R119. Fix them", then answered "include the held-slip auto recheck" and "take R119 all the way to PROD". Status: In progress (DEV and PROD pending). The scope is two parts: show every rebate when one payment closes several referred loans (PWA, API, push), and let the integration agent recheck slips once their cause is fixed in the app. The agent part has its [own note](../integration-agent/Change%20Logs/CHANGE_NOTES_R119_AGENT_RECHECK_2026-11-04.md).

## Changes
Scope:
- **Every rebate line.** Since R117 each closed loan gets its own rebate and offset (`ro122:<payment>:<loan>`), but the payment record and the push read only the first one (`LIMIT 1`). Both now show all of them.
- **Agent recheck.** An ignored group slip is processed once its sender becomes an enabled borrower, and a held slip is requeued once its cause is fixed (borrower enabled, cash account number added). It is behind a switch that is off until activated.
- **PREPARED route.** `receipt-reconsider` accepts a `PREPARED` job from `receipt-prepare`, so Gun's case no longer needs a database edit.

Design decisions (Archie):
- No new table or column. V134 adds one function, as the v2 to v3 step did.
- `closeRebate` stays as `closeRebates[0] ?? null`, so a phone on the old PWA bundle keeps working. The new array is read first when present.
- The dispatcher tries `pwa_notify_content_v4`, then v3, v2 and v1, so a dispatcher deployed before the migration still works.
- The recheck trigger is a change in the borrower master (a snapshot file next to the poll lock), not a bounded re-read of every ignored row. No database column; the first run only writes the snapshot.
- An ignored row becomes `BORROWER`, not a new outcome value, so the identity code is unaffected. Meta's changing message ids are matched by time within 5 seconds.
- The held recheck reuses the reconsider logic through one shared `requeue`, keeps the saved extraction (no new OCR), never reopens a decided review and runs at most once per change.

Files and objects:
- `services/business/payments.mjs`: `readPaymentRecord` returns `closeRebates` (every rebate, in Payment Allocations order, then loan id), each with `loanDisplayKey`; `closeRebate` is the first. The correction preview gets the same.
- `apps/pwa/src/PaymentRecord.tsx`: one `close-rebate-line` per rebate (English and Thai); falls back to `closeRebate`.
- `database/migrations/V134__notify_every_rebate.sql` (functions only): `pwa_notify_content_v4` is v3 plus a last column `rebates jsonb`, every rebate of the event as `[{amount, payee, payable}]`. Owner, SECURITY DEFINER, configuration, comment and EXECUTE grantees copy v3 (`mw_notify_owner_<env>`; EXECUTE only for `mw_notify_dispatch_<env>`). v1 to v3 are unchanged. Preflight, a "before" table and a self-check follow V124 and V131. `database/current/public-functions.sql` regenerated; `services/chat/assets/schema-digest.json` moves to 134.
- `services/notifications/dispatcher.mjs` and `content.mjs`: v4 to v1 fallback; payable rebates summed per referrer; one referrer keeps the single-rebate wording.
- Agent: `config.py`, `conversation_poll.py`, `receipt_recheck.py` (new), `receipt_reconsider.py`, catalogue revision 35, `deploy-runtime.py` (see the agent note).
- Tests: `tests/unit/payment-close-rebate-read.test.mjs`, `notification-content.test.mjs`, `notifications.test.mjs`, `pinned-ux-read-independent.test.mjs`; `tests/integration/rebate-offset-independent.test.mjs`; `tests/e2e/rebate-offset-independent.spec.ts` (two-rebate case); `scripts/database/Test-RebateOffset.sql` (two-loan case, rebates 30 and 20), `Test-LateCharges.sql` (v4 equals v3 apart from `rebates`), `Test-AccessMatrix.sql`; agent tests listed in the agent note.
- Docs: Release Tracker, Development Changes, Solution Design, `database/README.md`, agent `CONVERSATION_POLL.md`, `OPERATIONS.md`, `PARTNER_REVIEW.md`, `RECEIPTS.md`, the service catalogue.

UX codes (Echo, accepted by the owner's instruction):
| Code | Decision |
| --- | --- |
| PR-1 | Two or more rebate lines on the payment record are each prefixed with the closed loan's key, as the allocations show it (`Loan <key> closed · rebate …`; Thai `ปิดสินเชื่อ <key> แล้ว · …`). A single line is unchanged. |
| PR-2 | The lines follow the Payment Allocations order, then the loan id. |
| PUSH-1 | The push sums the payable parts per referrer (exact, in satang); only payable (above 0) parts count. One referrer keeps today's wording with the sum. |
| PUSH-2 | Two or more referrers share one line: `Rebates 30 to A and 20 to B, transfer from Lisa` (three or more: commas, then "and"). |
| PUSH-3 | Thai joins with `และ`: `ค่าแนะนำ 30 ให้ A และ 20 ให้ B โอนจาก Lisa`. |
| PUSH-4 | Length budget: amounts and "Lisa" are never cut; the borrower name is shortened first, then every payee to one equal length of at least 6, and if it still does not fit the line collapses to a total (`Rebates 50 total to 2 referrers, transfer from Lisa`; Thai `ค่าแนะนำรวม 50 ให้ผู้แนะนำ 2 ราย โอนจาก Lisa`). |

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` and the type check | Pass (Byte, working tree) |
| `npm test` | 1136 pass (Byte, working tree) |
| `ruff check --no-cache integration-agent` | Clean (Byte) |
| `PYTHONPATH=src python3 -m unittest tests.test_conversation_poll tests.test_receipt_reconsider tests.test_receipt_prepare tests.test_receipt_recheck` (in `integration-agent/`) | 51 tests OK (Byte) |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 738 tests OK (Byte) |
| `python scripts/database/Test-MigrationsCloud.py --sql scripts/database/Test-RebateOffset.sql` | Pass; the chain migrates to V134 (Byte) |
| `python scripts/database/Test-MigrationsCloud.py --sql scripts/database/Test-LateCharges.sql` | Pass; v4 equals v3 apart from `rebates` (Byte) |
| `python scripts/database/Test-MigrationsCloud.py` (default batch) | Pass at schema 134 (Byte) |
| Schema digest test | Pass at 134 (Byte) |
| Integration test `tests/integration/rebate-offset-independent.test.mjs` | 14/14 (Byte) |
| E2E desktop `tests/e2e/rebate-offset-independent.spec.ts` | 15/15 (Byte) |
| `tests/integration/rebate-offset-independent.test.mjs` on a fresh V134 cluster | 15/15 (Chase); includes his new test that the lines follow the Payment Allocations order, which fails when the ordering is put back to Row ID |
| `tests/e2e/rebate-offset-independent.spec.ts --project=mobile-chromium` | 15/15 (Chase, Pixel 7) |
| Probe of `renderNotification` over 800 combinations | Nothing over the 80-grapheme budget; "Lisa" always present; every amount present unless the total form was used (Chase) |
| Agent: conversation_poll tests; `receipt_reconsider`, `receipt_recheck`, `deploy_runtime` tests; `ruff` | conversation_poll 43 OK with 2 new (an ambiguous time match is left alone; the snapshot is kept when a scan raises); the others and ruff pass (Chase) |
| Chase review (adversarial, against Archie's test plan) | Done: no high-severity defect. One medium finding, fixed by Byte: the dispatcher's v4 to v3 fallback happens only on SQLSTATE 42883 or 42501, so another error no longer quietly shows only the first rebate (re-run pending, record with CI) |
| Pull request `Development checks` and agent CI (`test`, `lab`) | Pending: record the run and commit |
| `npm run check:docs` | Pending: record the result at the push |
| DEV: V134 applied, images, Hosting, agent, bounded smoke test | Pending (Forge) |
| PROD promotion record | Pending (Forge): backup at V133, V134 apply, images, Hosting, agent revision 35, switch activation, read-only smoke test, tag `R119` |

## Not run
- Live push on a device and the agent against live Instagram: not exercised before PROD. The first live evidence is the first PROD payment that closes two referred loans and the first borrower-master change after activation.
- A 320 px layout check, WebKit, and a real Instagram or PROD recheck.
- No PROD payment, forced notification or financial correction is part of the promotion.

## Recovery
- Before deployment: revert the commit. After deployment:
  - V134 adds only a function; dispatchers before R119 read v3, and a later migration may drop v4. The old PWA bundle reads `closeRebate`.
  - Agent: set `conversation_poll_recheck_enabled` to false (restore the saved configuration backup), or `deploy-runtime.py rollback --commit <deployed>`.
  - Database backup reference: to be recorded in the promotion record (taken at V133 before the PROD apply).

## Open questions
None. Known limitations, accepted:
- The schema digest moves to 134, which starts a new chat history epoch (as at 133).
- The ignored-slip match tolerates a Meta time skew up to 5 seconds; a larger skew misses the match, and that slip then stays ignored.
- The held-slip recheck needs `receipt_archive_enabled`, because the worker reads the archived original again; a hold with no archived image is skipped.
- A slip whose message id changed, with another message from the group within 5 seconds, is skipped as ambiguous and stays ignored.
- Re-enabling a borrower replays their ignored slips from yesterday and today (intended).
- On a run where the master changed, `receipt-worker.lock` is held for the whole scan, so the worker skips that minute.
- The push lists payees in expense Row ID order, while the payment record follows allocation order.
- A held job with no archived original is counted as `held_skipped_no_archive` and retried on the next master change.
- The switch `conversation_poll_recheck_enabled` is off until it is activated after the deploy (covered by "take R119 all the way to PROD").

## Remaining work
the Chase fix re-run, the push and CI, DEV, PROD promotion, activation of the recheck switch, the PROD Data Dictionary capture for `pwa_notify_content_v4` (and v3), and the closure pull request (freeze pin, promotion record, tag `R119`, prune, R120 opened).
