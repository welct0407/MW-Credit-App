# R051 ordinary source CRUD — DEV candidate

Owner direction: ordinary insert/update/delete, retaining consistency checks rather than imposing a new correction/audit workflow. Deleting bookkeeping does not move money or issue a refund. Implementation and UI remain DEV-only until approval. This is a working coverage matrix, not a completion claim.

| Business record / scenario | Add | Edit | Delete / inverse | Owning UI and downstream rule |
|---|---|---|---|---|
| Borrowers | Existing | Existing identity/contact/referrer edits | Unreferenced only | Both apps where source-backed; independent loans/references prevent deletion. Existing referral expenses retain their original payee. |
| Partners | Existing role validation | Existing | Unreferenced only | OLAP; contributions, expense ratios and settlements retain referential consistency. |
| Loan assessment | Existing | Existing | Existing source operation | OLAP assessment workflow; never substitute an assessment for a loan transaction. |
| Loans | Existing Create New Loan action | Terms/source account; principal must cover received and booked principal | Unpaid loan and own unpaid charges/disbursement; receipts must first be removed/reassigned | OLTP operational form; OLAP view navigates to OLTP. Current rate recalculates; existing booked charge amounts are separate obligations. |
| Charges | Manual charge where intended; generator remains idempotent | Date, amounts, loan before receipt; amounts cannot undercut received components | Unreceived charge; linked receipt must first be reassigned/deleted | OLTP; OLAP analytics read-only/navigation. Refresh old/new parent balances. No raw edit of generated default loss entry. |
| Payments / receipts | Existing atomic posting | Amount/date/borrower/selection/target; account/method/notes | Remove own allocations, repayments and system cash; recompute parents and closure/referral | OLTP source form; OLAP read-only receipt mirror navigates to OLTP. Preserve other receipts. No new status or history framework. |
| Whole interest allocation | Through receipt | Ref Charge in either date direction, same loan, eligible capacity/date | Through receipt | No arbitrary child Add/Delete or amount edits. Principal/partial split changes use source receipt. |
| Repayments linked to receipt | Through receipt | Through receipt | Through receipt | Generated child is read-only. Existing legacy independent row edits remain distinct; no new Add that bypasses cash source. |
| Payment-owned closure / referral | Existing complete receipt | Recomputed with source correction | Reopen if debt returns, remove only generated referral/system cash | Preserve later closing receipt provenance. Independent referral reimbursements require separate correction first. |
| Loan Close preparation | Existing | Ordinary receipt correction; retain booked charge | Reverse receipt/cash/reopen; retain prepared charge for separate edit/delete | No guessed original amount. Owner approved retaining an augmented existing charge; unreceived generated final charges are also separately deletable. |
| Daily principal / historical charges | Existing | Current and backdated principal corrections supported | Same | Owner rule: recalculate current outstanding/rate, preserve later booked charges; correct those charges separately. Never regenerate historical charges automatically. |
| Default | Existing confirmation action | Defaulted=false restores recorded original charge components and removes zero-cash loss | Undo Default then ordinary loan/receipt deletion | Retain unrelated receipts/charges. Missing/changed before-values reject with a concrete reason. Existing untouched fully-paid charges remain unchanged. |
| Manual business expense | Existing | Amount/date/category/account; allocation follows date | Delete own system cash; independent reimbursement must first be corrected | OLTP source form; OLAP appropriate source/navigation. Automatic referral follows loan source. |
| Cash pool contribution | Existing | Amount/date/partner/type | Existing source deletion | OLAP. Recompute historical contribution ratios, expense allocations and snapshots; no later-repayment blanket UI lock. |
| Settlement | Existing entitlement validation | Amount/date/account/status with reservation rules | SQL delete removes own cash; existing UI Cancel/Reverse remains valid | OLAP; preserve current working Complete Transfer / Reverse Transfer / Cancel actions. |
| Manual cash handover / expense reimbursement | Existing | Date/amount/endpoints/linked expense within routing rules | Ordinary delete | OLAP manual source only; system cash remains source-managed. No bank transfer initiated. |
| Opening balances / historical cutover sources | Controlled existing admin route | Reconciled opening correction | Reconciled opening correction | Not ordinary movement forms: changing included sources otherwise doubles/loses opening cash. |
| Cash accounts | Existing | Label/bank/default/active with owner checks | Unused account; choose replacement default if needed | Both relevant source forms; used references protect accounts. |
| Cash holders | Existing metadata/active operations | Existing | Referenced operational identities protected | Fixed routing identities remain operational configuration; do not expose arbitrary destructive identity edits. |
| Per-user settings | Existing | Existing | Existing where user-owned | Nonfinancial settings, preserve ownership/security filters. |
| Calendar/statistics/analytics/forecasts/balance/statement views | Managed | Managed | Managed | Remain derived/read-only; operational navigation for source correction. |

## UI handoff and test gate

DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`; DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`. Browser baseline verifies database-3, `34.21.174.215`, `loan_manager_dev`. Do not enable new operations before matching DB migration and DEV tests pass. Preserve Create New Loan context and existing settlement cancellation/transfer actions. Built-in Edit/Delete preferred for simple sources. Do not write OLAP analytics views.

Receipt financial fields, target and selected-charge validation must be changed together, including the currently read-only Submitted Receipt Payments slice. Service-owned receipt evidence, posting totals and status stay locked. Existing unposted/new-row behavior must remain. Account holder derives from selected account; stale holder must not prevent a deliberate account correction. Database capacity/dependency checks are final authority after sync.

SQL recalculation sends no outbound messages. Browser acceptance must verify existing bot event types/conditions for both apps: metadata/no-op/correction/delete must not resend a receipt or borrower notification. Use owner-only DEV delivery or disabled external delivery per existing DEV configuration; no new notification framework is requested.

## Verification state

Backend V64 is applied and validated. Its full local migration/SQL/seven-concurrency, original/new snapshot parity and exact-head Windows CI pass. Actual DEV receipt tests, eight reused-session workflows and original combined-transaction reproduction passed with all 26 fingerprints and the then-reserved GUI baseline preserved.

Parent reports saved OLTP1.000167 / OLAP1.000049 runnable/deployable with clear editors. Bounded GUI edits and no-send conditions passed, complemented by independent source/child/cash SQL readback. Native receipt Delete failed because AppSheet first deleted a protected allocation. Later successful sync did not make that operation succeed; source and cash remain intact and GUI writes are paused.

V65 is a locally tested, unapplied Payments-only command: hidden Delete Requested Boolean, confirmed detail-only update action, then atomic ordinary DELETE inside the database. Ref/IsAPartOf and direct-child guards stay intact. No receipt-bearing Borrower/Loan/Charge cascade expansion is included. Full65-migration/eight-concurrency checks pass, but connector disappearance/save/full-sync behavior remains to prove. See the [exact plan](../outputs/r051-receipt-corrections/receipt-delete-v65-plan.json).

Expense account correction after an independent manual reimbursement lacks verified source-side revalidation; keep that case locked and do not claim broad payer correction complete. [UI proposals](../outputs/r051-receipt-corrections/source-account-ui-proposals.json) preserve existing access/default clauses and identify exact pending integration checks. Both-app broader tests, notification coverage and fixture cleanup remain required. SQL acceptance is not AppSheet acceptance. Recovery was verified with all26 restored fingerprints; private artifacts are retained. No PROD changes authorized.
