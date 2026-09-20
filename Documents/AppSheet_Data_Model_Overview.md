# Production model overview

This document explains architecture and business behavior. Exact columns, expressions, types, permissions, Refs and SQL metadata belong in the [data dictionary](AppSheet_Data_Dictionary.xlsx); current versions/identities belong in [Environment Inventory](Environment_Inventory.md). Recorded production baseline: R009. Changes since that baseline are listed in [Development Changes](Development_Changes.md).

## Architecture and ownership

Each DEV/PROD environment has two AppSheet apps sharing one PostgreSQL database. OLTP owns transaction entry and operational workflows; OLAP owns partner management, cash administration and heavier analytics. Looker presents governed reporting. RC is a temporary app copy bound to PROD, not a separate database. Design decisions and diagrams are in [Solution Design](Solution_Design.md).

## Entity groups and relationships

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

Cash Accounts has immutable holder identity and active defaults. OLAP owns adds/updates; OLTP consumes it read-only. Nullable account references preserve historical holder-only rows. The preferred receipt account falls back to the active Dad default; loan disbursement/first-day custody follows the selected Lisa account. Positive manual expenses require a matching active payer account; settlements retain their selected account.

Receive All, Receive Full and Loan Close submit account plus fresh request token through dedicated update-only command slices. SQL recomputes eligibility and posts atomically. Notifications use the exact originating receipt/token. A Posted receipt may correct receiving custody with an appended reason without reposting allocations/repayments; other posted dimensions remain protected. Manual transfers support same-holder/different-account movements.

Holder/account balance views are read-only. Account cutover/opening tables remain SQL-only. Initialization requires an explicit reconciled allocation; uninitialized amounts remain NULL rather than invented zero. Current initialization status is in Environment Inventory. DEV fixtures never establish PROD opening amounts.

## Analytics and assessment

OLAP Borrowers, Loans, Charges and Repayments use read-only SQL analytical views while preserving logical names, keys, labels, reporting grain and lightweight presentation/Ref VCs. Portfolio Summary supplies heavy Statistics metrics; Statistics remains the control row for analytics refresh. Existing reporting slices retain their contracts.

Daily Analytics persists governed gross/net daily measures. Full rebuild is needed after historical corrections; source expense allocations recalculate through their SQL rules. R009 effective daily interest rate uses outstanding principal, returning zero for nonpositive balances, in OLTP presentation and the OLAP SQL loan view.

Loan Assessment exposes stored SQL results with source/input/date freshness guards. Saving inputs invokes calculation/stamping; ordinary sync does not recalculate unchanged inputs. Shared-input and forecast-horizon limits are retained in its dated evidence; no new assumption is introduced here. Exact fields/formulas and provider bindings stay in the dictionary.

## Notifications and presentation

Partners.Login Email uniquely identifies sign-in after normalized matching; Partners.Email is the possibly shared delivery address. Transaction Created By/Closed By resolves to Partner Row ID, that partner is excluded, and nonblank delivery addresses are deduplicated. Unknown actors yield no recipients. The bot runner is not the actor. Closure summaries require positive closures of the exact receipt and show Loan Key.

Native borrower Refs provide detail navigation in Loans, Charges and Repayments. Receive All remains inline in Collection and excluded from Detail views. Loan Key labels may reflect the current effective rate. Environment-specific delivery, links and colors follow AGENTS, not duplicated formulas here.

## Open DEV behavior

R010 adds bilingual form validation for required receipt inputs, appended correction reasons and ineligible quick commands. PROD remains R009. Exact unpromoted expressions and test/approval status are in the dictionary and [R010 record](../outputs/r010-20260919/REPORT.md); do not relabel them production.

R010 also adds an OLTP Cash Statement dashboard for the latest 15 Bangkok dates. SQL V27 expands Cash Ledger into account-side effects, computes running balances over all history before limiting recent rows, and supplies daily summaries including zero-movement dates. Initialized balances use the governed opening-minus-captured-baseline contract; unknown balances remain NULL. Source tables enrich labels/Refs only. Full history and cash administration remain in OLAP.

A non-financial Cash Statement Context row per Partner stores account/date selection. SQL seeds it on Partner creation; OLTP restricts it by normalized Login Email and permits only preference updates. Read-only slices select the account/day. English/Thai labels and borrower-description fallback are lightweight presentation expressions. No posting, opening initialization, notification routing or source-transaction edit ownership changes.

## Maintenance and evidence

Update this overview only when architecture, relationships, ownership or explained business behavior changes. An exact formula/property change updates dictionary rows and the release log; it does not require rewriting unchanged prose. Keep one current explanation, without appending a release narrative. SQL changes remain immutable Flyway migrations under [database procedure](../database/README.md#each-change).

Detailed prior checkpoints, unique decisions and dated limitations are preserved in the [pre-cleanup overview](archive/2026-09-20/AppSheet_Data_Model_Overview.md) and linked release logs. The dictionary retains dated exact configuration evidence where it is not redundant; latest applicable verified values take precedence. No model recapture or live behavioral validation was performed by this restructuring.
