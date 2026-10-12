# Unified Receive Payment — design and executable test plan

R052 Open. Owner approved one amount-first editable allocation plan after the discussion of existing five manual receiving paths. Canonical app baseline e2549d18; D records exact current source/dirty-state and recovery pins in this batch. A owns this design/tests; B implements; existing C independently executes; D tooling, DEV delivery and publication. Preserve unrelated work. D verified head81 and reserved V82 to B. V1–81 remain immutable. No new table/column, production change or notification delivery (Phase8).

## User contract

One Receive Payment entry retains the compact header loading state, existing footer arrows, Notes, receipt, tender and receiving account. Enter total first. A single editable grid shows charge date, loan label, principal remaining, interest remaining, principal allocation and interest allocation. Due/upcoming are passive group/date context. Future charges can be allocated manually, including several future charges; Auto uses due charges only. First-day Auto and Loan Close remain separate workflows; normal payment-driven loan closure still occurs.

Keep Payment total / Allocated / Remaining to allocate visible. Compute with exact whole-baht integers. Each allocation component is nonnegative and no greater than that charge's current corresponding residual; each included line has a positive sum. Confirmation requires a positive total and allocated total exactly equal to it. Over-allocation is displayed and blocked, never compensated by changing the entered total. No surplus credit, implicit fee, pro-rata split or rounding.

Auto-assign is an explicit action that populates the same editable rows. Match V59: Charge Date descending, immutable charge ID UTF8/C descending for ties, interest first within each charge, then principal. User can edit that proposal freely, including principal before interest. Changing total preserves edits and displays the difference. Re-running Auto when nonzero edits exist explicitly confirms replacement. Auto may allocate all available due balance and leave a positive unallocated remainder; this is a proposal, not a posted overpayment, and Confirm remains blocked until legitimate manual allocation resolves it. No automatic reallocation on refresh or submit.

Retain quiet serialized device autosave and explicit online confirmation. Persist v6 form state separately from immutable dispatched commands. Existing unsent v5 drafts may be restored with a visible conversion review: selected full balances become editable proposed lines only after fresh component fetch; do not manufacture principal/interest from a total. Existing submitted v3–5 commands are never converted or assigned a new UUID. Successful Posted returns to Collection; original/current results remain reachable from history. Unknown/conflict/rejected remain explicit recovery states.

## v6 canonical API contract

Continue /api/payment-commands and the existing protected submit/status routines. Retain schemaVersion3/4/5 canonical bytes, validation and replay paths exactly. New v6 command has the following exact key order:

```
schemaVersion, requestId, borrowerId, allocations, cashAccountId,
paymentDate, amountReceived, paymentMethod, notes, receiptId
```

Each allocations entry has exact keys/order:

```
chargeId, principal, interest, expectedPrincipalRemaining,
expectedInterestRemaining, chargeDate
```

Canonicalize entries by chargeId UTF8 byte order ascending. IDs use the existing business-ID constraints, are unique, and number1–10000. All four component numbers are canonical nonnegative whole-baht integer strings (`0` or nonzero digit followed by digits); paid principal+interest>0 per line; every value and total stays within the existing numeric transport maximum. amountReceived is the existing positive canonical integer string. Paid component sums must exactly equal amountReceived. Keep complete canonical-envelope512KiB, Notes64KiB and existing receipt limits. No sparse arrays, extra keys, null numeric components, exponent notation, negative zero, duplicate IDs or floating-point parsing. Existing three tender values and actor/receipt normalization are unchanged. Envelope contractVersion remains1; table schema remains unchanged.

expectedPrincipalRemaining/expectedInterestRemaining/chargeDate are reviewed source snapshots, not authority. New submission checks them against governed current source under transaction locks; mismatch yields the existing durable selection_unavailable rejection, never an altered split. The same-ID retry must preserve these snapshots and paid values. A deliberate revised instruction after a terminal rejection uses a new request only after explicit fresh review.

GET payment-drafts continues bounded cursor pagination and includes component balances. Source components are Charges.Principal Due/Interest Due minus the corresponding actual Repayments sums, aggregated before joining. Do not split physical Amount Remaining heuristically. Missing/negative/fractional component source values require reconciliation under this whole-baht contract; never round or replace with zero. Existing Processing/Error borrower blocker and active receiving account/holder checks remain.

POST /api/payment-drafts/:borrowerId/auto-assign accepts exactly {amountReceived}. It is read-only, current-owner guarded, one Bangkok business day/repeatable-read snapshot, due-only eligibility and V59 ordering. Return proposed allocation lines, current source rows, allocated total and unallocated remainder; no journal or financial side effect. Use a bounded full eligible provider rather than the visible page. Overflow above existing transport/count bounds is explicit, never silently truncated.

POST /api/payment-drafts/:borrowerId/review discriminates the new exact {amountReceived, allocations} body while retaining older selected-ID bodies. Return validation/current component/date snapshots; NEVER replace paid principal/interest values. Stale source returns409 plan_changed with a safe current-balance projection so the owner explicitly reviews the differences. New Confirm does a fresh check; SQL then checks again under locks. Auto-fill result or cached draft is not authorization to post. UI reviews locally immediately, keeps Confirm disabled during the fresh check, and ignores late responses after an edit/scope/actor change.

## SQL persistence and posting without new source columns

OWNER SUPERSEDING DECISION: implement a separate PWA payment engine and a compatibility dispatcher; do not mix v6 allocation logic into the legacy engine. Use existing immutable journal canonical_json as the durable original explicit plan and provenance. No new table/column is needed. A v6 Payment retains physical Allocation Method Selected Charges and canonical Selected Charge IDs; those fields alone NEVER select the new engine.

Keep public.post_payment(text) as the compatibility dispatcher so current posting triggers, corrections and direct governed callers converge on one routing boundary. Put the existing V59 algorithm in a separately named legacy implementation with its financial body unchanged. Introduce a separate INVOKER PWA engine for v6 validated explicit-plan posting. Preserve existing function owners/security characteristics; do not turn the broad financial engine into a SECURITY DEFINER. A minimal legacy-entry origin guard must reject a journal-proven v6 payment ID, preventing direct helper calls from bypassing dispatch; the PWA helper likewise rejects absent/wrong-version/invalid provenance. Both helpers still enforce normal source state and idempotency. B chooses final distinct names and records them in source handoff.

Route only from an exact indexed immutable journal payment_id match with posted outcome and canonical schemaVersion6, validated canonical identity and source coherence. Invalid claimed provenance fails closed, never falls back. Ordinary AppSheet-created rows and historical v3/v4/v5 PWA rows retain legacy semantics; older committed PWA commands are never reinterpreted or reposted. Provenance describes the creating command, not the UI currently editing it: a v6 payment subsequently edited in AppSheet stays on the PWA engine. No request header, payment-method label, UUID prefix, caller GUC or ordinary writable source field establishes PWA origin.

The new engine validates the complete plan under existing lock order, then uses set-based generated allocation/repayment insertion where compatible with existing constraint/trigger semantics. Preserve existing generated ID/sequence rules and deterministic newest-date/ID order, exact paid principal/interest and normal closure, cash, refresh and reconciliation functions. Do not disable integrity triggers or reimplement their effects in the browser/API. Shared source-correction/delete preparation remains governed; engine dispatch changes neither atomic reversal nor journal retention. Already-Posted calls and internal status/refresh trigger reentry must never create a second effect. Performance evidence measures identical synthetic plans at small and representative larger sizes; correctness wins over unproven optimization claims.

In the protected submit routine, retain current actor verification, exact canonical identity, request advisory lock and prior-outcome replay BEFORE new-command checks. For a new v6 request, lock borrower, its Loans by ID C, then Charges by ID C, in the same order as V59. Validate unique ownership, current reviewed component/date snapshots, component caps, exact total, Payment date/account and other existing source guards.

Inside the same posting savepoint, INSERT the journal's posted outcome immediately before INSERTing its Processing Payment. This lets the normal posting trigger read the authoritative plan. These are uncommitted rows: neither is externally visible unless all posting, reconciliation and outer COMMIT succeed. The separate PWA engine inserts normal generated Payment Allocations and Repayments using the EXACT planned principal/interest amounts, existing row-key scheme and newest-date/ID allocation order; it invokes the same closure/cash/source effects and exact total reconciliation. Do not call an external service between staged journal and final posting.

A typed source rejection rolls back that savepoint, including the provisional posted journal and any derived rows, then inserts the existing terminal rejected outcome outside it. Unclassified technical errors abort the whole command transaction and remain Unknown/unavailable; never preserve a posted journal without its successfully posted Payment. No journal UPDATE/deletion or temporary pending outcome is introduced. Commit-acknowledgement loss uses existing status/replay recovery.

### Forgery and correction boundary

A known v6 journal/payment key alone is insufficient authority to create/recreate a source row. An INVOKER insertion guard requires current_user exactly mw_app_dev_journal_owner (the existing protected submit execution identity), correct canonical actor Created By, borrower, total/date/tender/account, selected IDs and null single/loan targets. Runtime and ordinary AppSheet writers cannot assume that owner role. No session GUC or caller-supplied flag authorizes this. Direct ordinary INSERT reusing a retained v6 payment key after source deletion is rejected. Tests must prove actual non-owner denial, not just simulated principal checks.

Preserve existing AppSheet corrections for all legacy commands/ordinary rows. For new v6 rows, Notes/manual receipt and compatible receiving account/tender/date updates preserve the original paid component plan. Date correction uses existing date validity and current caps; it does not rerun due-only Auto or rewrite the immutable original command. V59's governed delete/reversal/dependency rules remain, with original journal retained and replay reporting the historical outcome/current source missing.

Changing a v6 source borrower, total, selected IDs, target refs or allocation method cannot invent a revised explicit plan: reject those changes atomically, before committing any derived undo. This is a narrow, owner-visible limitation for new explicit-plan receipts, NOT full source-edit parity. Revised financial plans need the later native correction workflow; do not silently route them through legacy automatic allocation. Existing whole-interest move behavior remains available only for its original eligible Lump Sum rows, not as a way to mutate v6 journal intent.

For correction reposting, reuse original paid principal/interest lines and check current component caps after the governed reversal; do not require the old initial residual snapshot to remain identical after subsequent legitimate payments. The original snapshots are a NEW-command stale guard, not a rule that freezes future source balances. Source/result comparison must compare actual component allocations with original v6 lines, in addition to current Payment dimensions. Do not classify a same-total changed split as unchanged. Metadata-only CAS, manual/agent receipt separation, immutable command replay and actor-scoped history are unchanged.

## Executable independent plan for C

Prerequisites: B frozen code/V82 and fixture handoff; D source pin plus true non-superuser local operator migration lifecycle; existing full V1–latest disposable runner and stable application LOGIN role. No real borrower financial write, live GCS/notification or production operation by C. Use existing `tests/integration/Run-PaymentPhase4.ps1` extended to latest package or a thin named runner agreed with B, never a hand-picked SQL subset. Add independent `unified-receive-payment-independent.test.mjs` and `unified-receive-payment-independent.spec.ts`; B supplies exact invocation/options when frozen.

Commands, once runner wiring is handed off:

```
. ./scripts/Enter-Dev.ps1
./tests/integration/Run-PaymentPhase4.ps1
npm run build:live-dev
npx playwright test tests/e2e/unified-receive-payment-independent.spec.ts --project=chromium
```

D runs required Test-CI for migration/runner changes and financial-contract exact-candidate delivery checks. Reuse unchanged receipt/auth/role proofs only while their assumptions remain valid. C resolves routine defects directly with B; A handles semantic conflicts. Record actual executed command/file scope, not a claim all past suites reran.

Synthetic primary fixture: one borrower with same-day C-new-z principal80/interest20 and C-new-a principal60/interest10; yesterday C-old principal40/interest5; tomorrow C-future principal50/interest7. Set IDs/ties to establish C order exactly. Separate fixtures contain another borrower, inactive account/holder, Processing/Error blocker, missing/negative/fractional components, >25 rows, upper bounds, old v3/v4/v5 journals, a legacy AppSheet receipt and unrelated financial sentinels. Restore fixtures per test in the owned disposable database.

| Case | Steps and exact pass criteria |
| --- | --- |
| U1 canonical contract | Pure JS/actual SQL agree on v6 bytes/hash, sorted unique lines, source snapshots and exact total; malformed/sparse/extra/null/fractional/overlimit/body overflow fails before side effects. Existing v3–5 replay bytes unchanged. |
| U2 Auto parity | Amount130 proposes C-new-z principal80/interest20 then C-new-a principal20/interest10. Future excluded, tie order verified. Compare posted result with a legacy Lump Sum on independent identical data. Amount above due215 leaves unallocated remainder and cannot Confirm until a legitimate plan covers it. |
| U3 exact manual/hybrid | Allocate principal80/interest0 to C-new-z and principal50/interest0 to C-future for total130; exact principal-first manual split survives journal, allocations, repayments and cash. Hybrid edit Auto proposal to z70/20 and a30/10 totals130 exactly. Multiple future lines allowed. No automatic interest reordering. |
| U4 caps/amount | Negative, over-component, missing charge, other-borrower line, zero line/total, under/overallocated sums and invalid source reject. Changing UI total preserves rows and blocks until equality. No surplus/rounding. |
| U5 stale/concurrency | Change principal only, interest only, charge date, account or membership between review and Confirm; no silent rewrite. Same-total changed components still stale. Two commands/AppSheet contender for same balance produce consistent single effects; no overpaid components. |
| U6 journal atomicity | Fail after provisional journal insert, during allocations, repayment/closure and before COMMIT; no false posted outcome or orphan effects. Typed rejection retains only rejected journal. Ack loss after commit, process restart and same-ID retry recover exactly once. Changed line/snapshot/method/actor conflicts. |
| U7 insertion authority | Actual app LOGIN direct INSERT/recreate of known v6 Payment ID fails; forged actor/financial fields fail. Submit wrapper succeeds with current mapped owner. No permission/GUC shortcut and no direct journal mutation introduced. |
| U8 source corrections | New v6 metadata/account/tender/valid-date correction preserves exact split and reconciles cash; unsupported amount/borrower/scope/method edits rollback all children/closure changes. Governed delete preserves journal; replay does not recreate Payment. Legacy AppSheet correction/delete and Lump Sum interest-move behavior stay intact. |
| U9 result/receipt | Same total but altered component allocation is current-source changed. Notes/receipt CAS cannot rewrite original plan. History/result shows exact lines, cash effects, original actor and current state; automatic Collection return still leaves audit accessible. |
| U10 compact UI/drafts | Desktop/390/320 EN/Thai amount-first grid and persistent summary, explicit Auto replacement, manual future edits, three tenders, Notes/image and one Review/Confirm flow. Quiet autosave retains amount/lines/snapshots; old unsent conversion requires fresh review; old submitted commands never mutate. No extra wide header rows. |
| U11 races/offline | Edit while Auto/review delayed; old response cannot replace newer manual edits or enable stale Confirm. Offline edits survive restart under existing owner lease; reconnect refresh preserves paid plan and flags differences. No auto-upload/post. Pending freeze/purge/epoch and quota failures remain safe. |
| U12 legacy/separate flows | First-day Auto, Loan Close and normal payment closure/cash/referral rules remain governed. No accidental activation of those separate entry workflows and no notification delivery. |
| U13 authoritative dispatch | Ordinary AppSheet and historical v3/v4/v5 source rows use legacy engine, v6 uses new engine, regardless of which client edits it. Direct wrong-engine calls, UUID-prefix spoof, writable source-field/GUC spoof, retained-ID recreation and malformed provenance fail closed. Verify both ordinary source creation and protected submit as actual allowed database identities. |
| U14 reentry/engine parity | Repeated post_payment/direct helper invocation on Posted, status updates and refresh/correction triggers produce no duplicate allocation, repayment, cash or closure. Compare unchanged legacy financial behavior against V81 baseline fixtures, and new engine against independent exact-plan expectations. Inject failure during bulk child insertion and verify atomic rollback. |
| U15 bounded performance | Measure same synthetic 4-line and 100-line plan, cold/warm labelled runs, separate SQL/request/UI times and actual generated-row/query counts. No claim cloud speed from disposable timings. Review operation does not perform posting work or silently rewrite plan; delayed responses preserve newer edits. |

Evidence: sanitized exact financial assertions and before/after fingerprints, real non-owner/rollback checks, local request/query timing where relevant, compact representative screenshots and labelled seams. New source correction limitation must be reported at owner checkpoint. No copied private borrower rows, credential output or broad unrelated audit.

## Delivery and stop point

Deploy compatible SQL/API before new v6 frontend. Preserve old v3–5 clients and history; rollback disables new v6 submissions before rolling back API, retains V82/journal/current source and recovery access. Never undo owner DEV hands-on payments by blanket restore. Keep the dispatcher and both engines during rollback and the parallel AppSheet period; do not route retained v6 source rows through legacy after frontend rollback. Legacy-engine retirement is a later post-production-cutover change requiring dependency/replay/correction tests and scoped authorization, not part of V82. Required backup/maintenance grant restoration and current isolated DEV tuple follow the maintained D runner; production untouched.

Checkpoint is a working DEV unified Receive Payment flow with demonstrated Auto/manual/hybrid correctness, safe stale/retry behavior, receipt/offline continuity and explicit v6 source-correction limitation. D publishes the coherent tested batch and progress, then stop for owner review. This is not a claim all Phase5 workflows or production readiness are complete.

