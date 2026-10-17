# PWA delivery, validation and promotion

**Owner revision: 17 October 2026 (Asia/Bangkok).** Use the six-agent development process below automatically in future PWA conversations. Keep batches short, tests useful and records concise for this two-user application. This document owns orchestration and test selection; [Release Workflow](Release_Workflow.md) owns promotion mechanics.

## Six-agent development process

The owner has authorized Agents A–F as the default PWA development team in every conversation; this is standing authorization to delegate. The main conversation orchestrates and activates all six roles for a product change without waiting for another request. Start each affected role with a bounded task and the shared scope. When the scope plainly excludes a role's surface (for example, no infrastructure in a UI-only fix), the orchestrator records that role as not applicable without starting a worker; when applicability is uncertain, start the role and let it return a brief not-applicable finding. Do not invent UX, infrastructure or design work to keep a worker busy. Documentation-only tasks and read-only answers may use a smaller team. A task-specific request for personal execution overrides this default.

| Role | Responsibility |
| --- | --- |
| Main conversation — Orchestrator | Own scope, authority, assignment, integration and completion; resolve shared dependencies |
| Agent A — Architect | Resolve actual design ambiguity; supply a compact executable test plan for that design |
| Agent B — Coding | Implement and fix the agreed behavior |
| Agent C — Testing | Independently verify affected behavior using the selected checks; report reproduction and evidence |
| Agent D — Miscellaneous / Delivery and Documentation | Own evolving-document maintenance across the full index; tooling, delivery coordination and existing records |
| Agent E — User Experience Officer | Automatically review affected user flows and relevant viewports; recommendations grouped by page/category with unique human-readable codes |
| Agent F — Infrastructure | Terraform, cloud resources, IAM, Secret Manager, networking and infrastructure configuration |

Exact models/efforts live only in [Model Work Mapping](Model_Work_Mapping.md). Names include roles. Role assignment grants no extra authority. One writer owns each mutable file/live object; worktrees do not isolate shared DEV services.

1. The orchestrator reads current scope, release and affected instructions, then assigns A the design/test approach, E the affected user flows and F the infrastructure impact. Keep established design decisions; each review can be short.
2. B implements the agreed batch. D handles independent tooling/records/delivery preparation. F owns infrastructure changes when in scope; E supplies actionable UX findings. Give every mutable path/object one writer.
3. C verifies the completed behavior and B/F fix relevant failures. E checks changed UX where applicable. Reuse valid test evidence; role participation does not require six duplicate test runs or six approval documents.
4. D completes the [required documentation maintenance](Development_Workflow.md#required-documentation-maintenance), updating every affected evolving document; C checks consistency with implementation/evidence. The orchestrator confirms coverage and closes the existing record/publication. The owner's production instruction supplies scoped promotion approval, including required migrations and technical records. Optional new documents still need explicit approval.

Use supported sub-agents in the current conversation, not new user-owned chats or messages to outside agents. Run roles in dependency order and in waves within the available worker limit; six roles need not run simultaneously. Reuse existing workers, including for corrections. If a required agent/model is unavailable, disclose the exact limitation once, use an available supported setting or cover that role directly, and record the fallback without claiming an agent ran. Do not stall authorized work or request the same standing delegation approval again.

## One coherent delivery batch

1. State the outcome and relevant checks in an existing log/development record and map impact across the evolving-document index. Reuse established design; resolve material design ambiguity in the existing record or chat. A separate design document needs explicit owner approval before creation.
2. Implement related changes together. Use the smallest useful checks during iteration; fix defects directly without status-only handoff loops.
3. Run the selected acceptance checks once on the completed batch. Preserve unaffected passes after corrections.
4. When authorized, deploy only changed components from verified artifacts and perform one bounded deployed smoke.
5. Update every affected evolving document, verify consistency, record results/limitations and publish once. No extra owner checkpoint is needed for existing-document updates or required records of an authorized deployment/migration; optional new documents require explicit owner approval.

Use the existing change log or continuation note for longer handoffs; the [change-note template](Development_Workflow.md#records-change-notes-and-retention) is enough. Do not add an extra design document, independent reviewer, device matrix or owner testing round for a small change. Required repository checks still apply: never claim a skipped check passed and never bypass a validator.

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

When broad CI is warranted, finish the source batch first and run **one consolidated acceptance run**. Reuse it for promotion: a valid existing CI run, or an input-equivalent artifact, can satisfy promotion. Do not launch another solely for merge, documentation, release number, phase closure or deployment. After fixes rerun failed/invalidated checks; repeat the full suite only when broader evidence actually became invalid. Do not duplicate a required automatic CI run with a manual dispatch.

## Evidence reuse and exact candidate identity

Record source/artifact/configuration pins once in the owning manifest or promotion record. A documentation or merge SHA may differ from the artifact source when relevant inputs remain identical. Verify that with a bounded diff/input manifest; do not compare entire repositories repeatedly.

For build reuse compare component/shared code, dependencies, build tooling/assets and environment configuration. For test reuse also compare tests, fixtures, runner configuration and relevant identity/data assumptions. Build environment variants where necessary; never relabel a DEV artifact PROD.

A skipped test is not a pass. A green badge does not prove that required steps executed. Old evidence cannot clear a known relevant failure. Reuse unaffected results rather than repeatedly auditing access, receipts, jobs or every page.

## Minimal production promotion

Follow the [release workflow](Release_Workflow.md#promotion) using its single compact record. “Move to production” is approval to promote the requested scope, including required tested migrations and technical records; do not request a second approval for either. Reuse actual test/recovery evidence, promote the tested artifact, check the affected deployed behavior and update changed facts. Production payment/push/job execution is not implicit in a UI deployment.

No retired app editor, copy, upgrade, branding or source-parity check applies. No database backup for UI-only work. New tables/columns, financial integrity, authentication/access, migration backup and scoped production authority retain the protections in [AGENTS](../../../AGENTS.md).

## Current automation and follow-up

Current CI/runner limitations and implementation follow-up are maintained in [Development Changes](../Development_Changes.md#delivery-tooling-status). Required checks/guards remain effective. Report a concrete conflict once; update the owning tool through a scoped tested change rather than bypass it or fabricate receipts.

## Records and communication

Use existing change/development records and reuse release records/runner manifests. Complete the full evolving-document coverage check in [Development Workflow](Development_Workflow.md#required-documentation-maintenance), updating every affected reference before completion. Unchanged facts need no cosmetic edits. Create missing technical delivery records under the authorized deployment/migration; do not ask again for their creation. Optional new documents still require explicit owner approval. Delete obsolete documents; Git retains history. Do not duplicate hash lists.

A handoff normally fits within 300 words: outcome, scope/paths and starting baseline, authority, pins/results, recovery and next action. Review evidence without repeating its checks. Prefer bounded searches, batched reads and meaningful progress updates over unchanged polling. Stop the task and its affected workers when the owner stops the task. Routine token/time measurement is optional, never a delivery gate.

<a id="routine-ui-delivery--owner-revision-8-october-2026"></a>
<a id="consolidated-ui-checkpoints--owner-revision-9-october-2026"></a>
<a id="delivery-cycle--owner-revision-8-october-2026"></a>
<a id="batched-validation"></a>
Older delivery links resolve here; current rules are the sections above.
