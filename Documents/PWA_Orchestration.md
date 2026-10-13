# PWA delivery, validation and promotion

**Owner revision: 14 October 2026 (Asia/Bangkok).** Optimize for a two-user application: short batches, direct execution, useful tests and a single concise record. This is the test-selection policy; [Release Workflow](Release_Workflow.md) owns promotion mechanics. Old phase plans, full-checkpoint receipts and retired AppSheet procedures add no new gates.

## Responsibilities

Default to one executor. A routine change does not need separate architect, coder, tester and documentation handoffs. Use the roster only where delegation is authorized and an independent task benefits from it; reuse workers and do not duplicate roles. The owner may request that the main agent perform all work personally.

| Role | Responsibility |
| --- | --- |
| Main conversation — Orchestrator | Own scope, authority, integration and completion; perform routine work directly |
| Agent A — Architect | Resolve actual design ambiguity; supply a compact executable test plan for that design |
| Agent B — Coding | Implement and fix the agreed behavior |
| Agent C — Testing | Independently check affected behavior when warranted; report reproduction and evidence |
| Agent D — Miscellaneous / Delivery and Documentation | Tooling, delivery coordination, records and support |
| Agent E — User Experience Officer | Request-only desktop/iPhone Pro Max/iPad review; recommendations grouped by page/category with unique human-readable codes |
| Agent F — Infrastructure | Terraform, cloud resources, IAM, Secret Manager, networking and infrastructure configuration |

Exact models/efforts live only in [Model Work Mapping](Model_Work_Mapping.md). Names include roles. Role assignment grants no extra authority. One writer owns each mutable file/live object; worktrees do not isolate shared DEV services.

## One coherent delivery batch

1. State the outcome and relevant checks in the existing log/task note. Reuse established design; create a separate design only for a material ambiguity or boundary change.
2. Implement related changes together. Use the smallest useful checks during iteration; fix defects directly without status-only handoff loops.
3. Run the selected acceptance checks once on the completed batch. Preserve unaffected passes after corrections.
4. When authorized, deploy only changed components from verified artifacts and perform one bounded deployed smoke.
5. Record results/limitations and publish once. No extra owner checkpoint, design review or sign-off unless requested or necessary to resolve a real gap.

The [optional batch note](templates/PWA_Batch_Record.md) is for longer handoffs, not another required record.

## Proportional validation

Classify changed behavior, not filenames. Frontend authorization or financial logic is sensitive; an API display label is not automatically broad regression.

| Change | Sufficient default |
| --- | --- |
| Documentation/policy only | Intended diff and relevant links/consistency; no product CI or live audit |
| Text/style/layout | Build/type check if executable inputs changed; one visual check of affected states on the relevant device; no tests mirroring wording/CSS |
| Bounded UI interaction or read field | Focused regression plus affected data/access binding; one representative UI pass |
| Shared navigation/session/service worker/cache/build/dependencies or several interacting workflows | Affected integration coverage; one consolidated broader run when focused tests cannot cover the shared impact |
| Financial/authentication/authorization/data behavior | Relevant positive/negative, role, retry/concurrency and reconciliation checks; disposable or DEV proof of real SQL/runtime behavior where mocks are insufficient |
| Migration/database runner | Canonical disposable database CI and affected feature proof; reuse the migration-chain test already executed by that runner |
| Infrastructure | Format/validate/reviewed plan for the affected stack, scoped actual readback/health; no unrelated browser/DB suite |

For UI, choose the device that exposes the change: iPhone Home Screen behavior for installation/push, desktop for desktop layout, additional viewports only for responsive/shared effects or an explicit request. Agent E's full review matrix is not a routine release prerequisite.

When broad CI is warranted, finish the source batch first and run **one consolidated acceptance run**. Reuse it for promotion. Do not launch another solely for merge, documentation, release number, phase closure or deployment. After fixes rerun failed/invalidated checks; repeat the full suite only when broader evidence actually became invalid. Do not duplicate a required automatic CI run with a manual dispatch.

## Evidence reuse and exact candidate identity

Record source/artifact/configuration pins once in the owning manifest or promotion record. A documentation or merge SHA may differ from the artifact source when relevant inputs remain identical. Verify that with a bounded diff/input manifest; do not compare entire repositories repeatedly.

For build reuse compare component/shared code, dependencies, build tooling/assets and environment configuration. For test reuse also compare tests, fixtures, runner configuration and relevant identity/data assumptions. Build environment variants where necessary; never relabel a DEV artifact PROD.

A skipped test is not a pass. A green badge does not prove that required steps executed. Old evidence cannot clear a known relevant failure. Reuse unaffected results rather than repeatedly auditing access, receipts, jobs or every page.

## Minimal production promotion

Follow the five-step [release workflow](Release_Workflow.md#promotion) using its single compact record. Reuse scoped authorization and actual test/recovery evidence, promote the tested artifact, check the affected deployed behavior and update changed facts. Production payment/push/job execution is not implicit in a UI deployment.

No retired app editor, copy, upgrade, branding or source-parity check applies. No database backup for UI-only work. New tables/columns, financial integrity, authentication/access, migration backup and scoped production authority retain the protections in [AGENTS](../AGENTS.md).

## Current automation and follow-up

Source inspected **14 October 2026**. This policy changes no product workflow or validator; implementation limits remain explicit:

| Tool | Actual constraint |
| --- | --- |
| App `ci.yml` | Main pushes/manual dispatch run broad checks including E2E; PR E2E executes only on the `ci:checkpoint` label event, not later synchronize events with the label still present. Other listed PR steps run even for docs. |
| `database.yml` | Path-filtered, but push and PR events can duplicate checks and database documentation paths also trigger it. |
| `deploy-dev.yml` | Manual main-only original API deployment; repeats checks and does not publish Hosting. It is not the complete PWA release route. |
| Legacy foundation/business/R053 validators | Retain historical full-browser/manual-dispatch receipt requirements; they do not implement general proportional check selection. |

Required checks/guards remain effective. Report a concrete conflict once; update the owning tool through a scoped tested change rather than bypass it or fabricate receipts. Useful future tooling work is affected-input routing, duplicate-run suppression and deployment consuming existing evidence. It is not an extra gate for this instruction cleanup.

## Records and communication

Keep one concise change log and the existing release record/runner manifest. Update progress only when project status changes, the tracker at release transitions and inventory/model/runbooks only for changed facts. Delete obsolete documents; Git retains history. Do not duplicate hash lists or create a continuation file for a completed task.

A handoff normally fits within 300 words: outcome, scope/paths, authority, pins/results and next action. Review evidence without repeating its checks. Prefer bounded searches, batched reads and meaningful progress updates over unchanged polling. Routine token/time measurement is optional, never a delivery gate.

<a id="routine-ui-delivery--owner-revision-8-october-2026"></a>
<a id="consolidated-ui-checkpoints--owner-revision-9-october-2026"></a>
<a id="delivery-cycle--owner-revision-8-october-2026"></a>
<a id="batched-validation"></a>
Older delivery links resolve here; current rules are the sections above.
