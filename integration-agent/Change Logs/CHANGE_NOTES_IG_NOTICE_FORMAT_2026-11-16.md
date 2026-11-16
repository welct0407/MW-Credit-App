# Change notes — partner notice amount and Payment ID, 16 November 2026

## Purpose
Owner request, 16 November 2026: in the Instagram message, remove the decimals and the payment ID, because the ID means nothing to the reader.

## Changes
- `partner_notice.py`: new `notice_amount` (whole baht without decimals, separators kept; satang kept exactly, never rounded). `receipt_notice`: every notice body (Payment processed, Payment receipt received, Loan closed; English and Thai; the email fallback reuses the body) shows the amount without ".00" (thousands separator kept, for example `1,100 baht`; non-zero satang kept, for example `800.50`; never rounded) and no longer has the Payment ID / รายการชำระเงิน line. A payment ID still selects the "processed" subject.
- `partner_review.py` (`compose_request`, the payment approval request, and `close_request_text`, the loan close approval request): English and Thai use `notice_amount`.
- `review_cycle.py` (lines 211-212): the "Rechecking slip" / "ตรวจสลิปใหม่" IG notice shows the amount through `notice_amount` ("฿1,500").
- Tests: `test_review_cycle_options.py` (line 213 asserts ' ฿1,500\n'), `test_partner_notice.py`, `test_review_close.py`, `test_partner_review.py` (line 116, 450.00 to 450).
- Docs: `docs/RECEIPTS.md` (notice content and approval requests), `scripts/generate-business-process.py` and the generated `docs/BUSINESS_PROCESS.drawio` (processed template line), `project/Documents/Release_Tracker.md` (R164 scope).
- No schema, catalogue, infrastructure, financial write or deployment. The change is live only after a separate owner-authorized agent deployment.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest tests.test_partner_notice tests.test_review_close tests.test_partner_review` (in `integration-agent/`, `PYTHONPATH=src`, venv from `requirements.lock`) | 73 tests OK |
| `python -m unittest discover -s tests` (same venv) | 985 tests OK, 76 skipped |
| `ruff check src tests` | Passed |
| `npm run check:docs` | 0 failures, 0 warnings |
| Chase review (adversarial diff review) | Passed: no Payment ID printed anywhere in src; no import cycle (`partner_review`, `partner_notice`, `review_cycle`, `receipt_rules` import cleanly); `notice_amount` edge cases (exponent forms, negatives, 0, satang 800.5 to 800.50, 800.505 kept exactly). Found the recheck notice, since fixed |
| `python -m unittest discover -s tests -p 'test_review_cycle*.py'` (Byte re-run) | 102 tests OK |
| `ruff check` on the two changed files (Byte re-run) | Passed |
| Pull request `Development checks` (the one broad run) | Run 43873471189 success (PWA stages skipped as unaffected), head `36ee968` |
| Integration-agent workflow `test` and `lab` | Run 43873470973 success, head `36ee968` |

## Not run
- No deployment; the live effect needs an owner-authorized agent deployment.

## Recovery
Before deployment: revert the commit. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Notices already sent are not changed.

## Known limitations
- The email receipt summary (`receipt_rules.summary`) still shows two decimals; it is email, not IG, and outside the ask.
- `partner_review.baht()` still rounds the ฿ option and closing lines (pre-existing; close quotes are whole baht).

## Open questions
None.

## Remaining work
None for the deployment (applied to PROD, see below); owner acceptance on the next real notice.

## PROD promotion record (Forge, 16 November 2026 UTC)
Authority: owner instruction of 16 November 2026 13:12Z on PR #339, "move all the way to prod" (R164 = PR #339 only), and at 13:18:56Z "move to production" for the temporary operator connection file below. Package `d10a445ee4301a3ffed407f836255f4456a33b53` (merge of PR #339, head `36ee9689`); baseline R153 `025e8a51`. Target `vm-mw-credit-agent` (project `clever-oasis-508610-n7`, zone `asia-southeast1-a`), the only agent runtime (no DEV agent). No SQL, no agent migration (shipped through V13, applied), so no `mw_agent` backup; no catalogue, unit, image, Hosting or Terraform change.

| Step | Result |
| --- | --- |
| CI | `Development checks` run 43873471189 and integration-agent `test` and `lab` run 43873470973 green on the head |
| Checkout | `update-from-github.sh` fast-forwarded `/opt/mw-integration-agent-src` from `025e8a51` to `d10a445e` (clean); dry-run 13:15Z passed |
| Notices in flight | 0 open `runtime.partner_notices` rows (IG `PENDING`/`WINDOW_EXPIRED` with email not finished) at 13:15:50Z and again at 13:19:33Z, so no queued notice could hit `NOTICE_CONTENT_CHANGED` |
| Access | The engine's schema check needed an `mw_agent` operator connection file (as R094, R127, R128, R135): temporary root-only `/root/r164-op` (`postgres` through the 5432 proxy to `mw-credit-pg-20261017`, password on stdin from Secret Manager, never printed), created 13:19:20Z, shredded 13:20:17Z |
| Freeze | `deploy-runtime.py freeze --commit d10a445e… --release R164` 13:19:38Z: rollback `/var/lib/mw-integration-agent/rollback/runtime-20261116T131938411659Z`, metadata sha256 `beee5924c8916e12a61aa89deb533e30c383d1272711f4cf3a3b6a844f577ac2`, ancestry `ancestor`; 7 timers and paths paused |
| Install | 13:19:46Z to 13:19:55Z with `--state-connection-file`: no removed files, no unit change |
| Activate | 13:19:55Z to 13:20:04Z, probe `24c972e5-6d21-4051-a694-e7bb2c06818c`; receiver restarted 13:20:02Z, recognizer restarted; the 7 timers and paths resumed |
| Chat relay | The engine does not restart `mw-chat-relay` (it still served R153 from 14 November); restarted 13:20:57Z, `/healthz` ok R164 (as R152) |

Verification: `/ready` true, `failed` empty, release R164, commit `d10a445e…`; recognizer and chat relay `/healthz` ok, `enabled` true, R164 `d10a445e…`; configuration `code_version` `d10a445e…`, `code_release` R164; `check` (as `mwagent`, with the catalogue) exit 0; catalogue revision 38 unchanged; all 10 agent timers and the receiver, recognizer and relay active; no relay error in the journal. Read-only render with the deployed venv on synthetic data (no send): English processed `Amount: 1,100 baht` and no Payment ID line; Thai received `จำนวน: 1,100 บาท`; `800.50` kept. No `--mark-all`, no forced notice, no financial write.

Rollback: `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 025e8a510534acf556a140898bb69d12ad9b4fe5` (restores R153 from the freeze backup; the R135 record notes it may need the same temporary connection file), then restart `mw-chat-relay`. Notices already sent are not changed.

## Tag record
Annotated tag `R164` on `d10a445ee4301a3ffed407f836255f4456a33b53` (merge of PR #339), created by the Release tag workflow, run [43875057920](https://github.com/welct0407/MW-Credit-App/actions/runs/43875057920) (success, 16 November 2026 13:22Z). Closure: component versions rendered at R164 (integration agent changed, revision 38 unchanged); pruned the R161 change note (outside the retention window), with its links repointed to commit `d10a445e`.
Drift (`drift --env prod`, GET only, run after the tag): drift 0; the agent line (R164) and six other credentialed facts are unverified because no `--observed` file was supplied. The agent's R164 is verified by the promotion record above (`/ready`, `/healthz`).
