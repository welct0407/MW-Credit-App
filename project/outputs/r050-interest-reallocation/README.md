# R050 audited interest reallocation

## Repository closeout — 4 October 2026

The tested source is `1cc96775a3a8034a4a143084686f43c174e75a47`; Database migrations CI run37178314854 succeeded. The coordinating owner task confirms the scoped V57 deployment/correction completed at 05:26 UTC. Private financial before/after evidence remains outside Git. The later matching operator/audit rollout deployed V58; its [final checklist](https://github.com/welct0407/AppSheet-Loan-Project/blob/1ecbb109c6e9ee5393622453d042c6391b48dbc4/outputs/r050-production/promotion-checklist.md) records the separate scope. V57 is the immutable prerequisite, rather than a claim that production remains at V57.

The owner directly approved repository merges #3/#6/#7/#8 and MW #1 plus sanitized completion descriptions. Normal forward merges preserve source authors/history; migration/test source is unchanged from successful CI. This closeout performs no financial write, deployment, notification, power action or branch deletion. Earlier candidate/publication-blocker paragraphs below retain their dated provenance and are superseded for authorization/completion by this checkpoint.


Owner approved implementing a supported bookkeeping correction on 4 October
2026. The generic source and synthetic evidence contain no borrower/payment
production keys, private before-state, credentials or financial exports.

## Contract and design review

V57 introduces `public.reallocate_payment_interest(uuid,text,jsonb,jsonb,text,text)`.
Only a direct `postgres` administrator session/current role can execute it;
PUBLIC execution is revoked. It accepts an operation UUID, receipt key, complete
expected receipt JSON, 1–20 moves, an approval/reason reference and source version.
Each move supplies `allocation_id`, `target_charge`, `expected_allocation`,
`expected_repayment`, `expected_source_charge`, `expected_target_charge` and
`expected_loan`, all captured privately from a coherent before-state.

Scope is deliberately bounded to a Posted Lump Sum receipt, whole positive
interest allocations, zero principal, earlier charges on the same active,
nondefaulted loan, with sufficient authoritative unpaid interest. Cross-loan,
future/undated/default charges, closure-associated loans, partial moves,
duplicate allocation/target keys, stale snapshots and inconsistent receipts
fail. The operation does not close loans or create/delete receipts, allocations,
repayments or cash movements. IDs and allocation order remain stable; IDs are
opaque even if their historical text includes an original charge date.
The target charge/date and remaining-balance snapshots are updated together.

The existing cash-pool advisory lock and NOWAIT borrower/loan/charge/child locks
serialize against payment posting, parent edits and competing corrections. All
moves, refreshed charge balances and audit entries commit together. Any exception
rolls them back. Receipt, receiving account, receipt/repayment dates, total posted
and allocated, all loan fields and the receipt's cash ledger are invariant.
Existing calculation/integrity triggers stay enabled. Unchanged loan principal
means the automatic daily-interest trigger has no principal adjustment to make.

The existing append-only `agent_audit.commits` and `row_changes` retain complete
child/charge before-and-after evidence. No new table or schema is needed. Each
child transition is recorded first, then `lump_sum_child_guard` permits only that
exact table/OLD/NEW transition joined to the current transaction's postgres
operation. A caller-set session marker alone is insufficient. The boolean-only
SECURITY DEFINER guard helper uses a pinned search path and reveals no audit
contents; non-postgres callers always receive false. All other guard branches
retain V6 semantics. The correction entry point is invoker-security and checks
both session and current roles, so SET ROLE cannot obtain correction permission.
Audit permissions/roles are not broadened.

Retry with the same UUID and exact request independently compares the current
receipt and all audited child/charge after-states, returning `already_applied`
without writes. A changed request or later changed audited state fails and must
be reconciled. A new UUID against the original snapshots fails as stale.

## Tests

`Test-InterestReallocation.sql` is included in `Test-StatementBatch.sql`.
It reproduces a synthetic three-loan, two-day interest receipt, moves the newest
day to the oldest day and checks paid/unpaid charge status, receipt dates, totals,
all borrower/loan/receipt/cash records, unrelated charges, guard preservation,
PUBLIC permission denial and exact retry. Negative cases include cross-loan,
closed-loan, capacity, duplicate target, stale receipt/repayment and reused UUID.
A failure on the last move proves rollback of earlier moves and their audit.
Changed post-correction state blocks a retry.

`Test-InterestReallocationConcurrency.ps1` is wired into `Test-CI.ps1` via
`Test-Migrations.ps1`. It verifies the disposable server's data directory, then
tests advisory/borrower/charge/repayment contention, prompt failure with no audit
commit, committed retry from a fresh psql connection, unchanged source tables,
and correction denial for a restricted role. Its synthetic fixtures are retained
only until the disposable server is destroyed; no production guard is disabled
for fixture cleanup.

Cloud uses the retained, maintained Linux CI adapter with an invocation-local
copy adding the new concurrency suite; source runners remain the Windows CI
entry points. PostgreSQL 18.6 / Flyway 13.6.0 rebuild all 57 migrations, validate,
repeat migrate as a no-op, run SQL regressions and five concurrency suites,
export/normalize the schema and reject checksum tampering. See `validation.json`
for the final local run. The owner directly authorized publication, V57 deployment
after all required checks, and the scoped correction on 4 October 2026.
Publication is proceeding; GitHub Windows CI is pending.
No live DEV/PROD migration or AppSheet GUI save/test is claimed.

## Deployment status

The owner authorized deploying the exact tested correction candidate after CI,
DEV validation and verified backup/restore rehearsal, then performing the scoped
correction. The owning development/release/recovery procedures govern target
verification, release freeze, pinned migration manifests, private recovery
evidence, transaction execution and independent readback. Operational targets
and private bookkeeping evidence are deliberately omitted from this generic
source document. No merge/default push or notification is authorized.

Recovery is transactional on failure. After commit, retain append-only audit and
newer writes; use a reviewed forward correction rather than restoring a stale
database or bypassing a trigger. The initial primitive supports earlier-date
moves only. Live operational status is recorded separately after required checks.
