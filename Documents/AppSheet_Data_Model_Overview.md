# Production model overview

This document explains architecture and business behavior. Exact columns, expressions, types, permissions, Refs and SQL metadata belong in the [data dictionary](AppSheet_Data_Dictionary.xlsx); current versions/identities belong in [Environment Inventory](Environment_Inventory.md). Recorded production baseline: R015. Changes since that baseline are listed in [Development Changes](Development_Changes.md).

## Architecture and ownership

Each DEV/PROD environment has two AppSheet apps sharing one PostgreSQL database. OLTP owns transaction entry and operational workflows; OLAP owns partner management, cash administration and heavier analytics. Looker presents governed reporting. RC is a temporary app copy bound to PROD, not a separate database. Design decisions and diagrams are in [Solution Design](Solution_Design.md).

R016 has nine reporting pages available for owner review. Sixteen reusable Metabase models centralize borrower/loan/repayment/charge relationships, collection worklists, partner shares, reporting periods and shared calculations over existing PROD sources. Of 122 dashboard questions, 109 use model-backed query-builder definitions; three proposed-loan visuals reuse one scenario snippet, and ten Income Statement visuals reuse one selected-period statement snippet. Models cannot contain input variables. Period income and expenses aggregate independently; the existing FIFO rule allocates completed partner draws after earlier net profit. Current cash custody remains separate from period earnings. Joins and period/scenario calculations are centralized. Financial posting and governed source balances remain owned by PostgreSQL. Exact reporting fields and semantic relationships are in the dictionary's **Metabase Models** sheet and [model inventory](../outputs/r016-20260922/models.json).

## Entity groups and relationships

R016 V34 moves the six Income Statement model queries into database-owned reporting views in DEV and PROD. Metabase retains the same model IDs and field metadata but reads each view directly. Heavy joins, source aggregation and running balances are defined in the immutable database migration; period filtering, simple totals/ratios and invocation of the existing FIFO function remain in the report query. Both the earlier model SQL and these views execute in PostgreSQL. Ordinary views stay live and do not precompute or cache results.

The integration agent additionally owns the separate `mw_agent` database on the same Cloud SQL instance. Its runtime journals and append-only audit are excluded from AppSheet. Business databases contain internal `agent_audit` commit/row-change/export tables; capture runs only for the dedicated reviewer DML login. AppSheet operations retain ordinary guards and host-observed audit coverage. Current reviewers use AppSheet first and bounded SQL fallback, including approved exact-key DELETE without bypassing financial or reference guards. See [R015 evidence](../outputs/r015-20260922/production-report.md) and the dictionary DB sheets.

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

Daily Analytics persists governed gross/net daily measures. Full rebuild is needed after historical corrections; source expense allocations recalculate through their SQL rules. R009 effective daily interest rate uses outstanding principal, returning zero for nonpositive balances, in OLTP presentation and the OLAP SQL loan view.

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

Update this overview only when architecture, relationships, ownership or explained business behavior changes. An exact formula/property change updates dictionary rows and the release log; it does not require rewriting unchanged prose. Keep one current explanation, without appending a release narrative. SQL changes remain immutable Flyway migrations under [database procedure](../database/README.md#each-change).

Detailed prior checkpoints, unique decisions and dated limitations are preserved in the [pre-cleanup overview](archive/2026-09-20/AppSheet_Data_Model_Overview.md) and linked release logs. The dictionary retains dated exact configuration evidence where it is not redundant; latest applicable verified values take precedence. No model recapture or live behavioral validation was performed by this restructuring.

## Receipt transfer time — R013 production

Owner clarification, 21 September 2026: use existing Payments.Payment Date and Payments.Created At for the receipt transfer date/time, without new audit columns. Production and DEV V30 make new system Payment ledger entries inherit Payments.Created At, falling back to current Bangkok time when absent. Other sources, update guards and existing rows are unchanged. Cash Ledger.Created At remains the shared source for statement Sort Timestamp and Statement Time. OLTP and the 00:15 agent PNG display hours/minutes only. The agent prepares these values in summary-only mode; automatic payment creation remains disabled. [R013 production verification](../outputs/r013-20260921/production/REPORT.md).

## R014 Partner reviewer role

Partners.AI Reviewer is a non-null Yes/No flag, false by default. Tommy initially has Yes and Lisa No. OLAP owns maintenance in Partners_Form and displays the flag in Partners_Detail; OLTP imports it read-only. The integration agent uses current reviewer membership for payment review requests, approval/rejection and pre-posting checks. Existing daily summaries, Partner result notices and IG preferences retain their routing. No reviewer means the validated receipt waits; non-reviewer replies cannot decide a payment. Closures and overpayments remain manual-only. Production V32 and the coordinated agent update were deployed on 21 September; no borrower-level reviewer assignment is introduced.
