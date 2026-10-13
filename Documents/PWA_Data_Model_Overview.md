# PWA data model

Current native ownership, 14 October 2026. Exact definitions belong in the [dictionary](Data%20Dictionary/README.md) and immutable MW-Credit-App migrations. This is a source/evidence reconciliation, not a new live capture.

| Domain | Grain and relationships |
| --- | --- |
| Borrowers | Stable keys referenced by loans, payments and optional assessments |
| Loans | Original terms/principal/rate; charges are obligations, repayments are allocations |
| Payments | Original receipt/command; allocations link payments to charges with SQL-owned cash effects |
| Cash | Holders own accounts; source transactions produce ledger effects; openings/transfers preserve reconciliation |
| Partners | Sign-in/roles, contributions and settlements; delivery preference is separate from identity |
| Expenses | Obligations/cash effects; linked reimbursements remain independent where defined |
| Analytics | Portfolio/date and account/date snapshots plus live SQL views |
| Assessments | Stored inputs/results with freshness checks and nullable borrower linkage |

Authorized source CRUD is supported where SQL reconciles allocations, repayments, cash and ownership. Preserve later unrelated transactions/journals. Do not impose a new reversal framework or regenerate separately recorded historical charges.

Original daily interest uses frozen integer percentage points. Daily-interest principal changes use the governed original rate; fixed/installment schedules retain their rules. Unknown original terms/opening balances remain unknown.

## Native service records

The command journal stores idempotent request identity/outcome. PWA and machine entry points authenticate separately and converge on the native command boundary. Agent receipt commands supply deterministic request IDs and validated archive evidence. See [PWA/API contracts](Data%20Dictionary/systems/pwa/README.md).

Notification events, deliveries, subscriptions and preferences separate committed events from transport retries. Job runs record duplicate-safe scheduled work. These records are not additional financial receipts.

## Receipts

Payments retain manual-upload and agent evidence fields. Both use the private GCS bucket with their own validated object conventions. Manual replacement does not enqueue agent processing. Existing native references are resolved from verified mappings, never guessed filenames.

Access requires authenticated ownership/permission checks. Preserve object generations, hashes and required SQL identifiers even when historical names contain “AppSheet”.

## User flows and ownership

Operational pages cover Dashboard, Collection, Borrowers, Loans, Charges, Payments, Expenses and cash statements. Management covers partners, holders/accounts, contributions, settlements, cash movements, openings, assessments and analytics/validation. Server capabilities and Partner roles control access.

R058 adds Upcoming Charges to the selected visible Borrower detail. It reuses Collection's five upcoming charge dates, date detail and paging, including borrowers whose loans have only future charges. Forecasts remain derived read-only SQL results; viewing them does not create charges or submit borrower edits. The existing Collection membership boundary remains unchanged. This R058 capability is deployed to DEV; PROD promotion remains pending.

Google/Firebase sign-in resolves current business membership. Offline snapshots have bounded validity and do not extend authorization; commands require online confirmation. Native workers own push and scheduled jobs. Debian owns capture/review/message workflows under its service catalogue. AppSheet forms, slices, bots and editor settings are no longer maintained.

## Source correction contract

Ordinary authorized CRUD preserves SQL consistency, idempotency and affected cash/parent-child relationships. Deleting bookkeeping does not refund money. Current native APIs enforce capability and record-version checks; SQL owns downstream effects.

| Business record / scenario | Add | Edit | Delete / inverse | Owning UI and downstream rule |
|---|---|---|---|---|
| Borrowers | Existing | Existing identity/contact/referrer edits | No business dependencies | Native source-backed commands; independent loans/references prevent deletion; optional assessments unlink and retain snapshots. Existing referral expenses retain their original payee. |
| Partners | Existing role validation | Existing | Unreferenced only | management PWA; contributions, expense ratios and settlements retain referential consistency. |
| Loan assessment | Existing | Existing | Existing source operation | management PWA assessment workflow; never substitute an assessment for a loan transaction. |
| Loans | Existing Create New Loan action | Terms/source account; principal must cover received and booked principal | Unpaid loan and own unpaid charges/disbursement; receipts must first be removed/reassigned | operational PWA operational form; management PWA view navigates to operational PWA. Current rate recalculates; existing booked charge amounts are separate obligations. |
| Charges | Manual charge where intended; generator remains idempotent | Date, amounts, loan before receipt; amounts cannot undercut received components | Unreceived charge; linked receipt must first be reassigned/deleted | operational PWA; management PWA analytics read-only/navigation. Refresh old/new parent balances. No raw edit of generated default loss entry. |
| Payments / receipts | Existing atomic posting | Amount/date/borrower/selection/target; account/method/notes | Remove own allocations, repayments and system cash; recompute parents and closure/referral | operational PWA source form; management PWA read-only receipt mirror navigates to operational PWA. Preserve other receipts. No new status or history framework. |
| Whole interest allocation | Through receipt | Ref Charge in either date direction, same loan, eligible capacity/date | Through receipt | No arbitrary child Add/Delete or amount edits. Principal/partial split changes use source receipt. |
| Repayments linked to receipt | Through receipt | Through receipt | Through receipt | Generated child is read-only. Existing legacy independent row edits remain distinct; no new Add that bypasses cash source. |
| Payment-owned closure / referral | Existing complete receipt | Recomputed with source correction | Reopen if debt returns, remove only generated referral/system cash | Preserve later closing receipt provenance. Independent reimbursement transfers retain their amount/endpoints and unlink deleted expense history. |
| Loan Close preparation | Existing | Ordinary receipt correction; retain booked charge | Reverse receipt/cash/reopen; retain prepared charge for separate edit/delete | No guessed original amount. Owner approved retaining an augmented existing charge; unreceived generated final charges are also separately deletable. |
| Daily principal / historical charges | Existing | Current and backdated principal corrections supported | Same | Owner rule: recalculate current outstanding/rate, preserve later booked charges; correct those charges separately. Never regenerate historical charges automatically. |
| Default | Existing confirmation action | Defaulted=false restores recorded original charge components and removes zero-cash loss | Undo Default then ordinary loan/receipt deletion | Retain unrelated receipts/charges. Missing/changed before-values reject with a concrete reason. Existing untouched fully-paid charges remain unchanged. |
| Manual business expense | Existing | Amount/date/category/account; allocation follows date | Delete own system cash; retain and unlink independent reimbursement | operational PWA source form; management PWA appropriate source/navigation. Automatic referral follows loan source. |
| Cash pool contribution | Existing | Amount/date/partner/type | Existing source deletion | management PWA. Recompute historical contribution ratios, expense allocations and snapshots; no later-repayment blanket UI lock. |
| Settlement | Existing entitlement validation | Amount/date/account/status with reservation rules | SQL delete removes own cash; existing UI Cancel/Reverse remains valid | management PWA; preserve current working Complete Transfer / Reverse Transfer / Cancel actions. |
| Manual cash handover / expense reimbursement | Existing | Date/amount/endpoints/linked expense within routing rules | Ordinary delete | management PWA manual source only; system cash remains source-managed. No bank transfer initiated. |
| Opening balances / historical cutover sources | Controlled existing admin route | Reconciled opening correction | Reconciled opening correction | Source correction automatically reconciles the captured opening using recorded attribution or the approved Lisa default; no historical full repost. |
| Cash accounts | Existing | Label/bank/default/active with owner checks | Unused account; choose replacement default if needed | Both relevant source forms; used references protect accounts. |
| Cash holders | Existing metadata/active operations | Existing | Referenced operational identities protected | Fixed routing identities remain operational configuration; do not expose arbitrary destructive identity edits. |
| Per-user settings | Existing | Existing | Existing where user-owned | Nonfinancial settings, preserve ownership/security filters. |
| Calendar/statistics/analytics/forecasts/balance/statement views | Managed | Managed | Managed | Remain derived/read-only; operational navigation for source correction. |

Use the actual native command/UI contracts and canonical SQL tests for changed behavior. This business-rule summary does not authorize production writes or establish a fresh runtime test. No AppSheet GUI verification applies.
