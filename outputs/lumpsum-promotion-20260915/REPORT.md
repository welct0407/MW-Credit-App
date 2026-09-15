# Lump-sum promotion — 15 September 2026

## Release status

**Promoted:** production OLTP **3.000074**, OLAP **1.100051**, Flyway **V4**. Dev OLTP **1.000019**, Dev OLAP **1.000027** remain on their isolated development instance. Owner explicitly authorized promotion and preserving notification features. Production rollback versions: OLTP **3.000071**, OLAP **1.100051**. Production financial data has not been changed.

The earlier V3 assessment missed notification compatibility. V4 corrects that omission using the existing AppSheet bots and actions. No notification queue, new business table or column was created. Dev push recipients are exclusively `welct0407@mw-credit.com`; production retains its existing recipient expressions, templates, event conditions and links.

## Final workflow

1. PostgreSQL validates the Processing receipt, locks the borrower and eligible source rows, allocates newest eligible charge first (immutable key descending for ties), pays interest before principal and creates positive allocation/repayment pairs.
2. The existing AppSheet receipt bot skips its first three allocation actions for Lump Sum. It finalizes the prepared receipt as Posted and runs the existing paid-loan closure action. Other payment methods retain their original expressions.
3. Those AppSheet updates trigger the existing Payment Received and Loan Closed push notifications.

Allocation and ledger preparation are one database transaction. Final status and loan closure are subsequent AppSheet stages. A failed finalizer leaves Processing visible; another lump-sum receipt for that borrower is blocked until reconciliation. Retrying a prepared receipt does not allocate again. Prepared financial inputs and SQL child rows are protected; the final Posted transition verifies allocation/ledger components and totals. A closure-stage failure can be recovered using the existing closure recheck action after reconciliation.

The existing five-action group and event both use `[Status] = "Processing"`. Only-if expressions on Payment - Create Snapshots, Payment - Freeze Plan and Payment - Post Plan wrap the original in `IF([Allocation Method] = "Lump Sum", FALSE, <original>)`. Payment - Reconcile wraps its original Status/Processed At values with Lump Sum values `"Posted"`/`NOW()`. Exact before/after expressions are recorded in the release evidence. Sources, keys, Refs, columns and slices are unchanged. OLAP remains a read-only consumer of the same ledger grain. No regeneration is required.

## Verification

- Fresh local V1–V4 reconstruction, Flyway validation, no-op second migration and checksum-tamper rejection passed. Supplemental SQL regression covers preparation/finalization, reconciliation, invalid/overpayment/future input, immutable rows, retry idempotence, pending-receipt exclusion, legacy compatibility and 1,000 charges. Separate sessions verified competing overpayment rejection and independent-borrower progress before lock release.
- New Dev app GUI: **LS26-V4-PUSH-01**, amount 1, Posted with one allocation and one repayment; **LS26-V4-CLOSURE**, amount 199,089, Posted with six allocations and six repayments. Receipt, allocation and ledger totals match exactly. Existing synthetic loan LS26-LB closed, and Dev OLAP reads the same closed status and principal/interest totals. A subsequent ordinary sync was needed to replace the initial cached Processing display.
- AppSheet Monitor recorded Payment Received runs `8ffbacb2-956f-4f90-bde5-a6dde8b57b41` at 08:42:35 UTC and `c4991eee-1424-4fa3-a02b-0f27296bd38b` at 08:45:30 UTC as Complete. Loan Closed run `812f612b-f193-42ba-8743-fd663d96e88c` at 08:45:30 UTC also completed. All three Dev notification tasks target only the owner account. Device receipt is not independently confirmed.
- The editor's earlier standalone test-notification attempt did not return confirmation; it is not counted as successful delivery. Original notification templates were restored before the normal workflow tests above.
- No production test payment, data backfill or development financial-data transfer is included. Multi-device/offline recovery, scheduled exports and Looker execution were not tested by this release.

## Performance interpretation

The [earlier V3 report](../lumpsum-db-20260915/REPORT.md) measured server Add median **14.438 → 5.370 seconds (62.8% reduction)** and Save-to-ready median **14.567 → 12.165 seconds (16.5%)**. Those are historical V3 measurements. V4 retains the SQL allocation work but restores AppSheet finalization; a fresh comparative V4 end-to-end benchmark has not been measured. No V4 or production speed percentage is claimed. The benchmark loan is now fully paid after the closure test.

## Backup and immutable release

V4 SHA256: `7ca048dcd8d884395a7cbe17fc01ad16032a00e2a60cd85f9d70541da19c289a`. V1–V3 remain immutable; their hashes are recorded in the original change log and release manifest.

Fresh normalized Dev V4 schema SHA256: `61ba8b719d3f7d87488fc3e5a2cf0c86ff92cff3f9f655cb5076a3688e2d1f2c`. Dev now has 165 receipts, including 19 LS26 fixtures, with zero Processing/Error receipts. The historical original-data comparison is no longer identical in Payments, Payment Allocations and Repayments (one additional non-LS26 receipt and 20 child pairs); therefore the older “all original fingerprints unchanged” claim is not extended to this release. The pre-V4 full audit already contained 163 receipts; the two V4 GUI tests increased that to 165. No existing receipt was edited in this follow-up.

Private production backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/lumpsum-promotion-20260915/production-before.dump`, SHA256 `ea880e8558eb06e3d8236cc1b5797218b87a97e9edd591bcac41cc957b498b18`. A disposable local restore passed at 15:18 Bangkok: all 14 business-table counts/fingerprints matched and normalized schema matched V1. The restore cluster was stopped. This logical backup covers database objects/data and Flyway history; it does not back up credentials or instance/global-role configuration.

At 16:01 Bangkok, production still had 152 receipts, zero Processing/Error and zero synthetic receipts. Thirteen table fingerprints still matched the restored backup; Daily Analytics had independently changed before cutover. Preserve current data during rollback and use forward fixes; do not overwrite newer analytics with the older full backup as a routine reversal. The fresh pre-cutover audit is the post-deployment comparison point.

Flyway promoted the exact tested release commit **8417b9bf5e950287a969fd5750985b5c9375d80b** at **16:04:37 Bangkok**: V2, V3 and V4 applied successfully, followed by successful validation. The [release manifest](release-manifest.json) contains all immutable hashes. Normalized production schema matches Dev V4 exactly. All **14 production table counts/fingerprints are unchanged across the cutover**, including Daily Analytics relative to the fresh pre-cutover snapshot.

Receipt entry was briefly paused through Payments READ_ONLY in temporary version **3.000072**, with zero Processing/Error receipts. AppSheet marked that temporary version non-runnable because existing actions require writes. Version **3.000073** restored ALL_CHANGES and applied the five tested expressions. The pause also caused AppSheet to regenerate Payments_Form with automatic ordering; the original seven-field order was restored exactly in final **3.000074**. Final editor shows no issues. All five expressions match saved Dev, Payments uses database-2 and ALL_CHANGES, and both production apps loaded and synced through the current GUI. No production payment was submitted. Production notification configuration was not edited. [Deployment verification](production-verification.json) records these checks.

## Rollback and review

Pause entry and reconcile prepared receipts first. A forward migration can disable only the Payments processor trigger; retain guards, indexes and posted history. Restore the original three action conditions and two reconciliation assignments from the private production appdoc / release expressions. The receipt event and group remain Processing. An app-version restore alone cannot undo SQL changes. Do not delete ledger records, edit applied migrations or use Flyway repair/clean.

Owner review: inspect LS26-V4-PUSH-01 and LS26-V4-CLOSURE in Dev, check received pushes on the registered device, then review the next ordinary production receipt and any resulting closure after deployment. Documentation is tracked in the authoritative lump-sum change log, model overview, canonical dictionary and environment/development registers.
