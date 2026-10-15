# Change Notes — Delete OLTP Prototype Apps — 2026-08-31

## Scope and purpose

- Purpose: remove two confusing prototype OLTP apps from the owner's AppSheet app catalog.
- The user confirmed the exact names before deletion on 2026-08-31 (Asia/Singapore).
- Deployed apps `Loan Manager ผู้จัดการสินเชื่อ` and `Loan Business Insights` are explicitly out of scope.
- No shared AppSheet database records, deployed app definitions, Looker Studio objects, or repository source files are in scope.

## Pre-deletion record

| Prototype app | App ID | Status | Last recorded version |
| --- | --- | --- | ---: |
| `OLTP DB TEST 20260830-221908` | `fa3882d6-993d-450e-b7fc-15c3c7545263` | Prototype | `1.000006` |
| `OLTP TEST 20260830-221908` | `573da65d-e155-4bf9-9d1b-059a7208ec64` | Prototype | `1.000004` |

The versions and identifiers above were recorded from the live AppSheet editor before deletion. App version restoration is not a guaranteed rollback mechanism after deleting the entire app.

## Implemented change

- Deleted only the two prototype apps listed above from **My Apps** after the user's explicit confirmation.
- AppSheet displayed `App deleted` after each deletion.
- Neither deployed app was deleted or edited.

## Checks performed

1. Confirmed both prototype names disappeared from **My Apps**.
2. Confirmed **Recent Apps** changed from four entries to two.
3. Confirmed `Loan Manager ผู้จัดการสินเชื่อ` remains listed as Deployed.
4. Confirmed `Loan Business Insights` remains listed as Deployed.
5. Confirmed the AppSheet database catalog remains present and was not changed by the app deletions. The retained databases are `Money database`, `Money DB TEST 20260830-221908`, and `Money TEST 20260830-221908`.

## Manual verification requested

1. Refresh **My Apps > Apps** and confirm only the two deployed apps remain.
2. Open each deployed app and confirm normal access and sync.
3. Confirm whether the two retained test databases should remain; they were not included in this deletion request.

## Status

**Accepted.** The user confirmed on 2026-08-31 (Asia/Singapore) that both prototype apps were deleted.

The deployed OLTP and OLAP apps and all AppSheet databases remain outside the deletion scope.

## Recovery note

The AppSheet deletion dialog stated that the deleted apps would no longer be accessible. If AppSheet support offers account-level recovery, use the recorded app IDs to identify the targets. Otherwise, recreation requires a surviving copy or a new copy of the deployed OLTP app; version numbers alone cannot restore a deleted app container.
