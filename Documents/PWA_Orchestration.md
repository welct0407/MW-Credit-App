# PWA delivery, validation and promotion

**Owner revision: 12 October 2026 (Asia/Bangkok).** This is the single PWA policy for test selection, batching, evidence reuse and promotion. It replaces the overlapping 8–9 October routine-UI/full-checkpoint rules. [PWA Progress](PWA_Progress.md) owns current status; the [implementation plan](PWA_Implementation_Plan.md) owns phase scope. Historical checkpoints and generic checklists do not add a fresh full-CI or owner-review gate to routine changes.

## Responsibilities

| Role | Model and effort | Responsibility |
| --- | --- | --- |
| Main conversation | Orchestrator | Coordinate scope, authority, ownership and completion; review evidence without repeating passing checks |
| Agent A — Architect | GPT-6 Astra High | Resolve design ambiguity and supply an executable test plan; reuse existing designs for routine refinements |
| Agent B — Coding | GPT-6 Astra Medium | Implement the agreed change and resolve defects directly with C |
| Agent C — Testing | GPT-6.1 Sol Medium | Independently verify affected behavior, record failures and retest fixes; escalate ambiguity to A |
| Agent D — Miscellaneous / Delivery and Documentation | GPT-6.1 Sol Medium | Tooling, delivery, documentation, evidence and authorized publication |
| Agent E — User Experience Officer | GPT-6 Astra Low | Owner-requested desktop/iPhone Pro Max/iPad UX suggestions grouped by page/category with unique human-readable codes; request-only, no automatic implementation authority |
| Agent F — Infrastructure | GPT-6 Astra Low | Terraform, cloud resources, IAM, Secret Manager and networking |

Reuse active workers within available capacity; do not activate every role for a routine edit. One owner controls each mutable file/live object. Worktrees do not isolate shared services. Roles grant no additional production/service authority; the [model mapping](Model_Work_Mapping.md) owns model preferences.

## One coherent delivery batch

1. **Define the outcome and checks once.** Use the current batch record or [compact template](templates/PWA_Batch_Record.md): scope, baseline, authority, affected components, selected checks and actual owner decisions still needed. Reuse the existing design; involve A only for a real ambiguity, changed boundary or missing acceptance criterion.
2. **Batch related UI work.** Implement several related refinements before candidate acceptance. During iteration use the smallest useful type/build, interaction and visual checks. Do not publish, run global suites or request review after every save, selector fix or screenshot. Do not combine unrelated sensitive work merely to save a run.
3. **Resolve defects directly.** C gives B the failing case/reproduction; B fixes it and C reruns affected cases. Preserve unaffected passes. Root handles scope/authority conflicts; A handles design ambiguity. Avoid acknowledgements and unchanged-status worker wake-ups.
4. **Deliver changed components.** Use the validation matrix below, build from intended inputs, capture the digest/configuration and deploy the tested artifact through the maintained authorized route. Rebuild only when its inputs change. Independent UI need not wait for unrelated work; relevant unresolved failures block dependent delivery.
5. **Close once.** Record checks/reuse, deployed pins, recovery and limitations in the owning manifest/log and link required release/progress records. Publish intended files. Continue already authorized work; pause only for an actual missing decision, explicit owner checkpoint or authority boundary. Task completion does not create another approval round.

## Proportional validation

Classify changed **behavior**, not filenames. Authentication or financial logic in a frontend file is sensitive; an additive display field in an API is not automatically a full-regression trigger. Focused checks and full CI are different evidence and must be labeled accurately.

| Change | Required checks | Full-suite decision |
| --- | --- | --- |
| Documentation, evidence or policy only | Relevant content/link/format consistency and exact-file diff review | No product build, browser CI or deployment solely for these edits |
| Text, spacing, layout or other reversible presentation | Type/build when code/build inputs change; one representative visual pass over affected states/viewports and relevant accessibility/interaction checks | No full CI by default, including before production; no tests that merely mirror text/CSS |
| UI interaction or additive display/read field | Focused regression and source/data binding checks; changed read/auth boundary where relevant; representative visual pass | Consolidate related changes; broaden only when combined impact reaches shared workflows or focused coverage cannot establish correctness |
| Shared navigation, session integration, service worker/offline/cache behavior, shared dependency/build changes or interacting feature families | Affected integration and cross-workflow checks | One consolidated full browser/application run when broad interaction risk warrants it; state that reason, not merely “checkpoint” or “promotion” |
| Financial, authentication, authorization, access, database or infrastructure behavior | Relevant immediate positive/negative, identity, concurrency and recovery checks. Actual restricted SQL/runtime proof where mocks are insufficient. Database runner/migration changes retain disposable `Test-CI.ps1`; infrastructure retains relevant plan/validation checks | Select broader suites for affected dependencies/risk. Do not postpone sensitive verification or run unrelated browser/database/Terraform suites |

When a full run is needed, finish the related source batch first and use **one consolidated run** for candidate acceptance and promotion. Do not run another solely for a merge, documentation publication, phase closure or deployment. This avoids duplication; it does not waive failures. After a fix rerun failed/invalidated checks, repeating the full suite only when changed behavior or an unresolved integration failure invalidates broader evidence. Explicit owner-requested tests remain in scope.

## Evidence reuse and exact candidate identity

Pin artifact source, candidate/evidence commit, build inputs and target configuration separately. Valid evidence can span documentation, merge or publication commits with different SHAs when relevant inputs are unchanged. A merge with changed runtime inputs is not equivalent merely because branch/title match.

Record one bounded diff or input manifest covering component source, shared code, lockfile/dependencies, build scripts/toolchain, generated assets and target configuration. For **test** reuse also check relevant tests, fixtures, runner configuration and environmental assumptions: identical artifacts do not prove a changed test passes. Build DEV/PROD variants when bindings differ and verify them; never relabel a DEV artifact as PROD.

- Reuse actual passing results and artifact digests while those inputs/assumptions remain valid. Record the comparison and any new focused checks, not another whole suite.
- A skipped E2E step is no browser evidence. When required, inspect the actual run/step result; a green job badge alone is insufficient.
- An old green, acceptance statement or unrelated narrower pass cannot clear a known relevant failure.
- Rerun affected cases when source, dependencies, configuration, fixtures, identity/data assumptions or observed failures invalidate them. Reuse unaffected results, visuals and live observations; no repeated access/receipt/job audit without a concrete trigger.

## Minimal production promotion

Use the release's existing filled [master checklist](../scripts/releases/templates/promotion-checklist.md), executing applicable PWA rows only; link the batch manifest rather than create another checklist. AppSheet copy/editor/upgrade procedures apply only when changing an AppSheet definition, not a PWA-only release.

1. **Confirm scope and authority.** Reuse existing scoped production authorization and acceptance. Ask only when missing or when scope/material behavior/authority changed. Do not ask again at each technical step. A UI deployment does not implicitly authorize production financial writes, forced notifications or job-ownership changes.
2. **Confirm candidate and rollback.** Verify tested input/artifact/configuration pins and only the affected live baseline. Capture the current Hosting version/service revision/image and changed configuration/secret-version pins needed for recovery. Reuse valid recovery evidence; UI-only delivery needs no new database backup. Actual database writes retain verified restorable backup, exact migration hashes and guarded runners.
3. **Apply once in dependency order.** Deploy only changed components with reviewed artifacts. Preserve independent services/scheduler ownership. Stop dependent actions on failure; reconcile unknown outcomes before retrying. Do not rerun candidate tests simply because deployment starts.
4. **Perform one bounded deployed smoke.** Verify intended version/digest/environment and changed entry point, including session or service-worker update behavior when affected. Reuse DEV/disposable financial proof; no repeated behavioral suite or invented live payment/push test. Restore pinned artifacts/configuration on failure; application rollback does not undo SQL/financial effects.
5. **Record and close.** Update applicable release/environment/model records with actual outcome and evidence links. Distinguish applied, verified and accepted; required unresolved checks remain explicit. Publish once. No additional ceremonial A/C/root review after relevant evidence is accepted.

## Current automation and follow-up

Source inspected on 12 October 2026. **This policy edit changes no workflow YAML or candidate validator.** Use maintained executors honestly. A conflicting hard-coded legacy gate is a tooling gap: correct it through a scoped tested change before using that path; do not fabricate full-run receipts, bypass validation or launch duplicate CI without explaining the actual constraint.

| Current implementation | Consequence and concrete follow-up |
| --- | --- |
| App `ci.yml`: main pushes/manual dispatch execute app checks, live-DEV build, audit, full E2E and DEV Terraform checks. All listed PR events run nonbrowser steps; E2E runs only on the `ci:checkpoint` label event. | Docs/main merges currently trigger broad work. Add vetted affected-input routing and explicit full-checkpoint selection while preserving required-check reporting. Do not claim routing exists today. A necessary exact-input main run can satisfy the checkpoint; do not also dispatch one. |
| Leaving `ci:checkpoint` on a PR does not run E2E on later synchronize events. | Until routing changes, deliberately apply/reapply it only for a needed consolidated run; verify executed steps/ref. No label merely to promote low-risk UI. |
| `database.yml` filters affected paths but runs on branch pushes and PR events. | Deduplicate the same tested inputs across push/PR/merge, retaining immutable-migration checks and actual disposable-runner coverage; test event/path behavior before claiming reduced runs. |
| Legacy R052 business/foundation validators require full browser evidence. R053 additionally pins a manual-dispatch receipt while supporting selected artifact-input equivalence. | Future promotion tooling should accept reviewed test selection, actual required results and explicit input equivalence. Preserve target/artifact/SQL/authority/recovery guards and immutable historical receipts. |
| Manual `deploy-dev.yml` deploys the original DEV API, repeats app checks and does not publish Hosting. | It is not the full live PWA delivery route. Reuse maintained scoped delivery, then consolidate around verified artifact inputs/results so deployment consumes evidence rather than repeats unchanged checks. |

These follow-ups are implementation work, not extra gates for completing this policy update. No workflow, deployment or live-operation changes are made here. Required branch checks still apply until intentionally updated; this policy does not authorize bypassing them.

## Records and communication

Keep one batch record, one design/test contract when needed and one sanitized result manifest. Link source/artifact/test/recovery pins from required records rather than copy hash lists everywhere. Progress owns current status/acceptance, the implementation plan owns scope, the tracker owns release state and change logs retain history. Update affected facts only and preserve concurrent work.

Handoffs contain changed scope, paths, decisions, result/blocker and exact next action, normally under 300 words. C supplies concise evidence; root reviews it without repeating passing tests. Reuse representative screenshots, bounded reads and event-driven waits. Report meaningful progress/limitations, not unchanged polling. Optional time/token measurements use existing evidence and never become a gate.

<a id="routine-ui-delivery--owner-revision-8-october-2026"></a>
<a id="consolidated-ui-checkpoints--owner-revision-9-october-2026"></a>
<a id="delivery-cycle--owner-revision-8-october-2026"></a>
<a id="batched-validation"></a>

Older delivery anchors are retained for compatibility; the owning rules are now [Proportional validation](#proportional-validation), [Evidence reuse](#evidence-reuse-and-exact-candidate-identity) and [Minimal production promotion](#minimal-production-promotion).
