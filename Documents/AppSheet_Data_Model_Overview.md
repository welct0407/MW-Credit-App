# Production model overview

## R036 daily-interest adjustment — DEV only

DEV V45 retains the original daily-interest ratio as a readable note in existing Loans.Loan Arrangement text; no new column/table. New daily-interest loans capture their starting amount/principal. Existing loans initialize on a future principal change using the first-day charge less recorded transfer fee, or prior current amount/outstanding ratio when first-day evidence is unavailable. No bulk backlog correction. PostgreSQL updates Current Daily Interest, Expected Daily Interest Amount and borrower rollups after authoritative signed repayments. Adjusted amounts round to whole baht and reach zero on payoff; the exact ratio survives rounding/reversals. Posted charges stay unchanged; uncharged intervals retain the owner's current-rate convention. Fixed-interest/installment behavior is unchanged.

DEV OLTP accepts calculated zero and makes the daily amount read-only once the note exists; ordinary arrangement text stays editable. DEV OLAP/current-interest reporting providers read the same amount. PROD remains V44. [Exact contract, inference limits and tests](../outputs/r036-principal-interest/README.md).

## R028 reporting-only automatic schedule assessment

Three additional PostgreSQL views compare normal current loan setup with recorded charge amounts/frequency and derive schedule-aware borrower categories automatically. No AppSheet binding, operational column or financial data changes. Existing payment-health scores remain measured payment compliance; a separate modified-schedule rule restricts upper categories in matrix V3. V2 remains available for comparison. [Rule, boundaries and evidence](../outputs/r028-schedule-health/README.md).

## R027 shared payment-health foundation

DEV and PROD PostgreSQL compute signed-ledger charge coverage, borrower overdue balances, historical reliability and independent BCG axes. Metabase tab 31 consumes the new providers for review while legacy tabs remain unchanged. Default-altered history suppresses ratings while preserving debt/default context. Two read-only SQL adapters are available for future OLTP integration, but no AppSheet binding or UI is enabled. [Contract and evidence](../outputs/r027-payment-health/README.md).

## Architecture and ownership

Each DEV/PROD environment has two AppSheet apps sharing one PostgreSQL database. OLTP owns transaction entry and operational workflows; OLAP owns partner management, cash administration and heavier analytics. Looker presents governed reporting. RC is a temporary app copy bound to PROD, not a separate database. Design decisions and diagrams are in [Solution Design](Solution_Design.md).

R016 established ten canonical pages, 129 visual placements, 117 distinct questions, 15 active models / 228 fields and four snippets. Original tabs 2/9/10 are replaced by Cash Position (14), Income Statement (16) and Cashflow Statement (15), now ordered as pages 2/3/4, with later tabs shifted back. Fourteen unused questions and seven models are recoverably archived after dependency checks. DEV/PROD are V39; AppSheet and financial rows are unchanged.

Cash Position keeps today/live and past/snapshot routing. Income and Cashflow statement totals and detail remain live for every selected period. Their separately labeled completed-day trends use stored portfolio/account snapshots, with missing-day counts and actual refresh times. Income excludes principal, capital movements and partner payments; no FIFO distributions or retained-profit bridge appears. Cashflow uses a fresh source opening seed and selected-period running balances. Transfers cancel only in All accounts; unknown balances remain unavailable. The database retains superseded providers for compatible rollback under expand/contract. [canonical cash statements](../outputs/r016-20260922/statement-cleanup/README.md).

## Entity groups and relationships

Historical V34 ownership migration introduced the original statement reporting views. V38/V39 now provide focused live statement periods; unused Metabase models are archived, while database providers remain compatible for rollback. FIFO remains part of operational partner settlement logic, outside the canonical Income Statement.

The integration agent additionally owns the separate `mw_agent` database on the same Cloud SQL instance. Its runtime journals and append-only audit are excluded from AppSheet. Business databases contain internal `agent_audit` commit/row-change/export tables; capture runs only for the dedicated reviewer DML login. AppSheet operations retain ordinary guards and host-observed audit coverage. Current reviewers use AppSheet first and bounded SQL fallback, including approved exact-key DELETE without bypassing financial or reference guards. See [R015 evidence](../outputs/r015-20260922/production-report.md) and the dictionary PostgreSQL records.

| Group | Entities / grain | Responsibility |
| --- | --- | --- |
| Lending | Borrowers; Loans per borrower; Charges per loan; Repayments per posted allocation | OLTP entry; SQL posting and derived balances |
| Receipts | Payments per receipt; Payment Allocations per receipt/charge | OLTP requests; SQL allocation, posting and retry identity |
| Partner economics | Partners; Cash Pool Contributions; Settlements; Business Expenses | OLAP partner/settlement management; OLTP manual expense entry; SQL allocation/limits |
| Custody | Cash Holders; Cash Accounts; Cash Ledger; holder/account balance views | OLAP cash administration; source events produce deterministic SQL movements |
| Reporting/control | Statistics; Loan Form Context; Portfolio Summary; Daily Analytics; Loan Assessment | Read-only SQL providers except explicit control/input rows |

Row IDs are immutable case-sensitive text, not provider row ordinals. Loans reference Borrowers; Charges reference Loans; Allocations connect Payments to Charges; Repayments retain loan/charge/payment/allocation trace. Cash Accounts reference Cash Holders; operational account fields reference Cash Accounts. AppSheet Ref/part-of behavior and SQL foreign keys are distinct. Optional blank references are normalized before constraints. Exact relationship inventory and delete/update behavior stay in the dictionary.

## Financial behavior

- SQL owns posting, retries, borrower locking and persisted balances. Payments are receipts, Allocations are processing snapshots and Repayments are posted principal/interest; row existence alone is not payment completion. AppSheet retains lightweight form feedback and command entry.
- The three loan types retain their documented charge/repayment rules, first-day behavior, early-closure/default guards and date rules. Daily charge requests use Bangkok business dates; interval loans retain the approved schedule anchor. Common daily generation and analytics requests are monitored through AppSheet. Calendar is no longer an app source.
- Twenty-four operational derived fields are SQL-maintained and read-only. Eligibility VCs evaluate Processing/Error receipts; Posted receipts avoid redundant eligibility scans. Visible allocations retain positive amounts. The loan form capacity rule uses signed contributed capital less outstanding principal, with SQL enforcing concurrency.
- Manual Business Expenses preserve audit/source identity and signed adjustments. Historical contribution positions allocate expenses at the relevant expense/close date; rounding leaves shares reconcilable to the amount. A qualifying fully repaid, non-defaulted referred loan with a posted closing receipt generates one 10% realized-interest rebate capped at 1,000, with deterministic retry identity and no historical backfill. The bilingual referral category does not change allocation.
- Partner net entitlement subtracts allocated expenses. Net availability reserves Pending settlements; SQL guards concurrent over-reservation. Settlement Delete is an audited cancellation/reversal, not physical deletion. Cancelled rows are excluded from reservations and the app's active settlement population.
- Custody is separate from capital/profit entitlement. Positive holder balance is business cash held; negative is reimbursement/advance due. Loan disbursement, receipt, expense and completed-settlement sources produce deterministic cash movements; repayments/charges do not independently duplicate cash.

## Cash accounts and commands

**R014 production:** SQL V31 supplies a one-row, read-only Cash Dashboard for Bangkok month-to-date income, signed expenses, net profit, signed Tommy/Lisa withdrawals allocated to this month, unsettled profit, available cash pool and positive initialized account custody. Completed settlements consume each partner's cumulative prior-month net entitlement from the start of business before current-month profit. Pending reservations are not withdrawals; cancelled settlements are excluded. Historical losses offset net entitlement. Unsettled profit equals current net profit less those allocated withdrawals. No Profit Month field or new base table/column is introduced for these metrics.

OLTP reads these metrics and existing Cash Account Balances; heavy calculations stay in SQL. Business Cash Held lists each account's Current Balance grouped by owner with SUM, while the dashboard business-cash metric sums positive account custody and remains unavailable for unknown opening balances. Income is green, expenses/withdrawals red, and balances blue; actual negative net results are never hidden. OLAP adds a positive exact-amount Pending settlement form alongside settle-all, using existing validation and database reservation guards. Cash Ledger account pickers cannot create accounts; standalone OLAP account administration retains adds/updates. [R014 production evidence](../outputs/r014-20260921/production-report.md).

R014 refinements also exclude inline Cash Account creation in Settlements forms. Both Borrowers lists group by the existing Has Active Loan flag through a lightweight bilingual activity label, Active first, and use Total Outstanding Principal below the borrower name. Existing visibility filters are retained. All detail views in both apps disable slideshow record navigation; list swipe events remain unassigned. These are AppSheet presentation changes, with no database schema or posting change. [Exact DEV settings and coverage](../outputs/r014-20260921/refinements.json).

Cash Accounts has immutable holder identity and active defaults. OLAP owns adds/updates; OLTP consumes it read-only. Nullable account references preserve historical holder-only rows. The preferred receipt account falls back to the active Dad default; loan disbursement/first-day custody follows the selected Lisa account. Positive manual expenses require a matching active payer account; settlements retain their selected account.

V29 adds optional text `Cash Accounts.Alternative Account Number`, alongside `Account Number`, so two bank/PromptPay identifiers can represent one cash account without splitting balances. OLAP edits it; OLTP reads it. The future receipt-summary agent must resolve unambiguous active-account matches and remains unimplemented; this schema change creates no payments or notifications. [R011 evidence](../outputs/r011-20260920/production/REPORT.md).

Receive All, Receive Full and Loan Close submit account plus fresh request token through dedicated update-only command slices. SQL recomputes eligibility and posts atomically. Notifications use the exact originating receipt/token. A Posted receipt may correct receiving custody with an appended reason without reposting allocations/repayments; other posted dimensions remain protected. Manual transfers support same-holder/different-account movements.

Holder/account balance views are read-only. Account cutover/opening tables remain SQL-only. Initialization requires an explicit reconciled allocation; uninitialized amounts remain NULL rather than invented zero. Current initialization status is in Environment Inventory. DEV fixtures never establish PROD opening amounts.

## Analytics and assessment

OLAP Borrowers, Loans, Charges and Repayments use read-only SQL analytical views while preserving logical names, keys, labels, reporting grain and lightweight presentation/Ref VCs. Portfolio Summary supplies heavy Statistics metrics; Statistics remains the control row for analytics refresh. Existing reporting slices retain their contracts.

R016 DEV/PROD V37 adds a stored account/date companion and daily cash/capital/partner inputs to Daily Analytics. The existing hourly command and full/manual history rebuild use one atomic SQL engine; Recent covers yesterday/today. Model 3 retains partial-payment charge residuals. Current operational sources remain live and unchanged; 2R integration now routes today to live OLAP and past dates to stored snapshots. [Contract](../outputs/r016-20260922/daily-snapshots/README.md).

Daily Analytics persists governed gross/net daily measures. Rebuild from the earliest affected date through today after historical corrections; source expense allocations recalculate through their SQL rules. R009 effective daily interest rate uses outstanding principal, returning zero for nonpositive balances, in OLTP presentation and the OLAP SQL loan view.

Loan Assessment exposes stored SQL results with source/input/date freshness guards. Saving inputs invokes calculation/stamping; ordinary sync does not recalculate unchanged inputs. Shared-input and forecast-horizon limits are retained in its dated evidence; no new assumption is introduced here. Exact fields/formulas and provider bindings stay in the dictionary.

## Notifications and presentation

Partners.Login Email uniquely identifies sign-in after normalized matching; Partners.Email is the possibly shared delivery address. Transaction Created By/Closed By resolves to Partner Row ID, that partner is excluded, and nonblank delivery addresses are deduplicated. Unknown actors yield no recipients. The bot runner is not the actor. Closure summaries require positive closures of the exact receipt and show Loan Key.

Native borrower Refs provide detail navigation in Loans, Charges and Repayments. Receive All remains inline in Collection and excluded from Detail views. Loan Key labels may reflect the current effective rate. Environment-specific delivery, links and colors follow AGENTS, not duplicated formulas here.

## Current R010 behavior

R010 adds bilingual form validation for required receipt inputs, appended correction reasons and ineligible quick commands. It was promoted to PROD OLTP 3.000235 with SQL V27 on 20 September 2026. Exact expressions and release evidence are in the dictionary and [R010 production record](../outputs/r010-20260919/production/REPORT.md).

R010 also adds an OLTP Cash Statement dashboard for the latest 15 Bangkok dates. SQL V27 expands Cash Ledger into account-side effects, computes running balances over all history before limiting recent rows, and supplies daily summaries including zero-movement dates. Initialized balances use the governed opening-minus-captured-baseline contract; unknown balances remain NULL. Source tables enrich labels/Refs only. Full history and cash administration remain in OLAP.

A non-financial Cash Statement Context row per Partner stores account/date selection. SQL seeds it on Partner creation; OLTP restricts it by normalized Login Email and permits only preference updates. Read-only slices select the account/day. English/Thai labels and borrower-description fallback are lightweight presentation expressions. No posting, opening initialization, notification routing or source-transaction edit ownership changes.

## Borrower operations and localization

OLTP stores an optional persistent note directly on each Borrower. Collectors can quick-edit it below the daily collection totals to record requests or follow-up information; it remains attached to that borrower across days. Editing the note does not change payment terms, charges or balances. This is one editable current note, not a dated note-history table. English Name (`Description`) is required in OLTP borrower forms. The new-borrower form uses Thai-first bilingual display names for Borrower Name, English Name, Preferred Receiving Cash Account, Instagram Username, AI Collection Enabled and Address. In both apps, AppSheet system text follows the signed-in Partner record: `English` selects the platform English text and `ไทย` selects Thai, with Thai also used as the blank/unexpected fallback. Identity resolves through `USEREMAIL()` and `Partners[Login Email]`; delivery email is not used. OLAP's analytical borrower view and editing ownership are unchanged. R011 also makes OLAP Cash Ledger Recent operationally useful by showing movement date/time, resolved borrower/payer, holder/account routing, payment/loan/source/note and creator context. [R011 production evidence](../outputs/r011-20260920/production/REPORT.md).

## Maintenance and evidence

Update this overview only when architecture, relationships, ownership or explained business behavior changes. An exact formula/property change updates the owning dictionary object and the release log; it does not require rewriting unchanged prose. Keep one current explanation, without appending a release narrative. SQL changes remain immutable Flyway migrations under [database procedure](../database/README.md#each-change).

Detailed prior checkpoints, unique decisions and dated limitations are preserved in the [pre-cleanup overview](archive/2026-09-20/AppSheet_Data_Model_Overview.md) and linked release logs. The dictionary retains dated exact configuration evidence where it is not redundant; latest applicable verified values take precedence. No model recapture or live behavioral validation was performed by this restructuring.

## Receipt transfer time — R013 production

Owner clarification, 21 September 2026: use existing Payments.Payment Date and Payments.Created At for the receipt transfer date/time, without new audit columns. Production and DEV V30 make new system Payment ledger entries inherit Payments.Created At, falling back to current Bangkok time when absent. Other sources, update guards and existing rows are unchanged. Cash Ledger.Created At remains the shared source for statement Sort Timestamp and Statement Time. OLTP and the 00:15 agent PNG display hours/minutes only. The agent prepares these values in summary-only mode; automatic payment creation remains disabled. [R013 production verification](../outputs/r013-20260921/production/REPORT.md).

## R014 Partner reviewer role

Partners.AI Reviewer is a non-null Yes/No flag, false by default. Tommy initially has Yes and Lisa No. OLAP owns maintenance in Partners_Form and displays the flag in Partners_Detail; OLTP imports it read-only. The integration agent uses current reviewer membership for payment review requests, approval/rejection and pre-posting checks. Existing daily summaries, Partner result notices and IG preferences retain their routing. No reviewer means the validated receipt waits; non-reviewer replies cannot decide a payment. Closures and overpayments remain manual-only. Production V32 and the coordinated agent update were deployed on 21 September; no borrower-level reviewer assignment is introduced.
