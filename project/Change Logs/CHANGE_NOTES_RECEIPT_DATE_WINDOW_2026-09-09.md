# Receipt date window: today or yesterday — 2026-09-09

Status: Implemented; automated validation passed, live acceptance pending.

## Behavior and scope

Shared Receipts.assess now accepts the current or previous Asia/Bangkok calendar date. PaymentDateAllowed must still match the extracted transfer date, and reserve/posting retains that date. Older/future/invalid dates get an explicit review reason. Existing reference searches, global transaction fingerprint duplicate protection, bank match, balance and other exception checks are unchanged. Applies to all borrower routes and both event/master API paths; no AppSheet schema/configuration edit or live financial test mutation.

## Files and rollback

Changed mw-ai-collection/src/receipt_engine.mjs, test/receipt.test.mjs, RECEIPT_POLICY.md and collection-agent/PORTFOLIO.md. Pre-change engine and documentation copies are in collection-agent/local/before-receipt-date-window-20260909/. Restore the engine copy to revert the rule; preserve live payment and SQLite audit data. No AppSheet/Looker version backup applies because neither configuration was edited.

## Checks

All 60 Node tests passed. New tests cover Bangkok midnight/month boundary, calendar yesterday over 24 hours ago, older and future dates, preserving the original payment date, existing payment references and duplicate receipt fingerprints. Searched runtime for competing same-day checks; none found outside the shared assessment rule (historic reason rendering remains for older stored reviews).

Node coordinators are started per operation, so the updated rule is effective on subsequent assessments without service restart. No historical receipt was replayed or previously posted payment changed.

## Manual acceptance

Send a clear unused receipt dated yesterday and verify automatic posting with that original date plus normal acknowledgment. Resending the same receipt should remain duplicate-blocked. Older/future dates should still request review with the reason shown.
