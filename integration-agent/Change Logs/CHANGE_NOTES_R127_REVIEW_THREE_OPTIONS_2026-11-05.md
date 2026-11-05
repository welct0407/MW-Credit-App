# Change notes — three options on pay-forward reviews, 5 November 2026

## Purpose
Owner instruction, 5 November 2026: "Update the 3 options … Engage the team, test it and promote to prod." The pay-forward options DM (R112, with the R119-era recheck added on 3 November) offers four choices. The owner wants three: pay forward unchanged, repay principal with the interest and principal split spelled out, and recheck. This is release R127, agent code only .

## Changes
- Request (`review_proposal.py`, `partner_review.py`; Echo AG-6 to AG-12): three options with fixed numbering, an unavailable choice omitted and never renumbered.
  - `1` pay forward, unchanged.
  - `2` repay principal as `2 interest ฿X + principal ฿Y (new interest ฿Z/day)`; X is the interest accrued since the last charge (remainder minus the principal amount) and is omitted when 0. Several loans: one `2 n <loanKey>: …` line each.
  - `3` recheck after editing charges in the app (was `4`). Split (`3 <amount>`) is removed. The settle case is unchanged.
  - `Due today ฿N is paid first.` with the R118 breakdown (`Due today ฿0.` when nothing is due; Thai `หักยอดครบกำหนดวันนี้ ฿N (…) ก่อน`). With several loans the opening line names only loans not already on a `2 n` line (1000-character budget).
- Replies: `1`; `2` and `2 n`; `3`, `recheck`, `ตรวจใหม่` and the legacy `4` (to be removed later) recheck. `3 <anything>`, `4 n` and any other reply is `OPTIONS_REQUIRED`, with a re-send whose prompt is built from the offered choices (`Reply 1, 2 or 3.` / `ตอบ 1, 2 หรือ 3`).
- Posted notice for option 2: `Recorded ฿950 · interest ฿90 + principal ฿410, new interest ฿53/day`. A split approved before the deploy still posts with the R112 wording (legacy path kept; the database and shared API split purpose are unchanged and still reachable).
- `review_cycle.py`: wording and numbering only. No SQL, stored-proposal, PWA chat card, catalogue, configuration or infrastructure change.
- Owner decision, 5 November 2026, after the Ai ฿950 slip: the owner saw ฿53 against an expected ฿45. The ฿53 is one day of accrued interest at the old rate, which option 2 now shows.
- Docs: `docs/PARTNER_REVIEW.md` (Request, Reply, Result, Recheck), `SERVICE_CATALOGUE.md` (revision 34 paragraph and `partner_receipt_review` row; revision stays 35, the JSON is unchanged), `project/Documents/Solution_Design.md` (R112 paragraph), Release Tracker and Development Changes (R127 rows).

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache integration-agent` (Byte) | Clean |
| `PYTHONPATH=src python3 -m unittest discover -s tests` in `integration-agent/` (Byte, uncommitted tree on base `c00bd53`) | 753 OK, 70 skipped |
| Chase review (diff against Archie's plan; parser, request-text, worst-case length EN 920 / TH 904, posted-notice probes; SQL source read of `pwa_pay_forward_plan_v1` confirming interest + principal = remainder) | Pass, no defects. Note: a bare `3` on a request sent before deploy now rechecks (harmless: posts nothing) |
| Agent CI `test` and `lab` on PR #247 head `80cde8a` | Pass: run 41961071025; `Development checks` success |
| `npm run check:docs` (Dewey) | Pass |

## Not run
Live Instagram: there is no DEV agent, so the first real options exchange in PROD is the acceptance. A skipped check is not a pass.

## Recovery
Revert the commit of PR #247 (baseline `c00bd53`); on the VM `deploy-runtime.py rollback --commit ebc1e3e8e14f9593405a57b4800bf4e4fed3c786` restores `b83bf3a` from the freeze directory. Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime from the freeze directory. Reviews already sent keep their old wording and numbers until they expire or are decided; a reply to one of them is read by the new parser.

## Open questions
None. An old request that offered `4 recheck` still works: `4` stays a legacy alias until removed later.

## Remaining work
- Owner acceptance in PROD: the first real options exchange.
- Remove the legacy `4` recheck alias in a later release.

## DEV promotion record
There is no DEV agent. Evidence: agent CI `test` and `lab` (run 41961071025 on `80cde8a`), Byte's unit tests (753 OK, 70 skipped) and Chase's review.

## PROD promotion record (Forge, 5 November 2026, UTC)
Authority: the owner's instruction "Engage the team, test it and promote to prod". Target: project `clever-oasis-508610-n7`, `vm-mw-credit-agent` (`asia-southeast1-a`). No secret value or borrower data appears here.

| Step | Result |
| --- | --- |
| Freeze | Package `ebc1e3e8e14f9593405a57b4800bf4e4fed3c786` (merge of PR #247; checks green on head `80cde8a`). Next unused number R128 |
| Baseline (03:25:50Z) | Checkout and live `code_version` `b83bf3aa31f9b9803dcd4a1f503ec07725395b78`; `/ready` true; `check` ok with `pay_forward_options` true; catalogue revision 35; 0 PENDING reviews |
| SQL | None; agent schema through V11, no drift |
| Checkout and dry run | `update-from-github.sh` fast-forward to `ebc1e3e`; 3 changed modules, no unit changes |
| Freeze | 03:26:58Z to 03:27:07Z; rollback `/var/lib/mw-integration-agent/rollback/runtime-20261105T032658507505Z` (metadata sha256 `de6a4d574bfb5ba8b49fcb52d1a88aeeb9d99698a1ab94cb05bd8bd3bd596308`) |
| Install | 03:27:23Z to 03:27:29Z; schema check passed |
| Activate | 03:27:36Z to 03:27:40Z, probe `6739db49-87d6-4a50-8a2b-7a1aaa0d2b75`; receiver restarted; six triggers resumed |
| Readback (03:27:55Z) | `/ready` true on `ebc1e3e`; `check` ok; sending and writes false; catalogue revision 35 |
| Smoke (to 03:30:55Z) | 7 receipt cycles with `failures` [] and `notification_failures` []; no error journal; no failed units; monitor `webhook_code_version` `ebc1e3e`. No forced DM or payment |
| Not deployed | SQL, migration, configuration, units, Cloud Run, Hosting, Terraform, PWA |
| Rollback | `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit ebc1e3e8e14f9593405a57b4800bf4e4fed3c786` restores `b83bf3a` |

Deviation, as on 3 November and in R094: the deploy engine needed an `mw_agent` operator connection file. A temporary root-only file in `/root/r127-op` (`postgres` through the 5432 proxy, password on stdin from Secret Manager, never printed) was created and shredded at 03:27:46Z.

### Limitations
- Live Instagram was not exercised; the first real options exchange is the acceptance.

### Tag record
Tag `R127` on `ebc1e3e8e14f9593405a57b4800bf4e4fed3c786` (annotated tag object `9eb7f8a012bde1e5a8cc48ca5f90c2aba16651e3`) through Release tag workflow run 41962166184, with the GitHub Release published by the same run.

### Closure and prune record
Closure pull request, records only: tracker (R127 Released, R128 opened, next unused number R129), Development Changes, Environment Inventory (agent commit and header) and this note.
- Deleted: `Change Logs/CHANGE_NOTES_R124_DCW_WHEN_LAYOUT_2026-11-05.md` (R124 left the three-release window). Its inbound links were first repointed to the permalink at `ebc1e3e`.
- Kept: the R125 and R126 notes (inside the window).
