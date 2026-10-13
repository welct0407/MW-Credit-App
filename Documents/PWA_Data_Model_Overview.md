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

Google/Firebase sign-in resolves current business membership. Offline snapshots have bounded validity and do not extend authorization; commands require online confirmation. Native workers own push and scheduled jobs. Debian owns capture/review/message workflows under its service catalogue. AppSheet forms, slices, bots and editor settings are no longer maintained.