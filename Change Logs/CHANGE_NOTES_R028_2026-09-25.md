# R028 — automatic schedule-aware borrower categories

Owner approved implementation on 25 September, explicitly included Gift, then required **no manual intervention**. Final scope: three additive SQL views and the existing Borrower Health Review tab 31. No manual confirmation table, name list or review workflow. Payment scores, financial records, AppSheet definitions and original report tabs remain unchanged.

## Final design and recovery

- V42 compares 30 completed-day interest amounts AND frequency of interest-bearing charge dates with current loan setup; respects later anchors and first-day fees.
- After >=7 observed days and >=2 expected dates, auto-off plus either coverage below 80% automatically restricts Star/Cash Cow. The frequency condition prevents a deferred lump sum from restoring upper eligibility solely by catching up the amount.
- Any qualifying active loan gates its borrower. High contribution becomes Question Mark; lower contribution becomes Dog. Missing payment ratings remain Unclassified. No score multiplication or fabricated debt.
- Categories recalculate automatically with source data and the rolling window. Not a permanent hardship label or certification of original terms. Current modeled product is daily-interest; unsupported/invalid inputs are visibly unassessed.
- New SQL objects are views only. V2 and all existing sources remain available for rollback. Both AppSheet apps retain current bindings and require no regeneration.
- Starting Git commit a9dcbfe15890d084d90ac4ed7fbb978b312d223c; unrelated untracked work preserved. Private DB backup and saved report baseline precede live mutations.

## Status

Implementation/testing in progress. R028 remains Open until authorized promotion capture. The owner's instruction covers the presented DB/report change; no payment/charge writes or notifications are included. The superseded manual-confirmation draft was removed before any live application.

DEV V42 applied/validated. Full SQL CI passed. Independent parity verified 48 supported DEV loans (two explicitly unassessed products) and all 52 PROD-restored loans. All 20 report queries pass; production rehearsal yields 4/8/5/6 with four automatically restricted borrowers. Backup restore verified all 26 source-table fingerprints. Metabase backup dashboard 5 and private question/layout before-state captured. Production publication pending.
