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

Native scatter/bubble chart with seven equal circles, ordinal positions1–7, hidden axes and explicit colors. Ordinal X spacing prevents clipped endpoint circles. Oldest is left, newest right. Rank eligible individual charges by due_date descending, then immutable charge_id descending; take seven. Same-day charges remain individual lights, with ID used only as deterministic tie-breaker.

Existing reporting_charge_payment_health_v1.history_eligible excludes today/future, invalid, zero and default-accounting obligations. Current overdue state takes priority: red=still overdue, green=paid on time, orange=paid late. Earlier empty positions are grey when fewer than seven eligible charges exist. Tooltip includes charge date, readable loan label, principal/interest due, remaining amount and settlement before today. Current payment balances may include today's payments; historical settlement timing deliberately stops before today.

## Implementation and verification

Existing source2 uses loan_manager_prod through metabase_borrower_reader. Sources are reporting_borrower_directory_v1, olap_borrowers_analytics, reporting_borrower_loan_facts_v1 and reporting_charge_payment_health_v1. No PostgreSQL migration, AppSheet change, service deployment or permission change.

Nine questions369–377 and four text notes add13 placements. New section spans rows17–40; prior Detail content from row17 shifts24 rows. Existing questions, tabs, filters and unrelated placements preserved. Dashboard now has12 tabs/272 placements.

- [Saved definitions and placements](saved.json), [prepared definitions](plan.json), [IDs/recovery](state.json).
- [Verification](verification.json): two borrowers × two date ranges identical, empty borrower safe, all unaffected placements preserved.
- [Reconciliation](reconciliation.json):21 independent loan metric comparisons and21 latest-charge comparisons across three borrowers passed.
- Chrome Wel / selected Metabase Gmail account verified. Desktop GUI verified complete seven-circle rendering with all three statuses, active and closed cohorts, and unavailable displays. Mobile layout was not tested.
- Screenshots and full private recovery definitions stay outside Git under Documents/ChatGPT/AppSheet-Loan-Project/r050-borrower-lifetime.
- The later whole-percent refinement saved the immediately preceding card definitions privately in before-whole-return.json; only questions373 and377 were edited.

## Recovery and handover

Recovery dashboard27 and private before.json were captured before publication. Restore only tab105's affected placements after checking intervening edits; do not overwrite later unrelated report changes with a full old dashboard. Newly created questions can remain unused. Starting Git commit c0a0c755e63563aa880813b9e66fda1542726a73.

Maintained runner: scripts/metabase/BorrowerLifetimeSummary.mjs. --prepare records a baseline; --publish is a guarded one-time creation, not an idempotent replay. --refine updates this batch's definitions/layout; --verify and --reconcile run focused checks. Inspect current state and preserve a fresh rollback before future mutation. Shared R050 release scope remains Open; this scoped report publication does not close or tag that release.
