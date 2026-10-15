# R047 — Collection borrower receipts (DEV)

Implemented 27 September 2026 in DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`, saved version **1.000098**. Rollback is the pre-change version **1.000095**. R047 remains Open for review; no PROD app promotion occurred.

## User flow

Open Collection, select a borrower, then scroll below today's collection charges to **หลักฐานที่ส่งแล้ว / Submitted Receipts**. Only that borrower's Posted Payments with an existing receipt image appear. Each read-only row shows the original image thumbnail, receipt received time and payment amount, newest first. Select a row to open the existing `Payments_Detail`, then select the image to open it full size. The section is hidden when the borrower has no matching receipts.

This implements option 1: it does not expose pending, rejected or otherwise unlinked agent images. It displays linked historical payments as well as new linked payments; there is no today-only receipt filter. DEV uses its existing DEV data and synthetic receipt fixture; production backfill rows were not copied into DEV.

## Saved configuration

- New read-only Payments slice `Submitted Receipt Payments`: `AND([Status] = "Posted", ISNOTBLANK([Receipt Image]))`. It includes existing Payments columns and inherits the existing DEV storage binding.
- New Borrowers virtual List of Ref column `Submitted Receipts`: `REF_ROWS("Submitted Receipt Payments", "Ref Borrower")`; referenced source is the receipt slice. Display name is `"หลักฐานที่ส่งแล้ว / Submitted Receipts"`; Show_If is `AND(CONTEXT("ViewType") = "detail", ISNOTBLANK([Submitted Receipts]))`. No persisted SQL column is added.
- `Todays Collection Board` includes the new column. `Todays Collection Board_Detail` appends it after `Todays Collection Charges`; existing collection totals, quick-edit Borrower Note and actions are retained.
- New reference deck `Submitted Receipts_Inline`, source `Submitted Receipt Payments`: image `Receipt Image`, Square Image, primary header `Receipt Received At`, secondary header `Amount Received`, summary None, no grouping/aggregate, received-time descending sort, action bar off.
- New hidden Payments navigation action `Open Submitted Receipt Payment`, type `App: go to another view within this app`, target `LINKTOROW([Row ID], "Payments_Detail")`. It is the deck's Row Selected action; it performs no data write.
- DEV Payments `Receipt Image` and `Receipt Received At` Show_If becomes `AND(CONTEXT("ViewType") <> "form", ISNOTBLANK([Receipt Image]))`. The former Payment-detail-only rule suppressed nested thumbnails. Both columns remain read-only, non-searchable, with no initial value or app formula; receipt ID remains hidden. The receipt fields remain absent from Payment forms.

No database schema/data, agent runtime, bucket, IAM, notification, scheduled bot, report or OLAP definition changes were needed. These UI objects use existing Payment ownership and borrower keys; no second image copy or receipt catalogue is introduced.

## Verification and limits

Current Chrome work profile and AppSheet account `welct0407@mw-credit.com` were verified. The existing synthetic `R046-borrower` was opened through Collection: one matching receipt thumbnail/date/amount appeared, row selection opened canonical Payment detail, and full-size image rendering passed. A separate borrower with Payments but no receipt image showed no receipt section. Opening/cancelling the Payment edit form confirmed no receipt input controls; no financial form was submitted. Saved slice filter/read-only settings were read back; sort direction was verified in the editor. A multiple-receipt runtime ordering case was not seeded; the configured descending sort was checked.

Both saved DEV editors report **No issues found**. DEV OLTP is 1.000098; DEV OLAP was observed at **1.000036**, unchanged by this task (the older R046 evidence recorded 1.000035). Both apps remain Deployed. Existing DEV routing/source bindings and GCS connection were reused; no source refresh occurred. PROD apps were not edited.

[Collection screenshot](collection-receipts.png) · [Full-size receipt screenshot](receipt-expanded.png) · [Saved receipt slice](slice-saved-state.txt) · [Validation](verification.json).

## Review, promotion and rollback

DEV implementation is complete; owner acceptance and integrated PROD AppSheet promotion remain pending. Promotion must include the existing R046 receipt UI/storage configuration and these R047 additions in the normal PROD-mapped RC/App Upgrade workflow. Do not promote the old R046 definition over the newer integrated DEV work. No SQL migration or agent deployment is required for this feature.

Restore DEV OLTP 1.000095 to undo this UI batch while retaining the R046 receipt implementation. App restoration does not change receipt objects, payment financial records or backend metadata. Reconcile any newer DEV edits before restoration.

Starting Git commit: `4818e00c5b3f570d010532079c3dcbe09fe64734`. Unrelated local files were preserved. Exact DEV overlays are in `Documents/Data Dictionary/development/appsheet/r047/`; PROD references remain unchanged.
