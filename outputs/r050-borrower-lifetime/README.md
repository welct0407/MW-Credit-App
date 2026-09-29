# Borrower lifetime summary — R050

Published and verified on 29 September 2026 in dashboard 3, **8 · Borrower Detail**, tab105. R050 remains Open. Owner approved seven charges due strictly before today and genuinely closed loans for the closed-loan cohort.

## Display and calculation contract

All nine questions respond only to borrower selection, never Detail activity dates. Empty selection returns no financial rows. Amounts are baht; interest is gross received interest before business expenses. These are lifetime receipts/current balances, not selected-period totals.

Both return cards display percentages rounded to the nearest whole percent, with no decimal places; underlying source amounts and denominators are unchanged.

| Question | Metric | Definition |
| --- | --- | --- |
| 370 | Outstanding principal | Existing borrower Total Outstanding Principal |
| 371 | Active interest earned | Lifetime interest received on currently active loans |
| 372 | After principal coverage | Active interest earned minus current outstanding principal |
| 373 | Return on active principal | Active interest earned / current outstanding principal ×100; — if denominator is zero |
| 374 | Projected coverage date | Existing Projected Interest Coverage Date; assumes current daily interest continues. Already covered shows today's Bangkok date, not the historical crossing date. No applicable projection displays Not applicable. |
| 375 | Closed original principal | Sum original_principal for loan_status='Closed' only |
| 376 | Closed interest earned | Sum interest_received for the same Closed loans |
| 377 | Return on closed loans | Closed interest / closed original principal ×100; — if denominator is zero |

Closed status includes defaulted closures. Principal repaid on loans still active is excluded from this closed cohort. The legacy AppSheet Closed Loan Principal formula is unchanged. Active return retains the screenshot's current-outstanding basis and is explicitly labelled; it is not return on original lending. Missing closed source values remain unavailable rather than silently treated as zero; an empty closed cohort has zero amounts.

## Seven lights — question369

Native scatter/bubble chart with up to seven equal circles, one for each of the **most recent seven distinct eligible charge due dates** before today. Calendar gaps are skipped; fewer than seven dates show fewer lights. Each light combines all eligible charges due on that date. The short date appears below the light, oldest left and newest right. The ordinal date axis keeps the endpoint circles complete. The tooltip shows the full date and daily charge counts and amounts.

Existing reporting_charge_payment_health_v1.history_eligible excludes today/future, invalid, zero and default-accounting obligations. Daily status takes the highest concern: red if **any** charge remains overdue; otherwise orange if **any** was paid late; otherwise green when **all** were paid on time. Tooltip includes charge count, counts by status, principal/interest due and current remaining amount. Current payment balances may include today's payments; historical settlement timing deliberately stops before today.

## Implementation and verification

Existing source2 uses loan_manager_prod through metabase_borrower_reader. Sources are reporting_borrower_directory_v1, olap_borrowers_analytics, reporting_borrower_loan_facts_v1 and reporting_charge_payment_health_v1. No PostgreSQL migration, AppSheet change, service deployment or permission change.

Nine questions369–377 and four text notes add13 placements. New section spans rows17–40; prior Detail content from row17 shifts24 rows. Existing questions, tabs, filters and unrelated placements preserved. Dashboard now has12 tabs/272 placements.

- [Saved definitions and placements](saved.json), [prepared definitions](plan.json), [IDs/recovery](state.json).
- [Verification](verification.json): two borrowers × two date ranges identical, empty borrower safe, all unaffected placements preserved.
- [Reconciliation](reconciliation.json):21 independent loan metric comparisons and21 distinct charge-day comparisons across three borrowers passed.
- Chrome Wel / selected Metabase Gmail account verified. Desktop GUI verified complete seven-circle rendering, one date below each circle, aggregate statuses, active and closed cohorts, and unavailable displays. Mobile layout was not tested.
- Screenshots and full private recovery definitions stay outside Git under Documents/ChatGPT/AppSheet-Loan-Project/r050-borrower-lifetime.
- The whole-percent refinement saved preceding card definitions privately in before-whole-return.json. The charge-day correction saved dashboard/card definitions in before-charge-days.json and copied recovery dashboard30 before the final edit. Interim date-label and calendar-day attempts have recovery copies28 and29; the final definition uses the latest seven **charged** dates.

## Recovery and handover

Recovery dashboard27 and private before.json were captured before original publication. Dashboard30 and private before-charge-days.json capture the immediately preceding chart before the final seven-day correction. Restore only the affected card/note after checking intervening edits; do not overwrite later unrelated report changes with a full old dashboard. Newly created questions can remain unused. Starting Git commit c0a0c755e63563aa880813b9e66fda1542726a73.

Maintained runner: scripts/metabase/BorrowerLifetimeSummary.mjs. --prepare records a baseline; --publish is a guarded one-time creation, not an idempotent replay. --refine updates this batch's definitions/layout; --verify and --reconcile run focused checks. Inspect current state and preserve a fresh rollback before future mutation. Shared R050 release scope remains Open; this scoped report publication does not close or tag that release.
