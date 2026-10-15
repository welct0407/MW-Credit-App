# R047 — Receive Selected Charges: design and implementation handover

27 September 2026 · **Implemented and verified in DEV.** See [the implementation, saved versions, tests and recovery](IMPLEMENTATION.md). The proposal below is retained as dated design evidence; its implementation-pending statements describe the original design stage. Owner review and production promotion remain pending.

## Design summary

Yes. Add **Receive Selected Charges** to OLTP Collection: choose a borrower, select specific unpaid/part-paid charges, review their combined remaining balance, and save **one Payment** that fully settles just those charges. Reuse the existing SQL payment engine, allocation snapshots, Repayments and cash ledger. Keep all six existing receiving methods available.

Recommended first version: selection inside a dedicated Payment form launched from Collection, using a multi-select charge picker. Direct checkboxes in the existing inline charge table are a separate UX requirement to prove, not an already verified capability. The user has requested design and handover; this document makes no claim of live implementation or production authorization.

The current tracker has **R047 Open** and **R046 Frozen**, with its receipt backend deployed and AppSheet receipt UI awaiting integrated promotion. This feature joins R047. Do not reopen R046 or allocate R048 for this work. It can travel in the same integrated AppSheet promotion as the pending R046/R047 UI, subject to scoped promotion authorization and normal release capture. Re-read the tracker before implementation because other work may advance it.

## Evidence and boundaries

Read-only design baseline: Git `bb192ed6cf7ec5f75ab0c526d4174685cd51d376`, maintained dictionary observations and subsequent release evidence. No live app/database audit was performed for this design.

| Evidence | Implication |
| --- | --- |
| [Payments definition](../../Documents/Data%20Dictionary/systems/appsheet/oltp/tables/payments.yaml) | `Allocation Method` currently lists `Single Full`, `Single Partial`, `Receive All`, `Lump Sum`, `First-day Auto`, `Loan Close`. This is a new allocation/receiving method; `Payment Method` such as Bank Transfer is a separate dimension. |
| [Receive Lump Sum action](../../Documents/Data%20Dictionary/systems/appsheet/oltp/actions/borrowers-receive-lump-sum-3c97c529.yaml) | Borrower action opens `Payments_Form` with borrower, date, Bank Transfer and Lump Sum preset. This is the closest entry pattern. |
| [Core payment migration V6](../../database/migrations/V6__core_payment_transaction.sql) | `payment_charge_balances`, `post_payment`, receipt/child guards and deterministic allocation identities already support one receipt over many charges. The explicit method allowlist and scope logic need extension. |
| [Cash accounts V23](../../database/migrations/V23__cash_accounts_and_payment_requests.sql), [timestamps V30](../../database/migrations/V30__payment_receipt_transaction_time.sql) | Reuse account/holder validation and one receipt-sourced cash movement. Retain payment date and transfer-time semantics. |
| [Borrowers definition](../../Documents/Data%20Dictionary/systems/appsheet/oltp/tables/borrowers.yaml) | `Todays Collection Charges` includes outstanding charges due through today, plus certain charges paid today. The visible list is therefore broader than the selectable unpaid population. |
| [R047 existing DEV handover](../r047-collection-receipts/HANDOVER.md) | Collection already has the receipt section. Last recorded versions are DEV OLTP 1.000098 / OLAP 1.000036; these are dated evidence, not a new rollback capture. Preserve those changes. |
| [Solution Design](../../Documents/Solution_Design.md), [Model Overview](../../Documents/AppSheet_Data_Model_Overview.md) | OLTP owns entry; SQL owns posting and persisted balances; OLAP is an affected read consumer. |

All new object/field/method names below are **proposed**, not discovered live objects. Existing dictionary values are dated observations. Inspect affected current definitions before editing, including later changes to the original migration's routines and surrounding triggers.

## Collector workflow

1. Open **Collection**, select one borrower and use **รับชำระรายการที่เลือก / Receive Selected Charges** beside the charge-list workflow.
2. Open a dedicated form based on the existing `Payments` table, provisionally `Receive Selected Charges_Form`. Lock the borrower and preset `Allocation Method = Selected Charges`. Keep existing payment/account defaults.
3. Select one or more eligible charges in a multi-select list. Display recognizable loan key, charge date and remaining amount; multiple loans are allowed only for this same borrower. Show selected count, interest subtotal, principal subtotal and total to receive. Preserve existing labels where usable; scope any new display label to this picker where possible.
4. Review the actual amount received, receiving cash account, payment date/transfer time, payment method, bank reference and notes through existing receipt controls. Default the amount to the selected total, but require the confirmed received amount to equal that total. Selection changes must visibly refresh the total and invalidate any mismatching amount; never silently retain a stale default.
5. Save once. SQL validates and posts atomically. After sync, show the single Payment detail and its allocations. Only report success when its server status is `Posted` and the amounts reconcile. The selected charges disappear from the unpaid picker, although the existing Collection list may still display them as paid today.
6. Cancelling the unsaved form writes no Payment or financial results. Never create a persistent `Processing` receipt just to hold a selection; existing posting triggers would run too early.

Illustrative synthetic example:

| Charge | Remaining | Selected | Result |
| --- | ---: | --- | --- |
| A, older charge | ฿400 | No | ฿400 remains |
| B | ฿200 | Yes | Fully settled |
| C, already partly paid | ฿150 | Yes | Only its remaining ฿150 is settled |
| D, another loan of the same borrower | ฿300 | Yes | Fully settled |

Result: one ฿650 Payment, three positive allocations, three linked Repayments, and the existing receipt-level cash effect once. No allocation to A, even if it would have been considered by another method.

## Behavior contract for the first version

| Rule | Proposed behavior |
| --- | --- |
| Scope | Explicit selected immutable Charge Row IDs; never infer selection from amount, dates, notes, list order or all borrower debt. |
| Borrower | Exactly one borrower per Payment. Reject cross-borrower IDs, including IDs supplied outside the UI. |
| Eligible charges | Existing accessible charges belonging to that borrower, with positive outstanding amount and valid nonnegative principal/interest components; charge date must be on/before the payment date. |
| Dates | Default payment date to today in the existing Bangkok business-date convention; reject future payments and charges later than the chosen date. Future-charge prepayment is outside this first version. Changing the date requires selection revalidation. |
| Selection size | At least one. A single selected charge is allowed and behaves as full settlement of that remaining charge. No new numerical selection cap without a measured UI/performance reason. |
| Amount | Exactly the sum of the selected remaining balances, using the existing positive whole-baht payment rule. Zero, short and excess amounts are rejected. No automatic spillover or unallocated credit. |
| Partial history | A charge may already be partially repaid; use its current remainder, never its original face amount. Partial settlement of the newly selected group is outside this first version. |
| Ordering | Keep current deterministic allocation ordering for audit continuity. Full settlement of every selected residual means ordering cannot change which charges receive money. |
| Freshness | SQL recomputes under locks. Reject invalid/paid/deleted targets and a changed combined total; return a useful refresh/review message. Do not silently remove an invalid selected ID and proceed. |
| Retry | Same Payment identity must not create another receipt, allocation, repayment or cash effect. A newly generated payment ID is a new request, not a retry. |
| Correction | Selection and posted financial inputs are immutable after preparation/posting. Use the established auditable correction procedure; do not delete and repost financial history. Retain the existing separately reasoned custody correction behavior. |

These are recommended design choices, not previously accepted requirements. The two material scope choices are full settlement only and selection within a form. Capture owner refinements before implementation where they change this contract.

## AppSheet selection decision

Google documents [bulk actions](https://support.google.com/appsheet/answer/10107372?hl=en) as applying an action to selected rows. That does not by itself establish a single aggregate receipt action with the selected key set passed into one form. Running the current per-charge receive action in bulk would fail the one-Payment requirement.

Google also documents [EnumList/List values with Ref bases and list dereferences](https://support.google.com/appsheet/answer/11618586?hl=en). This supports the recommended form design; the exact picker presentation and SQL connector serialization still need a DEV GUI proof. Do not invent a selected-rows context expression or claim a native bulk navigation action can aggregate the rows without testing it.

**Recommended:** a borrower-scoped `EnumList` with base `Ref` to `Charges`, no other values and no creation of charges from the picker. Show the group total within the same unsaved form. This requires no shared selection flags on business Charges and isolates selections across collectors/devices.

**If direct checkboxes in the existing charge table are essential:** first prove that the current GUI can safely pass the entire selection to one receipt request. If it cannot, document a separate session-keyed selection basket (collector, borrower and request identity, explicit confirm/cancel, no posting on each selection) and obtain approval for its additional schema. Do not quietly substitute one payment per selected row or store globally shared Yes/No flags on Charges. This alternative is not included in the proposed one-column scope below.

## Proposed data and SQL changes

Add one nullable persisted field, provisionally **`Payments.Selected Charge IDs`**, exposed as an AppSheet EnumList of Charge Refs. A PostgreSQL text representation is the initial candidate, subject to a verified lossless round trip with this app's connector. Existing six methods and historical rows keep it null/empty. No new payment table or duplicated financial amount column is proposed.

**Why persistence is needed:** the SQL posting transaction needs the exact submitted set, and the selected scope must survive sync/retry and remain auditable. `Ref Target Charge` holds only one target; `Eligible Charges` is computed; `Notes` is not structured intent; pre-creating `Payment Allocations` would conflict with the engine's no-existing-results guard. Existing posted allocations already provide normalized, FK-backed per-charge evidence after posting.

**Schema authorization:** AGENTS requires approval for new columns/tables. This design request does not itself approve the newly specified column. Present this one-field scope for owner approval before applying its migration. Design/publication can finish now; no live schema change is part of this document task.

Implementation requirements:

1. Prove multi-selection serialization with synthetic IDs, including actual key format, separators/escaping, whitespace, null/empty values and malformed input. Specify one canonical decoder and reject ambiguous or invalid representations. Preserve key case and content. Do not assume splitting arbitrary text on commas is lossless. If the proposed representation cannot be made safe with actual keys, revise the schema design before applying it.
2. Add a higher immutable Flyway migration after checking the actual highest used/reserved version. V50 is the highest repository migration observed here; **do not reserve V51 from this document**. Use additive null-compatible schema so old apps keep working.
3. Extend the authoritative method validation with `Selected Charges`. Require a nonempty unique target set for that method, reject duplicate/malformed/unknown IDs, and reject nonempty selection input for the other six methods. Keep `Ref Target Charge` and `Ref Target Loan` empty for the new method to avoid conflicting scopes.
4. Extend `payment_charge_balances(p_id text)` with the selected-ID branch. Do not change the six existing branches. Validate every requested ID separately from the eligible-result query: compare counts/sets so filtering out an invalid ID can never silently shrink the intended group.
5. Extend `post_payment(p_id text)` so the selected method requires exact full balance equality. Reuse borrower locking, payment reread, existing pending/error exclusion, deterministic loan/charge locks, snapshot creation, Repayments, reconciliation, closure and final Posted transition. Keep lock ordering consistent with competing receipt/charge mutations. Revalidate after locks and before any effects.
6. Extend `lump_sum_receipt_guard()` or an equally explicit audited guard to protect selection input once prepared/Posted. Ensure metadata-only receipt-image attachment and authorized account corrections still work without changing selection or reposting. Do not add a client-side financial posting action or re-enable the superseded AppSheet payment processor.
7. Maintain all-or-nothing behavior: an exception leaves no newly posted child rows or cash movements. An initial insert may be rolled back entirely and surface as a sync error; do not promise an `Error` Payment exists for every rejected insert. Recovery must preserve the original client request identity and establish whether a receipt posted before any retry.
8. Verify existing cash-ledger source triggers, materialized charge/loan/borrower/payment totals, loan closure, referral effects and daily-interest adjustment still execute through the normal engine. Do not manually create an additional cash movement for each allocation.

The text selection field is structured command intent, not a replacement for relational integrity. Every ID must resolve and be locked before posting, and resulting allocations retain their existing real Charge/Payment foreign keys. Inspect deletion/immutability dependencies so successful postings cannot lose their target evidence.

## AppSheet and consumer implementation inventory

| Component | Required work |
| --- | --- |
| OLTP Payments | Regenerate after the approved migration; reconcile generated changes. Add method value and selection control, selection total feedback, exact amount validation, edit/visibility guards and understandable sync-error recovery. Extend `Eligible Charges`/`Eligible Outstanding` logic for the new method without causing circular dependency on the selector. Preserve the Posted optimization and receipt-detail controls. |
| Collection/Borrowers | Add the borrower-scoped launch action to the applicable Collection slice/detail action set. Preserve the existing charges list, totals, note editing, Receive All behavior and Submitted Receipts section. |
| Charge references | Verify keys, labels, visibility/security filters and amounts. The picker must omit paid rows even when those rows remain visible in Collection. Use server validation in addition to UI filtering. |
| OLAP | Reconcile the shared Payments schema, method enum and generated Refs. Keep entry ownership in OLTP; expose selection/allocations as appropriate for read-only review. Check affected Payments, Allocations, Repayments and borrower/loan amounts. |
| Notifications | Inspect existing event/method filters for the new method, preserve intended channels and actor-based recipient rules. No duplicate notification path. SQL-triggered child writes must not be assumed to fire AppSheet bots. Verify affected delivery in owner-only DEV, including exact Payment-linked closure notifications when applicable. |
| R046/R047 receipt evidence | Preserve service-owned image metadata and linked-payment navigation. A manually created payment need not automatically acquire an image; no new AI ingestion/linking behavior is promised or implemented. |
| Reporting/exports | Inspect direct method enumerations and schema-sensitive consumers, including borrower Payment reporting from V46. Reconcile receipt, repayment and cash grains. Change only affected queries/templates; no unrelated dashboard redesign. |
| AI Collection | No agent/runtime edits. Any later integration changes require the separate repository's AGENTS and service catalogue. Compatibility with existing methods must be retained. |

For UI feedback, use the selected Ref list and existing remaining amounts. Any illustrative expression must be validated against current schema in the editor before saving; this handover deliberately does not supply unverified drop-in expressions.

## Implementation order and checks

1. Re-read current R047 tracker/log and affected DEV work. Verify actual app IDs plus complete Cloud SQL instance/host/database tuple from the inventory. For browser work, follow the account mapping and required Chrome profile. Record restorable versions for both affected apps and the applicable database rollback point. Preserve unrelated working-tree/live work.
2. Confirm the one-column schema scope and the two material UX/business choices above. Prototype the selector/serialization and confirm/cancel behavior in DEV before committing to the production-facing definition. No borrower financial data is needed for this proof.
3. Implement the additive migration and targeted database fixtures using existing runners. Run `Test-CI.ps1` and migration-chain checks required by [database procedure](../../database/README.md#each-change), plus meaningful selected-set, retry and concurrency tests. Existing relevant runners include `Test-CorePayment.sql`, `Test-CorePaymentConcurrency.ps1`, `Test-CorePaymentPreservation.ps1` and cash-account fixtures.
4. Apply the approved migration in DEV, reconcile both apps, then implement the OLTP entry flow. Test real current AppSheet GUI entry/sync with synthetic fixtures; SQL/configuration evidence alone is insufficient.
5. Execute the acceptance matrix below. Record actual evidence and unresolved limits, update exact dictionary objects/DEV overlays, model behavior explanation, release log and affected environment/development records. Do not mark readiness while either saved editor has warnings/errors.
6. Keep the release Open through implementation and owner review. At authorized promotion, use the single filled master checklist, pin the integrated package and preserve all pending DEV scope. Apply compatible SQL before final PROD-mapped RC validation; promote by App Upgrade, not hand edits or an old R046 definition that omits later work. Capture a manifest, validate both apps and complete required documentation/RC cleanup before Released.

## Acceptance matrix

| Case | Required evidence/result |
| --- | --- |
| Arbitrary subset | Select B/C/D in the synthetic example: exactly one ฿650 receipt, three allocations/Repayments and the normal one receipt cash movement. A remains untouched despite being older. |
| One / all eligible | One selection succeeds; selecting all succeeds without changing Receive All's implementation. |
| Part-paid / multiple loans | Residual-only settlement and same-borrower cross-loan attribution reconcile principal and interest correctly. |
| Invalid selection | Empty, duplicate, missing, paid, malformed, cross-borrower, inaccessible and future targets fail safely. SQL enforces ownership/date/balance even if UI controls are bypassed. Verify existing user access policy rather than assuming UI Valid_If is authorization. |
| Amount/date edits | Short/excess/zero/fractional amount and ineligible backdated selection fail. Changing selection refreshes feedback and invalidates a stale amount. |
| Stale/concurrent receipt | Competing receipt changes eligibility/total: one succeeds as appropriate; the other refreshes/reviews without overpayment or spillover. Disjoint valid groups may succeed serially. Cover existing error/pending exclusion. |
| Retry / duplicate tap | Lost response, sync retry and repeated submission with the same key create no duplicate financial results. Do not mint a new key on a blind retry. |
| Cancel / isolation | Cancel produces no financial record. Two collectors/devices cannot see or overwrite each other's unsaved selection. |
| Atomic failure | Inject a failure after plan creation within a disposable test transaction; no partial allocations, Repayments, balances or cash effects survive. |
| Posted protection | Editing method/selection/amount/borrower is rejected; permitted custody correction and receipt metadata attachment do not repost. |
| Derived effects | Correct paid/partial statuses, borrower/loan totals, legitimate loan closure, applicable referral/daily-interest effects and account balance. No closure solely because this selected group is paid. |
| Existing six methods | Relevant SQL preservation checks plus current GUI checks for affected entry/validation paths, especially Lump Sum, Receive All, single receiving and Loan Close; first-day behavior remains valid. |
| Downstream | OLAP reads the new method and reconciled allocations; directly affected report/export method handling works. R047 receipt display remains functional when an image is already linked. |
| Notifications / readiness | Applicable owner-only DEV delivery and exact actor/receipt identity verified; both saved editors have zero warnings/errors. Do not infer delivery from a queued event. |

Passing tests require numerical reconciliation: Payment amount = sum of positive allocations = sum of linked posted principal plus interest = the receipt's cash effect, subject to the existing receipt/custody semantics. All allocated Charge IDs must equal the submitted set exactly.

## Rollback and handoff status

This task changes documentation only. Starting Git commit above is its rollback point; restore/revert only this documentation batch while preserving intervening work. Pre-existing untracked risks/payment-health artifacts were left alone.

For later implementation, use newly captured app versions, not the dated versions quoted here. An app rollback may leave an additive nullable SQL field/method support in place once old-app compatibility is verified. Do not remove columns holding selected-scope audit evidence or assume app restoration undoes posted Payments. Correct financial writes through the authorized audited procedure; database recovery follows the existing release recovery runbook.

**Completed here:** repository-grounded feasibility/design, official AppSheet capability review, scoped implementation/dependency plan, acceptance criteria, release routing and repository publication preparation. **Still pending:** owner review of the proposed choices/schema, live selector/serialization proof, implementation, all runtime tests and production authorization. No SQL/app/model dictionary definitions have been changed by this design.

### Prompt for the implementation chat

> Implement Receive Selected Charges using this handover and the current Open release. Start with the tracker, its release log and affected live definitions; preserve the integrated R046/R047 receipt work and any subsequent accepted changes. Check the conversation for approval of the proposed Payments.Selected Charge IDs column before schema mutation. Prove the borrower-scoped multi-select form and lossless key serialization, then extend the existing atomic SQL engine so one Payment fully settles exactly the selected eligible charges. Keep all six receiving methods and the existing cash, identity, audit and notification behavior. Complete targeted SQL/concurrency tests and current AppSheet GUI acceptance, reconcile both apps and exact dictionary/model documentation, then commit/push sanitized evidence. Keep development status distinct from owner acceptance and production authorization. Use the normal integrated RC/App Upgrade workflow only when scoped promotion is authorized.
