# V68 daily-mode conversion — applied DEV, GUI proof pending

Actual DEV68 validates checksum−79096429; PROD58 is untouched. Applied SHA256 `2e9b4921e1aa6380f5537262a693bc859e591ef4bdd37ad5c95e2018a9b2abae`. [Exact tests and state](daily-type-conversion-v68.json). This package changes one existing invoker function, with no new field, grant, trigger bypass or backfill.

V53 stores the original average daily percentage for all three loan types and keeps it immutable. V60 already applies that rate to outstanding principal after principal corrections. V68 also does so when entering daily mode: `round(max(0, outstanding) × frozen rate / 100)`. This repairs the demonstrated fixed→daily NULL amount without inventing a new commercial rate. Fixed100 with original5% and20 principal already received becomes4 daily; later fixed-term edits do not replace its original5%.

Missing stored original rate uses the existing reconstruction from the previous source terms. If those do not establish a rate, the conversion fails atomically with a precise missing-original-terms error; supplying new terms or a replacement percentage in the same edit is not original evidence. Zero is a valid frozen rate and remains zero. Same-daily saves preserve the prior current amount unless principal changes, retaining the owner's rounded-rate/backlog behavior.

Automatic daily conversion requires Loan Date and a positive payment interval, because those are the existing generator's prerequisites. Manual `Auto Charge Enabled=false` conversion does not acquire that restriction. Anchor validation is unchanged. No existing daily schedule is newly blocked by this transition-only guard.

Existing charges/receipts/cash stay unchanged. Future generation follows the existing last booked charge/Loan Date accrual clock; **conversion does not restart accrual at the edit date**. The test generates8 interest for two days at4 after conversion, while its original booked charge remains unchanged. This is not retrospective rewriting of booked obligations. Generation/notification scheduling itself is unchanged.

## Reviewed execution sequence — steps1–4 completed; GUI step5 pending

1. Complete maintained CI and publish the reviewed exact candidate on the existing task PR; verify exact-head checks. Preserve all applied V1–67 bytes.
2. Parent coordinates an exclusive DEV window. Recheck complete instance/host/database tuple, current67/checksum1721477385, migration reservations and current GUI fixture state. Fresh private current67 backup must restore/compare successfully before migration; do not silently reuse a stale dump or restore shared DEV.
3. Apply only pinned V68 through the maintained Flyway route, validate checksum/history, reconcile any ambiguous outcome without replay. Compare business source fingerprints across the function-only change.
4. Run a separately scoped rollback-only DEV acceptance using unique synthetic source keys, server timeouts and no borrower delivery: positive fixed/installment conversions, original/zero/missing basis, principal/charge/cash preservation and atomic failure. The disposable Test-CashAccountFixtures/funding setup is **not** a DEV seed script. Preserve all existing GUI fixtures and compare after rollback.
5. Return the window for actual loan form save/full-sync. No schema regeneration is needed. Existing type editing can remain available for supported conversions after backend acceptance; remove the proposed blanket existing-type lock from the plan. The client may show an old derived daily amount until full sync; verify final stored/displayed amount and any relevant event consumer. Do not claim other cross-type schedules correct solely because their type persists.

Fresh67 recovery, exact migration and rollback acceptance completed; [actual summary](daily-type-conversion-v68-actual-summary.json). Seventh REIMBURSE stays unseeded. This plan gives no production, browser, notification or shared-instance authority.

Recovery decision: an unexpected post-apply defect pauses use and is corrected through a reviewed forward migration. Never edit an applied migration/checksum/history or restore the shared DEV database casually. The fresh V67 dump is a verified disaster recovery asset; restoring it requires a separately coordinated scope because it would replace other current shared data. Unknown apply outcomes are read/reconciled without replay.
