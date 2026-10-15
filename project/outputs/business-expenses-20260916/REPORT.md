# Business expenses — DEV implementation, 16 September 2026

Status: implemented in development; owner acceptance pending. Production and Looker Studio were not changed. AppSheet work and runtime checks used Chrome and the current editor/app interface.

## Versions and recovery

| Component | Before / rollback | Implemented |
| --- | --- | --- |
| DEV PostgreSQL | Flyway V14 | V16 (immutable V15 + V16) |
| Loan Manager — DEV | 1.000061 | 1.000081 |
| Loan Business Insights — DEV | 1.000064 | 1.000084 |
| Production | V14 / 3.000108 / 1.100090 | Unchanged |

DEV UUIDs are 65faacd8-2b0d-43bf-9e0a-58eb915dcf9b and 494cd013-0d9b-482f-9559-c9d83059de91. Both use database-3, instance appsheet-pg-dev-20260915, host 34.158.38.171. The misleading database name loan_manager_prod is not the environment identifier. Companion links still target DEV.

The private pre-change dump is `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/business-expenses-20260916/development-before.dump`. A local restore matched all 14 business-table fingerprints and normalized schema; see backup-verification.json. Dump SHA256: `0B8ADF4FCA75DEDA910D5C2D617F5E412799AD7EC0B7D265FA3CF0573FD0CC1A`. Schema SHA256: `EB8F0801374FD9EA84CFB684B508726760CC781EAC01B07624342663D16AA16B`. Git does not back up this private dump or credentials.

Recovery requires a reviewed higher forward migration or a coordinated DEV database/app restore to these starting points. Restore loses subsequent DEV writes; reconcile them first. Do not restore only AppSheet over incompatible SQL, modify applied migration checksums, delete expense history, or replay synthetic fixtures in production.

## Implemented model

V15 adds nullable Borrowers.Ref Referrer with a self-reference check, one 20-column Business Expenses ledger, relationships/indexes, immutable automated identity, recalculable physical allocation fields, net settlement validation, and three SQL Daily Analytics measures. V16 aligns SQL settlement entitlement with the existing per-repayment Price(0) rounding observed in the current partner report.

Repayments remain gross-income authority. Contributions/withdrawals through the applicable date determine expense shares: Expense Date for manual rows and current Loan Close Date for referral rows. A is rounded to whole baht; B receives the exact remainder. Contribution insert/update/delete/date changes and partner-role corrections recalculate affected expense dates. A missing/nonpositive or invalid A/B pool fails. A transaction advisory lock serializes allocation corrections and settlement reservations, returning a retry error on contention.

The deferred loan-close trigger creates one rebate in the same payment transaction only for a non-defaulted, fully repaid, positive-profit loan closed by a posted cash payment with a referrer. Amount is `MIN(ROUND(SUM(Interest Paid)*0.10),1000)`. Source Key is `REFERRAL_REBATE:<loan>`; Row ID is `rr1:<loan>`. Original referrer, borrower, loan, profit basis, amount and rule version remain immutable. Each qualifying loan can earn a rebate; there is no first-loan-only restriction or historical deployment backfill.

OLTP owns manual entry and referrer maintenance. Its expense table uses ADDS_AND_UPDATES; SQL rejects physical deletions. The seven-field form shows only date, category, amount, payee, related borrower, related loan and notes. System fields are hidden/read-only. The Edit action is available only for Manual rows; automatic-row detail has no edit/delete action. Nonzero whole-baht negative manual adjustments require explanatory notes so corrections retain history. This follows the current repository retention rule instead of the design's optional admin-deletion shortcut. Category grouping and date-descending sorting are implemented; the optional month grouping is not added.

OLAP consumes Business Expenses and Daily Analytics READ_ONLY. Shares display Percent with two decimals; money displays baht with zero decimals. Column-level editable metadata on imported OLAP fields does not grant writes because the table is READ_ONLY. Referrer is read-only. Related Referral Expenses is a filtered List Ref and Total Referral Rebate Earned sums its Amount; both appear in Borrowers_Detail. Borrower base/slice forms and details expose Ref Referrer in OLTP.

Partner gross Total Profit Earned and Available to Settle formulas are preserved. New Net Profit Earned subtracts the role's allocated expenses; Net Available to Settle subtracts every existing settlement, including Pending. Existing card summaries and the same 13-field detail order substitute these net fields with the prior display labels. Create Settlement uses net availability. The Amount validation excludes the current row from reservations and permits unchanged existing reservations to complete after corrections; new/increased amounts must fit the SQL-enforced net limit. Negative net availability is retained, not clamped.

OLAP Statistics adds Total Business Expenses, Net Profit, Expenses MTD, Net Profit MTD, Net Unsettled Profit and Net Expected Loan Account Balance. Existing gross/forecast fields remain unchanged. The four core fields appear in Analytics Data; all six are appended to KPIs. Heavy reporting remains in OLAP; OLTP's existing lightweight statistics are unchanged.

Daily Analytics adds expense-date Business Expenses, Interest Received minus expenses as Net Profit, and existing gross Unsettled Profit EOD minus cumulative expenses as Net Unsettled Profit EOD. Model 2 gross definitions and row keys are retained. Full rebuild now starts at the earliest loan or expense date. Historical contribution corrections recalculate expense allocations immediately; Full Rebuild Daily Analytics rebuilds historical snapshots. The daily net measure retains the original aggregate gross convention; partner settlement uses the application's per-repayment rounding, which can differ at half-baht boundaries. These are distinct existing gross grains, not a new change to gross profit.

## Consumer reconciliation

Saved appdoc comparison: no existing OLTP financial formula changed. Only the two intended OLAP partner summary App formulas changed; the settlement Amount Type Qualifier gained its net Valid_If. Existing keys, types, defaults, gross calculations and source bindings remain intact. Both final definitions report Runnable Yes and Deployable Yes.

Regeneration appended three borrower fields (Ref Referrer and the two expense reverse lists) to OLTP Visible Borrowers/Todays Collection Board and OLAP Borrowers with Outstanding Loans, Profit Contribution 30D, Reporting Borrowers and Todays Collection Board. Reporting Loans gains Related Business Expenses. Daily Analytics 7/30/90 Days and Reporting Daily Analytics gain the three net measures. Every slice filter and update mode is preserved. Reporting Statistics is unchanged; Looker presentation changes remain the design's post-acceptance phase. No dashboard was edited or published and no Looker backup was required. New reporting-slice fields are additive; downstream refresh/display has not been tested.

Before tests, all seven OLTP and two OLAP bots, their processing and destinations were reviewed. Essential DEV-only Generate Daily Charges (00:05 Bangkok) and Refresh Daily Analytics Daily (hourly Recent request) remain enabled. Superseded Create First-Day Charge/Payments - Process Receipt and Daily Loan Analysis Export remain disabled. The four notification bots are disabled in this DEV checkpoint; their prior owner-only destinations/templates are retained. The current task's supplied isolation rule takes precedence over the older guide's notification exception. No notification was intentionally sent. The per-loan Generate Today's Charge action was temporarily exposed to generate only the synthetic loan's charge, then restored to Hide; its expression and eligibility were unchanged.

## Verification and retained test data

| Check | Evidence / result |
| --- | --- |
| Restorable backup | 14/14 business-table fingerprints and normalized schema matched |
| Local isolated PostgreSQL regression | No referrer, normal 660, cap 1000, zero profit, default, partial principal, retry/reclose, changed referrer, 55/45 referral and 70/30 manual reallocation, zero pool rejection, forged cache replacement, whole-baht conservation, immutable automatic rows/deletion rejection, net analytics and settlement 1200 rejected / 1000 accepted passed |
| Concurrency | Competing reservation failed promptly while lock held; over-limit attempt rejected after first commit; regression-v16.log |
| Existing SQL regressions | Core payment, atomic close, generation, default, analytics and materialized rollup suites and prior concurrency tests passed; existing-regression.log |
| Migration lifecycle | Empty rebuild, repeat no-op, checksum-tamper rejection passed; DEV validate successful, no invalid migrations |
| Current OLTP GUI manual expense | 500 saved at 60/40; SQL materialized 300/200; zero input displayed invalid; seven-field form verified |
| Current OLTP GUI normal referral | Synthetic fixed loan principal 10000 + interest 6600, full GUI repayment, closed with exactly one 660 referral; loan/borrower/referrer links correct; 396/264 allocation; no automatic edit/delete action |
| Current OLAP GUI | Same expense ledger/allocations, preserved partner layout and matching net figures; new statistics load |
| Daily Analytics | Full rebuild invoked in current DEV GUI; all 43 dates match independent old gross formulas and all 43 expense/net rows reconcile |
| Remaining GUI coverage | Cap/default/no-referrer/retry and historical contribution correction covered by isolated SQL, not all replayed in Cloud SQL through GUI. Existing contribution form exposed no Amount input during inspection; cancelled without writing. Multi-device/offline and owner acceptance unverified |

Manual test row 11450377 (+500) and documented offset 7a31a546 (-500) are retained; their net effect is zero. Two clearly named TEST BE15 borrowers and synthetic loan 3JXxkOiLCRzwCBEZoMRCQ9 remain for review. The loan has gross interest 6600 and expense 660; its test effect on DEV net profit is +5940. No real loan, payment or transfer occurred. No existing settlement was changed and no production test data was written.

After the manual offset, SQL totals are expenses 660 (A396/B264), partner gross A124713/B167365, net A124317/B167101, existing settlements A30960/B84510, available A93357/B82591. Full-rebuild evidence is in dev-final-reconciliation.jsonl and gross-analytics-reconciliation.json. These include synthetic DEV history and are not production results.

## Owner acceptance checklist

1. In DEV, add/edit a manual expense and confirm date/category/baht validation and post-sync allocation; use a documented adjustment for correction.
2. Review the TEST BE15 referral and referrer earnings; confirm original gross income and unchanged partner layout with net availability.
3. Exercise cap/no-referrer/default/retry and historical 55/45 or 70/30 corrections using controlled DEV fixtures; verify no duplicate or changed referral identity.
4. Confirm net settlement rejection/remaining limit, then Full Rebuild Daily Analytics after historical corrections and reconcile reporting.
5. Provide acceptance before Looker phase or any separately approved production promotion. Mobile/offline behavior and notification delivery are not claimed tested.
