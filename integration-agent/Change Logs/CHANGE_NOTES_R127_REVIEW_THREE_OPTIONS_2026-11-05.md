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
| Agent CI `test` and `lab` on the pull request | Pending |
| `npm run check:docs` (Dewey) | Pass |

## Not run
Live Instagram: there is no DEV agent, so the first real options exchange in PROD is the acceptance. A skipped check is not a pass.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime from the freeze directory. Reviews already sent keep their old wording and numbers until they expire or are decided; a reply to one of them is read by the new parser.

## Open questions
None. An old request that offered `4 recheck` still works: `4` stays a legacy alias until removed later.

## Remaining work
- Merge, then Forge deploys the merge commit to `vm-mw-credit-agent` (no unmerged head install); tag `R127`; closure pull request with the deployment, promotion, tag and prune records and the Environment Inventory agent row.
- Remove the legacy `4` alias in a later release.
