# Change Notes — Data Studio Workspace Migration

## Change summary

- **Date:** 2026-09-04
- **Scope:** Looker Studio report `Loan Reports - Mobile` and its seven reusable AppSheet data sources.
- **Purpose:** Migrate report ownership, data-source ownership, and connector credentials from `welct0407@gmail.com` to `welct0407@mw-credit.com` while preserving the existing dashboard design and logic.
- **Status:** Migration implementation and browser validation complete; pending user manual acceptance and production cutover.

## Rollback point

- **Backup report:** `Loan Reports - Mobile - PRE MIGRATION BACKUP - 2026-09-04`
- **Backup report ID:** `23df8b07-1ecc-4546-88c6-1c70e9bc79df`
- **Source report:** `Loan Reports - Mobile`
- **Source report ID:** `c62727aa-a0fc-4c2a-9295-b46ebe1f82fc`
- **Backup/source owner:** `welct0407@gmail.com`
- The dated backup was created before source permissions, connections, or report mappings were changed.

## Implemented target

- **Migrated report:** `Loan Reports - Mobile - Workspace Migration 2026-09-04`
- **Migrated report ID:** `52954065-a261-4b97-8d19-df84126bbdc6`
- **Owner and connector credentials:** `welct0407@mw-credit.com` / `Welct MW Credit`
- The report was copied with an explicit old-to-Workspace mapping for every reusable data source.
- An automatically created, unused embedded Borrowers source (`0 charts`, `0 variables`) was removed after confirming that it had no consumers.
- The existing incomplete Workspace report with ID `d1b97d06-2f6d-41e3-aa07-16e95324c692` was not changed and is not the migrated deliverable.

## Data-source migration

The Workspace account was granted Editor access to each personal-account source so that its configuration could be inspected and reproduced. Each target source uses the Workspace-owned `Loan Business Insights` AppSheet app and Workspace credentials.

| Source | Personal source ID | Workspace source ID | AppSheet table | Target fields | Freshness | Report charts |
|---|---|---|---|---:|---|---:|
| Charges | `150b9de6-1cb9-4a9b-973d-17db1f9ed29f` | `0a5290f2-68a5-44e4-b40e-87247ecb5a94` | `Reporting Charges` | 20/20 | 15 minutes | 19 |
| Partners | `3bc5364c-fd8f-4186-95eb-97b3d6df8235` | `8c85897a-6d03-430c-a934-fd6f94724db9` | `Partners` | 14/14 | 15 minutes | 1 |
| Repayments | `46f9a5e0-7559-4386-a505-b5c09d2274db` | `680fe8eb-18dd-4a54-974d-c03ba187517a` | `Reporting Repayments` | 10/10 | 15 minutes | 22 |
| Daily Analytics | `602771ad-1799-4452-9b7a-06684275b11d` | `10241d2e-258b-443e-aaf3-0f02507eca24` | `Reporting Daily Analytics` | 15/15 | 1 hour | 12 |
| Statistics | `8c5ca4be-8c2f-4609-affb-6974568737c0` | `1f0e06e6-2702-404b-8d4e-25dc51167b91` | `Reporting Statistics` | 18/18 | 15 minutes | 26 |
| Loans | `aae57ad4-062a-4c89-b3e9-d24fc081329e` | `291321d0-4f61-47b2-8f0a-5c90721a2212` | `Reporting Loans` | 34/34 | 15 minutes | 39 |
| Borrowers | `f567b96d-0d88-4652-a0fa-0c7e85b6a639` | `068ce63a-14c8-4082-93d9-7b05f80b17a3` | `Reporting Borrowers` | 53/53 | 1 hour | 53 |

- All seven final entries displayed `Working` in **Manage added data sources**.
- The target names use the pattern `Loan Business Insights: <Source> - WS`.
- The existing Workspace-owned Borrowers source was reused and renamed instead of creating a duplicate.
- Reconnecting Loans detected two additive live AppSheet fields that were absent from the personal-source snapshot: `Daily Payment Amount` and `Expected Daily Interest Amount`. Both were added by the connector refresh; no AppSheet schema was changed in this task.

## Report compatibility repairs

- Preserved all eight pages, chart counts, report controls, styles, and four report blends.
- Verified the blends use only Workspace sources: `Borrowers - Loans - Charges - Repayments`, `Borrowers - Loans`, `Borrower Portfolio Share`, and `Borrower Profit Forecast`.
- Recreated the Borrowers parameter `Proposed Loan Amount` with field ID `proposed_loan_amount`, whole-number type, any-value input, and default `0`.
- Repaired `Borrower Portfolio Share` after the copied blend retained a missing source field. The reconstructed `Projected Portfolio Share` metric preserves the existing formula:

  ```text
  CASE
    WHEN Proposed Loan Amount > 0
    THEN (Total Outstanding Principal + Proposed Loan Amount)
         / (Portfolio Outstanding Principal + Proposed Loan Amount)
    ELSE NULL
  END
  ```

- Repaired the `Proposed Portfolio Share` chart calculation after the copy retained an obsolete internal calculated-field ID. The new calculation uses the Workspace blend's `Projected Portfolio Share` field and matches the original chart behavior.
- Entered a test proposed-loan amount and confirmed the Borrower Insight page remained free of system and data-set errors, then reset the parameter to `0`.

## Checks performed

- Confirmed both Google identities were signed in and the Workspace identity owns the deployed AppSheet apps `Loan Business Insights` and `Loan Manager ผู้จัดการสินเชื่อ`.
- Confirmed the Workspace identity can edit the source report and connect independently to every required AppSheet reporting table.
- Verified the final report contains exactly seven reusable Workspace sources, with the chart counts listed above and no unused embedded source.
- Opened all eight report pages in Workspace view mode: Overview, Cash, Borrowers, Performance, Risks, Daily Collection, Borrower Insight, and Profit Forecast & Partner Outlook.
- Confirmed key charts and tables render on each page. Transient AppSheet connector responses cleared on refresh; no persistent system or data-set configuration error remained in the final browser checks.
- Overview spot check after refresh: Total Cash Pool `฿100,000`; Outstanding Principal `฿83,558`; Available Cash `฿16,442`; Cash Pool Utilization `84%`; 7-Day Profit Growth `44%`; Expected Daily Interest `8,046`; Realized Profit MTD `25,558`; Projected Monthly Profit `245,150`; Profit in Past 30 Days `฿109,788`; Active Loans `31`; Top Borrower `Puifai`; Total Interest Earned `109,788`.
- Confirmed no files under `sources/` were modified.
- No AppSheet table, column, expression, relationship, slice, bot, production record, or schema was changed. `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx` were therefore not modified by this migration.

## Manual testing required before cutover

1. Sign in only as `welct0407@mw-credit.com` and open the migrated report.
2. Review all eight pages on desktop and mobile layouts, including navigation, date filters, borrower filters, chart interactions, and table pagination.
3. On Borrower Insight, select representative borrowers, test `Proposed Loan Amount` with `0` and a positive value, and confirm projected exposure and portfolio behavior match the source report's intended prototype logic.
4. Compare critical KPI values between the personal and Workspace reports using the same filters and refresh cutoff.
5. Confirm any intended report viewers can access the migrated report without relying on the personal account.
6. Provide manual acceptance before changing bookmarks, embedded links, distribution, or retiring personal-account assets.

## Downstream effects and cutover status

- Seven Workspace-owned reusable data sources and one Workspace-owned report now exist.
- Personal sources remain shared with the Workspace account for rollback and comparison.
- No production link, bookmark, embed, distribution, or report publication was changed.
- The personal report and its data sources have not been retired. Cutover remains pending user acceptance.
- AppSheet connector responses can be transient; refresh the page before treating a one-off `connector could not be found` message as persistent.

## Rollback instructions

- Continue using source report ID `c62727aa-a0fc-4c2a-9295-b46ebe1f82fc` if the Workspace report fails acceptance.
- Use backup report ID `23df8b07-1ecc-4546-88c6-1c70e9bc79df` to inspect or restore the exact pre-migration report state.
- Do not remove personal sources or revoke their access until the Workspace report is accepted and downstream consumers are updated.
- If rollback is required after cutover, restore consumer links to the personal source report; the Workspace report and sources can remain isolated until their dependencies are reviewed.
