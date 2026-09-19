# R008 production release

Released 19 September 2026. The owner authorized promotion of all R008 revisions, creation of the three production cash-account rows, and deletion of the four superseded custom borrower actions. This file records the initial closure at **SQL V24 / OLTP 3.000216 / OLAP 1.100162**. A later full audit found that closure incomplete; the [correction report](../production-correction/REPORT.md) at **OLTP 3.000228 / OLAP 1.100178** is authoritative.

## Result

- The initial claim that all 199 frozen targets were applied was incorrect. The correction audit fixed the missing production configuration and now accounts for all targets with literal, equivalent, editor-verified or accepted-final-refinement evidence. The delta SHA-256 is `3a689c3d9a658f1927c57cb202ee06b0c74bdd10de0527a71783ca4a5cbfd656`.
- V23 and V24 migrated on the verified production instance and Flyway validation passed with 25 migrations and no warnings.
- Both saved PROD editors report **No issues found** and remain Deployed. A fresh Deployment Check is excluded for already-Deployed PROD apps by the repository owner rule.
- The three exact-receipt notification bots are saved with production recipient logic. No notification was sent during verification.
- Native borrower Ref navigation is active in Charges, Repayments and Loans details in both apps. The four obsolete custom Open Borrower actions are absent. Receive All is hidden in Collection and borrower detail views and remains available inline in the Collection list.
- The production Cash Accounts table contains exactly **Dad TTB**, **Dad SCB** and **Lisa**. Dad TTB and Lisa are the active defaults for their holders. All three account openings remain deliberately uninitialized; no historical balance split was inferred.

## Verification

The initial readback is recorded in [appsheet-observations.json](appsheet-observations.json) and [sql-readback.json](sql-readback.json). It did not test the complete transfer form or independently compare every target. The correction audit adds fresh AppDoc, editor and runtime evidence, including both transfer account selectors. No production financial transaction was written during either runtime verification.

SQL readback found three active accounts, two active defaults, zero holders without exactly one active default, 22 ledger rows, zero holder/account mismatches and zero synthetic R008 accounts. Final Flyway validation passed at V24.

## Recovery

The coordinated pre-release rollback point is PROD OLTP **3.000173**, PROD OLAP **1.100131** and the private V22 `production-before.dump`, SHA-256 `B4E9C5091B70B443456F8B198932FF25E04DF3D53F4771EC3FADF69AEC737F3D`. It restored successfully in isolation and its normalized public/assessment schema matched. Do not restore it over later financial activity without a coordinated recovery decision; prefer a reviewed forward fix.

The final V24 recovery checkpoint is private `production-after-final.dump`, SHA-256 `0DEAA1284813CD5883FCF9A57EA7E9FBF7F821031CA9553C6676B4455DE62D18`. It also restored successfully with a matching normalized schema. Cloud SQL extension/settings are outside both logical backups. See [backup-before-verification.json](backup-before-verification.json) and [backup-after-verification.json](backup-after-verification.json).

## Closure

The [documentation checklist](documentation-checklist.md) records every required disposition and now points to the correction evidence. Implementation candidate commit `f0d2285` contains the frozen release package; promotion-evidence commit `ce58ef9` contains the superseded initial closure records.
