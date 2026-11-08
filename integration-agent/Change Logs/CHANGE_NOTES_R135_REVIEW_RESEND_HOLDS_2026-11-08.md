# Change notes — review command lists held receipts, 8 November 2026

## Purpose
Owner request, 8 November 2026 (Asia/Bangkok): "I want the 'review' command to bring everything pending into the review list again, so I can review and approve/reject them one by one." Owner decision: held receipts are Reject-only; a genuine payment is recorded in the app by the reviewer. Read-only evidence on 8 November: one hold (`IG_CONVERSATION_IDENTITY_AMBIGUOUS`, held 29 October 01:22) never appeared in `review`; the owner's `review` commands of 6 November 15:56 and 8 November 16:08 and 18:22 were processed (`RESEND_QUEUED`) and the "no pending requests" acknowledgement was accepted by IG each time. The owner then rejected the hold (`HOLD_REJECTED`); the held count is 0.

## Changes
- `review` / `reviews` / `resend review` (standalone, signed, reviewer; authorization and cutoffs unchanged) now resend pending unexpired proposals and every active validation hold (`receipt_jobs` in `REVIEW`, no age limit; a hold whose job has a live or decided proposal is skipped), oldest first, first line prefixed `i/N · `; a resent hold starts `Still held since <date> (<n> days)`.
- Hold copy key `<receipt-held key>:resend:<sha256 of the command message id>`; `receipt_hold.base_key` makes hold reply, the dispatch guard and monitoring treat it as the same hold (Reject on either copy works once; monitoring counts it delivered without resetting age). Archive-pending alerts and decided results are not resent.
- Acknowledgement `Review list: N payment requests · M held receipts…` (English and Thai), `More follow over the next few minutes` above six notices (notify cap 6 per pass), and `Nothing is waiting for review: no payment requests and no held receipts.`
- Hold message closing block: cannot be approved here; record a genuine payment in the app; reply Reject to clear. New `HOLD_REJECTED` and `HOLD_REJECT_REQUIRED` texts. 14 missing hold reason codes get English and Thai wording; clearer fallback.
- Deviations from the design (Byte): holds are resent only when the existing `receipt_hold_notice_cutoff` is set; a hold must exist when the command was sent (`created_at` not after the command's event time); resent holds share the request priority and go out in counter order; the `i/N · ` counter is dropped on a copy that would exceed 1000 characters; the age reads `1 day` singular and `(0 days)` on the same day; `REASONS` is now a module-level table; a malformed `:resend:` suffix fails closed.
- Source (`integration-agent/src/mw_integration_agent/`): `receipt_hold.py`, `review_resend.py`, `hold_reply.py`, `review_cycle.py`, `receipt_health.py`. Tests (`integration-agent/tests/`): `test_review_resend.py`, `test_hold_reply.py`, `test_review_cycle.py`, `test_receipt_health.py`, `test_payer_resolution.py`.
- Docs: `integration-agent/docs/PARTNER_REVIEW.md` (resend section, hold rejection, held alerts), `integration-agent/SERVICE_CATALOGUE.md` (revision 24 line pointer; revision number stays 36, no service or switch change), `project/Documents/Release_Tracker.md` (R135 scope).
- No schema, configuration switch, infrastructure or PWA change. Forge: not applicable.

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache integration-agent` (ruff 0.16.8) | Pass (Byte) |
| Unit tests of the six affected modules (Byte) | 186 tests OK |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`, Byte) | 813 tests OK, 70 skipped (PostgreSQL lab suites) |
| `npm run check:docs` | 0 failures (Dewey) |
| Chase: 5 affected modules rerun, plus adversarial SQLite probes (authorization, crafted `:resend:` keys, changed reason, double dismissal, replay, monitoring counts, ordering) | 153 tests OK; no defects |
| Pull request `Development checks` (the broad run) | Runs when a pull request is opened for this branch |

## Not run
- A live Instagram send of the resent items: not run; it needs the agent deploy. The background evidence (the held job and the three acknowledged `review` commands) came from read-only `mw_agent` queries as `codex-cloud-read`.

## Known limitations (Chase, non-blocking)
- A delivered resent copy counts as the hold's alert, so a failed original alert stops counting in `unnotified_holds` once a copy is accepted.
- If a command is interrupted and the pending set changes before recovery, later copies get a recomputed `i/N`; a copy whose counter was dropped sorts first in its group. Cosmetic and rare.
- With every extracted field at its 100-character cap, some English hold bodies exceed 1000 characters and are refused as `NOTICE_TOO_LONG`, as before; the Reject-only closing block is about 75 characters longer than the old text. Realistic slips stay under 900.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Resent hold copies already delivered stay in the journal; rejecting a hold is the existing REVIEW to REJECTED transition and is not undone.

## Open questions
None. Activation is the normal agent deploy, to be authorized separately by the owner.

## Remaining work
Owner acceptance: a read-only check that the owner's next `review` lists any active holds (the live acceptance; the held count was 0 at deploy).

## DEV promotion record (Forge, 8 November 2026, UTC)
There is no DEV agent, so no agent code was deployed for DEV. Evidence before PROD: the checks above and the pull request's `Development checks` run 42484565073 and Agent tests run 42484565050, both green.

## PROD promotion record (Forge, 8 November 2026, UTC)
Authority: the owner's instruction "open the PR and deploy to prod" (8 November 2026) for R135. Target verified before any change: project `clever-oasis-508610-n7`, `vm-mw-credit-agent` (`asia-southeast1-a`, service account `mw-integration-agent@`), Cloud SQL proxy to `mw-credit-pg-20261017`, agent database `mw_agent`. Access from the Claude Code cloud session: `mw-debian-ssh` (IAP SSH as `codex-cloud`, pinned host key); VM-01 was not used. No secret value appears here.

| Step | Result |
| --- | --- |
| Package | `246bcb93b653790291a11989b21a516fcd9a3f12` (merge of PR #269; agent tree equal to `8a04b37`) |
| Baseline | Live `0f34203` (R129), checkout clean on `main`, `/ready` true, `check` ok, catalogue revision 36, 0 failed units; `review_resend_cutoff`, `receipt_hold_reply_cutoff` and `receipt_hold_notice_cutoff` present and set (names only read) |
| Update | `update-from-github.sh` fast-forwarded `0f34203` to `246bcb93` |
| Dry run | Changed modules `hold_reply.py`, `receipt_health.py`, `receipt_hold.py`, `review_cycle.py`, `review_resend.py` only; no extras or missing files; all units unchanged; ancestry `ancestor`; agent schema check ok (shipped and applied through V11, no drift) |
| Freeze | 13:26:21Z to 13:26:26Z; rollback directory `runtime-20261108T132625515112Z`, metadata sha256 `f37d80f74d5f187e12edf4a962a6b81cc676a50891ed04f6b2ecf1ee8d915e37` |
| Install | 13:26:28Z to 13:26:37Z; no file removed, no unit changed |
| Activate | 13:26:40Z to 13:26:48Z, probe `771ffc4e-c64d-4811-aa27-3b1ea7cdb30b`; six timers and the wake path resumed |
| Readback | `/ready` true on `246bcb93` (started 13:26:46Z, `failed` empty); `check` ok, switches unchanged (`loan_close_execution` and `pay_forward_options` true, `generic_sending`, `processing` and `writes` false); configuration 92 keys; catalogue revision 36; webhook, recognizer, wake path and chat relay active; 0 failed units; 11 receipt cycles to 13:32:36Z with empty `failures` and `notification_failures`; 5 conversation-poll runs; no error-priority or `ERROR` log line from `mw-*` units since 13:26:21Z |
| Access | The engine's schema check needed an `mw_agent` operator connection file, as in R127 and R128: a temporary root-only folder `/root/r135-op` (`postgres` through the 5432 proxy, password piped on stdin from Secret Manager into a 0600 file, never printed), shredded 13:26:57Z |
| Not deployed | SQL on `mw_agent`, migrations, units, configuration, catalogue |
| Rollback | `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 246bcb93b653790291a11989b21a516fcd9a3f12` (restores `0f34203` from `runtime-20261108T132625515112Z`; it needs the same temporary connection file; no configuration change to undo) |

Observation, not caused by this deploy: one `mw-conversation-poll.service` start failure at 09:58:18Z, before the deploy window; the poll ran cleanly after activation. Limitations: the resend of held receipts was not exercised live (no active hold at deploy); the owner's next `review` is the acceptance.

### Tag record
Annotated tag `R135` on `246bcb93` through the Release tag workflow run 42485542863 (success, 13:33:57Z; tag object `05ef2c5`), which also published the GitHub Release.

### Closure notes
- Limitation: live acceptance is open (the owner's next `review` listing an active hold); 0 holds were active at deploy, so the hold resend was proven by tests only.
- Session reads: read-only `mw_agent` reads through `codex-cloud-read` on 8 November 2026 (journal and held-job counts, sanitized) gave the background evidence; no PROD write, forced notification or financial action was made. The only write was the shredded temporary operator connection file recorded above.

### Prune (closure)
Deleted after repointing every inbound link to commit `246bcb9` (the last commit where it exists): `Change Logs/CHANGE_NOTES_R132_FAST_SAVED_STARTUP_2026-11-06.md` (R132 left the three-release window of R135, R134 and R133). Development Changes holds no R135 row. R133, R134, the non-release notes and the evidence cited by the Data Dictionary stay.
