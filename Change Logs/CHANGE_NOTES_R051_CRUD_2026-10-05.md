# R051 — Ordinary business source CRUD

Status: V59–V62 applied DEV; V63 locally validated and pending coordinated DEV apply/test. Browser tests and final cleanup remain in progress; R051 remains Open. No PROD writes, runtime deployment, merge or release freeze authorized/performed.

The owner replaced the earlier history-heavy reversal proposal with ordinary INSERT/UPDATE/DELETE for this two-person prototype, then expanded coverage to appropriate operations in both apps and all real business entities. Parent/child relationships and useful cascades must be retained as far as possible. Existing role permissions and necessary consistency/duplicate/concurrency checks remain.

Owner decisions: deleting a Loan Close receipt reverses its payment/cash effects and reopens the loan where debt remains, while an augmented/prepared charge remains separately editable. Correcting an older daily principal receipt changes current outstanding/rate but leaves later recorded charges unchanged; no retrospective regeneration. Existing working settlement Cancel/Reverse actions need not be replaced.

V59 owns receipt/source correction, old/new parent refresh, source-specific cash deletion, payment-caused reopen/referral cleanup, same-loan whole-interest movement in both directions, selected-charge reposting and closure date correction. V60 covers ordinary manual expense/cash/settlement/account/source operations, default undo from known components, source dependency validation and existing historical snapshot refresh. V61 narrows historical refresh to meaningful source fields/dates and rejects cash-changing edits to sources already included in opening balances. V62 scopes date-specific planning to the existing analytics refresh function after actual DEV testing exposed a generic-plan timeout; formulas/ranges remain intact. No new business schema fields/statuses, grants, central operational intents or notification sends.

Recovery and actual testing results, migration hashes and publication pins belong in [evidence](../outputs/r051-receipt-corrections/README.md). [Scenario matrix](../Documents/R051_CRUD_Scenarios.md) includes existing vs new behavior, ownership and remaining restrictions. [DEV dictionary](../Documents/Data%20Dictionary/DEV_R051_CRUD.md) distinguishes this candidate from production exports.

All script, migration, test, formula and fix authoring uses owner-requested GPT-6 Astra High. Root coordination/review is read-only. The companion MW-Integration-Agent worktree remains unchanged; simplified CRUD needs no companion/runtime change.

V63 batches repeated historical refreshes without a persistent queue, retaining a deferred fallback for referral and expense-share changes. Full 63-migration CI, seven concurrency suites, seeded historical-opening checks and canonical consolidated/account snapshot comparisons pass. A restored-DEV data benchmark complements disposable tests; actual live performance/full-suite proof remains pending.
