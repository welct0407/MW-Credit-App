# R052 unified amount-first receiving — 8 October 2026 (Bangkok)

The agreed Phase5 receiving checkpoint is implemented, tested, deployed and read-only verified in DEV. Owner hands-on acceptance remains pending; this does not complete all Phase5. R052 remains the sole Open release. No live financial write, receipt upload, CAS or new test fixture was made by this batch. PROD V77, AppSheet definitions, notifications, reader and existing identity/storage configuration are unchanged.

Owner decision: Auto uses newest-due-first/interest-first; manual allocation records exact principal/interest. A separate PWA v6 engine handles authoritative retained-journal origin. The dispatcher preserves AppSheet/v3–v5 legacy routing. V82 adds routines/trigger only, no tables or columns. [Design and executable tests](../r052-unified-receive-payment/design-and-test-plan.md), [independent verification](independent-verification.md), [live read-only smoke](live-readonly-smoke.md) and [one delivery manifest](delivery-manifest.json) own exact scope, source hashes, checks and limits. Existing four workers were reused; unrelated CI/process changes and the primary PM checkout were preserved.

## Delivery and checks

Starting app e2549d1 and PM5a72a840 were retained as repository rollback points. Final executable/frontend source8803b6d passed full Development37800625921 and Database37800626024. Independent full V1–V82 financial20/20 passed; maintained Test-CI passed with owned clusters stopped. Responsive/recovery checks and the final strict 320px correction passed, followed by full Linux CI. Earlier CI failures and precise fixes remain in the owning log/manifest; interim executions are not summed as unique tests.

Unchanged command code built373aec1 produced image40346325; final frontend built8803 produced index-2YJpeEdU.js. Fresh DEV81 backup and owned restore were refreshed immediately before apply at2026-10-08T15:34:03.2890402Z (81 history rows/24 tables); recovery stays private. Maintained DEV82 migrate/reconcile/validate succeeded, exact original operator membership/schema ACLs were restored, and runtime journal/owner/creator restrictions remained intact. The unchanged nonsuperuser V79→V80 maintenance lifecycle proof is explicitly reused, not described as a local V82 proof.

Reviewed image-only Terraform plan0add/1update/0destroy applied. Command00004-h44 is Ready; health200 and anonymous status401 passed. Hosting416c250e14e60e61/release1791474204919000 is deployed. Final Terraform plan is a no-op; affected dictionary routines/index validate1545 documents with zero errors. C observed the exact bundle and preserved owner authentication, saved synthetic draft and prior Posted history; an untouched normal eligible read rendered principal/interest fields. No new financial operation was exercised live.

## Recovery and limits

Retain both DB engines/dispatcher through frontend rollback. After v6 payments exist, retain v6-capable API status/history/pending recovery; do not blindly restore a v5-only API without compatibility proof. Code rollback does not undo SQL or financial writes, and the private logical backup must not overwrite later owner payments.

Metadata/receipt and compatible account/tender/date correction preserve the original v6 split. Changes to borrower, total, selected IDs, target references or allocation method fail atomically; revised financial plans need a later native correction workflow. Legacy retirement after cutover requires governed historical AppSheet/v3–v5 correction/replay compatibility, preserving audit/journal/history; client retirement alone does not authorize function deletion. Notifications remain Phase8.

Local request timing samples are labelled local store observations, not cold/warm/cloud/browser performance or query-count proof. Tokens and unavailable timings are not inferred. Stop at this checkpoint for owner hands-on review.
