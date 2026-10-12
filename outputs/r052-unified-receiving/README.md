# Unified receiving in DEV

Open [DEV](https://dev-lm.mw-credit.com), choose a borrower in Collection, then Receive. Enter the amount and use Auto-assign or exact principal/interest entries; check the summary, account, payment method, date and receipt before Review/Confirm. Online review refreshes current values. Existing requests retain their original replay/status identity.

The separate PWA v6 engine and retained AppSheet legacy engine are active in DEV82. [Delivery pins](delivery-manifest.json) · [Financial/UI verification](independent-verification.md) · [Deployed read-only check](live-readonly-smoke.md) · [Design](../r052-unified-receive-payment/design-and-test-plan.md).

Owner hands-on acceptance is pending. This batch made no live financial writes. Financial proof uses the labelled disposable database/browser tests; deployed smoke was read-only. Revised posted amount/borrower/allocation plans are not a native correction workflow yet. PNG/JPEG receipts are supported, not HEIC. Offline authorization/viewed snapshots last up to24 hours; unsent drafts remain until discard/post/sign-out and never auto-submit on reconnect. Notifications remain Phase8. PROD is unchanged.
