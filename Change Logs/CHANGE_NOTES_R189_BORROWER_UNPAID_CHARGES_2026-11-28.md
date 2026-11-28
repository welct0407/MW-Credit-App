# Change notes — R189 Borrower details unpaid charges, 28 November 2026

## Purpose
Owner request of 28 November 2026 (verbatim): "In borrowers details page, under Active Loans section, add two more items: If all loans of this borrower have auto charge disabled, show the current unpaid charges and total outstanding unpaid charges, including current and future ones. Engage the team to work on it. Push to production." Status: Open, in development; not deployed.

Production instruction: the owner, 28 November 2026: "Push to production". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. Deploy set (confirmed by Forge): a new image for the read, command and chat Cloud Run services (`borrowers.mjs` reaches all three through `genericRoleClosures`; the Terraform plan is expected to show 0 to add, 3 to change, 0 to destroy, image only, as in R187) and PWA Hosting, DEV first and then PROD through `deploy-business-hosting.mjs`. Notify, jobs and the agent stay on their pins. No SQL (Flyway stays at 155), so no backup. The chat schema digest and the command catalogue are unaffected. No Terraform file, IAM, secret or network change.

Team: Archie (design), Byte (implementation), Echo (UX review), Chase (review), Dewey (records), Forge (deployment).

## Changes
Baseline `9cba809` (branch `claude/jolly-faraday-vqx3xa`, R188 closed). Scope:
- New borrower details keys `unpaidChargesCurrent` and `unpaidChargesTotal`, from inline read-only SQL (`services/business/borrowers.mjs`); no migration, table or column.
- Shown only when the borrower has at least one open loan ("Loan Status" = 'ยังไม่ปิดยอด', defaulted-open included) and every open loan has Auto Charge Enabled off (NULL counts as off); otherwise both keys are null and the rows are hidden. A value of ฿0 is shown.
- Current Unpaid Charges = Σ "Amount Remaining" of recorded charges dated on or before the Bangkok business day on those loans. Total Unpaid Charges incl. Future = all unpaid recorded charges, future-dated and late charges included. No projected rows. The query also excludes `df10:` default-posting charges, as `services/business/loans.mjs` does; their remaining is 0, so the totals do not change. Charges of closed loans are excluded (reading of the request).
- Rows sit straight after Outstanding Principal under Active Loans: "Current Unpaid Charges" / "ยอดเรียกเก็บค้างชำระปัจจุบัน" and "Total Unpaid Charges incl. Future" / "ยอดเรียกเก็บค้างชำระรวมงวดอนาคต" (`apps/pwa/src/live/BorrowerRecord.tsx`).
- Offline viewed copies carry both keys (`viewed-snapshot.ts`, `OfflineViewedRecord.tsx`, offline delta); offline "current" is as of the last sync. No offline delta fix was needed; the offline dataset shape version is unchanged.
- Known limitation: a cached record shows the rows only once that borrower changes or the day rolls over; online viewing shows them at once.
- Echo findings, all adopted:
  - BRD-UX-01 Labels: the amounts use the existing ยอดเรียกเก็บค้างชำระ wording (`rollover-statement.ts`), not ค่างวด, in Title Case. "incl. Future" separates Total from Current and avoids reusing "Outstanding". Archie's alternative Thai labels are not used.
  - BRD-UX-02 Position: straight after Outstanding Principal, before the earnings rows.
  - BRD-UX-03 Format: whole baht through `display()`/`wholeBaht`, key names not ending in Return, plain `<strong>` without profit colour.
  - BRD-UX-04 Zero and visibility: ฿0 shows when the rows are shown; both rows are hidden, with no placeholder, when any open loan has Auto Charge on.
- Records (Dewey): [Solution design](../project/Documents/Solution_Design.md) R189 clause. Checked and unchanged: the chat asset `services/chat/assets/conversation-business-rules.md` (it documents no borrower details fields, so the chat digest does not change), the PWA data model, the Data Dictionary (no schema change) and the Release tracker (R189 row changes at closure).

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | `npm run lint` | Pass (1 warning and 1 info, both in untouched files) | uncommitted tree on `9cba809` |
| Byte | `npm run typecheck` | Pass | uncommitted tree on `9cba809` |
| Byte | `node --test tests/unit/viewed-snapshot.test.mjs tests/unit/expense-display-read.test.mjs` | 16/16 pass | uncommitted tree on `9cba809` |
| Byte | `tests/integration/phase5-borrower-independent.test.mjs` on a disposable PostgreSQL at V96 plus the V114 views | 13/13 pass | uncommitted tree on `9cba809` |
| Chase | Adversarial review | Pass, no defects found | uncommitted tree on `9cba809` |
| Chase | Late-charge proof: `scripts/database/Test-MigrationsCloud.py --sql-only` as postgres on a disposable PostgreSQL at the migration head, rolled back. Interest 10 plus late charge 50 gives Amount Remaining 60.00; two manual loans with charges of 60 and 105 due and 10 in the future give current 165.00 and total 175.00; an open manual loan with no charges gives 0.00 / 0.00; mixed auto and manual loans give null; no open loan gives null; a NULL flag counts as manual | Pass | uncommitted tree on `9cba809` |

## Not run
- Echo's iPhone visual check of the built change is still to come.
- The Bangkok 17:00 UTC rollover: only today and tomorrow were checked in Asia/Bangkok.
- The `df10:` exclusion: code review only.
- Performance: the query is indexed and reads a single borrower.
- E2E: the only affected spec, `tests/e2e/phase5-borrower-independent.spec.ts`, mocks borrower details without the new keys, so the rows stay hidden and nothing changes.

## Recovery
Git baseline `9cba809` (R188 closed). Revert the batch to restore the previous borrower details page. No SQL, no backup expected.

## Open questions
- Owner acceptance of R189 in PROD, written into the next release's closure or product pull request.

## Remaining work
Implementation, checks, the pull request and its Development checks, the merge, the DEV deploy, the PROD promotion, the R189 tag and the closure pull request.

## DEV deployment record
To be filled by Forge.

## PROD promotion record
To be filled by Forge.
