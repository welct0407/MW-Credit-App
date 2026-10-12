# PWA orchestration and owner review

**[Overall progress: completed, current review and next steps](PWA_Progress.md)** — updated at every development-session closeout.

Owner instruction: 7 October 2026; team revision: 11 October 2026 (Asia/Bangkok). Applies to the [implementation plan](PWA_Implementation_Plan.md); it overrides generic model defaults for this implementation only.

## Responsibilities

| Role | Model and effort | Responsibility |
| --- | --- | --- |
| Main conversation | Orchestrator | Manage all agents, keep direction and scope aligned, coordinate dependencies, review evidence, facilitate issues and lead team resolution and owner checkpoints |
| Agent A — Architect | GPT-6 Astra High | Detailed phase/slice design, an executable test plan alongside each design, decisions and direction for development challenges |
| Agent B — Coding | GPT-6 Astra Medium | Implement Agent A's agreed design and address defects |
| Agent C — Testing | GPT-6.1 Sol Medium | Execute Agent A's test plan against Agent B's implementation, record failures and evidence, and retest corrections; escalate ambiguities or missing coverage to A |
| Agent D — Miscellaneous / Delivery and Documentation | GPT-6.1 Sol Medium | Miscellaneous execution, tooling, documentation, evidence, delivery coordination and authorized publication; coordinate infrastructure prerequisites with F |
| Agent E — User Experience Officer | GPT-6 Astra Low | User Experience Officer: requested desktop, iPhone Pro Max and iPad UX review and suggestions only; unique human-readable codes grouped by page; no automatic activation or implementation without owner approval |
| Agent F — Infrastructure | GPT-6 Astra Low | Infrastructure: Terraform, cloud resources, IAM, Secret Manager, networking and infrastructure configuration; scoped service authority still applies |

**Current team — owner revision, 11 October 2026:** Agent A — Architect (GPT-6 Astra High); Agent B — Coding (GPT-6 Astra Medium); Agent C — Testing (GPT-6.1 Sol Medium); Agent D — Miscellaneous / Delivery and Documentation (GPT-6.1 Sol Medium); Agent E — User Experience Officer (GPT-6 Astra Low); Agent F — Infrastructure (GPT-6 Astra Low). D retains miscellaneous/tooling/support and evidence/publication coordination; F owns Terraform/cloud/IAM/Secret Manager/networking configuration. A/B/C/D/F were activated for this continuation; E remains inactive and request-only. Earlier workers were unavailable, so root used the owner-authorized role replacements for this chat. Use role-qualified names in documentation and updates; transient tool IDs belong to session evidence and are not durable team names or claims of renamed chats. Reuse active workers within platform capacity. Future authorized worker task names include their role. No production/service authority follows from a role assignment.

**Historical dispatch note:** earlier on 8 October, `agent_c_testing_sol` and `agent_d_infrastructure_sol` were accepted with `gpt-6.1-sol` / `medium`, superseding former Astra Low C/D workers without modifying those old threads. At that dated checkpoint, C was recorded as `agent_c_phase4_completion`. Root confirmed the redundant `agent_d_delivery_recovery` worker retired; old `agent_c_testing`, `agent_c_testing_sol` and `agent_d_infrastructure` were not live when checked. These dated dispatch facts do not override the current D/F responsibility split or unrelated task/model/service settings.

## Routine UI delivery — owner revision, 8 October 2026

This path takes precedence over generic full-suite requirements for routine UI work. Classify by changed behavior, not filename: financial/auth/access/database/infrastructure changes receive relevant immediate verification and applicable protections; broad suites require changed-risk/dependency or consolidated-checkpoint justification. Additive display-only API fields are not automatic full-suite triggers.

For routine UI, reuse the existing design. B implements one coherent batch; C runs relevant checks and ONE representative visual pass; D publishes and deploys the changed DEV frontend after those checks pass. Consult A only for a real requirement ambiguity or architectural decision. Preserve accessibility, readability, errors and recovery. Cosmetic reversible edits use existing build/type checks as needed plus the visual check; do not add tests that merely mirror CSS or text. Add regression tests when changed interactions create a meaningful failure risk.

Remote CI may run asynchronously for low-risk UI and its status must be reported honestly. Do not run backend, database, Terraform or global suites, or rebuild/deploy unchanged components. Rebuild a changed frontend when its source/build inputs require it; tests/docs-only changes do not rebuild unchanged app artifacts. Separate independent UI from substantive changes so its review/delivery is not held by unrelated sensitive gates; those changes retain their own mandatory checks and unresolved relevant failures still block dependent delivery.

Reuse the existing B/C/D workers and compact direct B–C defect handoffs. Freeze the coherent source once, publish at a useful checked point rather than chaining trivial commits, and close once. Stop after passing relevant checks and the required deployed smoke; do not repeat unchanged tests, visuals or worker wake-ups. Escalate a concrete blocker promptly instead of adding ceremonial reviews or promising a fixed delivery time. Production authorization and product/owner-acceptance boundaries are unchanged.

## Consolidated UI checkpoints — owner revision, 9 October 2026

Strictly batch several related UI iterations into one agreed consolidated checkpoint. This revision governs validation frequency and supersedes older generic full-suite gates for every backend or small UI delivery. B implements coherent iterations; C uses existing type/build checks as needed, affected interaction checks and a representative DEV visual pass; D delivers changed components after relevant passes. Reuse A/design unless ambiguity or architecture changes. Preserve accessibility, readable details, errors and recovery; do not add tests that merely mirror CSS/text.

Run full browser CI once on the final agreed consolidated checkpoint ref and before promotion, not once per small edit, selector fix or screenshot. An additive display-only API field is not an automatic full-suite trigger: verify its source binding/read/auth boundary and affected UI, then carry it with the batch. Financial, authentication, access and database changes require relevant immediate verification and applicable recovery; broad suites run only when changed behavior/dependencies justify them or at the checkpoint. Do not rebuild or test unchanged components; tests/docs-only changes retain exact-input artifact reuse. Independent UI must not wait for unrelated sensitive gates.

A stale selector/label failure gets affected-test repair/verification during iteration. At a failed consolidated checkpoint, preserve unaffected passes and artifacts, then run full browser CI on the corrected consolidated ref once ready. A skipped-success ordinary CI job is not full proof; neither an older green nor product acceptance proves the final source. Before promotion require full exact final-candidate evidence and all applicable database/authorization/recovery protections.

Current automation: ordinary app PR updates still start the existing unit/build/audit/Terraform workflow; they skip browser installation/full E2E. Apply or reapply `ci:checkpoint` to the PR at the agreed ref to run full browser checks; leaving that label on later edits does not trigger full E2E. Main pushes/manual runs stay full. Verify the actual checkpoint run SHA and executed E2E step. The unrelated unpublished path router remains unpublished, so do not claim path-selective automation or no automatic runs. Keep one short direct B–C handoff and one closeout; communicate meaningful previews/results/deployments or blockers, not repeated unchanged CI narration. Reuse the appropriate A–D workers; E joins requested UX reviews only and F handles scoped infrastructure work.
## Delivery cycle — owner revision, 8 October 2026

Apply from the next safe handoff. Do not restart completed work, cancel active operations or invalidate sound evidence merely to adopt this process.

1. **Define one coherent batch.** Root states the user outcome, included changes, exclusions, current release/baselines, file owners, existing authority and owner-review stopping point in the [batch record](templates/PWA_Batch_Record.md). A batch may include several related refinements within the authorized scope; it is not permission to cross an owner checkpoint.
2. **Design once, prepare in parallel.** A supplies a bounded design and executable test plan: prerequisites, cases/commands, expected outcomes and required evidence. D checks delivery/access/recovery dependencies and coordinates infrastructure prerequisites with F when that scope is activated. Reuse existing designs for routine refinements and record only their delta. No ceremonial A review for an unchanged design.
3. **Implement and verify concurrently where independent.** B owns application implementation; C prepares fixtures and executes A's plan against B's candidate. D prepares delivery and concise documentation. Schedule workers within the available platform slots; A finishes its handoff before B/C/D run together where capacity permits, and F joins only for a concrete infrastructure dependency.
4. **Resolve ordinary defects directly.** C sends B the failing case, expected/actual result and concise reproduction. B fixes it; C reruns affected cases. A resolves requirement conflicts, architectural/security choices and missing test coverage. Root handles scope, authority and cross-owner conflicts. Escalate an unexplained repeated failure rather than looping.
5. **Deliver one checked candidate.** Freeze intended source once, use the validation matrix below, and have D publish/deploy only changed components under existing authority. C verifies relevant deployed behavior. Rebuild only when source, dependencies or build configuration invalidate the artifact. Test/docs-only commits do not themselves require rebuilding unchanged application artifacts; record both source and evidence commits.
6. **Close once and pause.** D updates authoritative records and publication evidence as one coherent batch. Root verifies completion, presents a concrete result and pending limitations, then stops for owner review/go-ahead. Every development session ends with a current progress update, even if the batch is incomplete.

Keep quick local previews inside the batch. Low-risk visual feedback does not need a remote CI wait or a new release ceremony. Do not combine unrelated or risky changes solely to reduce the number of checks. Production authorization, financial-write boundaries, immutable migrations, recovery and independent verification remain unchanged.

## Handoffs, context and communication

- Use one maintained batch record and relevant file links. Default handoff: outcome/state, changed paths, decisions, test command/result, blocker and exact next owner/action; normally under 300 words, expanding when correctness requires it.
- Reuse the existing worker for its assigned role. Send only changed scope/evidence on resume, not the entire history or repeated repository inventories. Read applicable instructions once per context and again when changed; inspect affected files with bounded reads.
- Make handoffs event-driven: design ready, candidate ready, failed check, blocker, verified result. Do not dispatch all agents to acknowledge routine work, repeatedly wake an idle worker without a new task, or relay the same finding through every role.
- For a long prerequisite, let the worker finish with a resumable handoff; root resumes it once actionable evidence exists. A queued message is not proof that a completed worker restarted. Within an active bounded task, perform independent authorized work while waiting.
- C supplies concise failures and final result links, not full successful logs. Root reviews the consolidated evidence and changed visuals rather than re-executing C's passing tests. Screenshots cover changed representative states; reuse unaffected captures.
- Use bounded event waits instead of repeated unchanged polling. Keep user progress updates within platform-required cadence; report actual milestones, blockers or pending work without inventing progress.
- One owner controls each mutable file/live object at a time. Avoid shared staging changes and overlapping infrastructure/database mutation. Isolated worktrees do not isolate shared services.

## Authoritative records and closeout

| Information | Owning record | Rule |
| --- | --- | --- |
| Current product status, owner acceptance, next step | [PWA Progress](PWA_Progress.md) | Update at every session closeout and material blocker/decision; replace stale current statements |
| Phase scope, dependency and exit criteria | [Implementation plan](PWA_Implementation_Plan.md) | Change only when scope/dependencies change; link current progress |
| Current batch scope/handoffs | One batch record, based on the [template](templates/PWA_Batch_Record.md) | Link design/evidence; do not copy them |
| Design and executable acceptance plan | A's checkpoint design/test plan | One maintained contract per coherent batch |
| Test/build/deployment results | App-owned sanitized evidence/manifest | Source/artifact/environment pins and actual results, including reuse/invalidation |
| Decisions and historical changes | Owning change log | Concise chronology; preserve history without making it current policy |
| Release/environment/model facts | Existing owning trackers/inventory/dictionary | Update only affected facts under existing rules |

D records source/artifact/evidence pins once in the manifest and links them elsewhere; no parallel lists of hashes and test counts across every summary. Preserve required release records, but avoid copying technical evidence. Distinguish implemented, locally tested, CI-validated, deployed and owner-accepted. Missing evidence is pending/unavailable, not passing.

Close the remaining Phase 1 parity and acceptance gaps in a bounded planning milestone before expanding into further unplanned feature families. A maps each enabled workflow to its destination, dependency, test and unresolved decision. Root schedules this alongside the existing authorized work; this policy does not stop a safe in-flight operation or falsely mark Phase 1 complete.

## Batched validation

| Delivery point | Required validation |
| --- | --- |
| Small UI preview | Build and A's targeted local checks executed by C; show immediately after passing |
| Low-risk UI-only DEV deployment | Relevant passing local checks on the candidate and deployed smoke; remote CI may run asynchronously |
| Coherent delivery milestone | Full remote Development checks on the consolidated candidate; separate Database checks when applicable |
| Backend/auth/access/database/financial/infrastructure change | Relevant immediate tests and recovery/authority protections for changed behavior; full remote validation at the final consolidated checkpoint, including applicable database/Terraform checks |
| Phase completion or production candidate | Full exact-candidate validation, applicable database checks and existing acceptance/authorization gates |

Authentication or financial code in a frontend file is not cosmetic. C records reused evidence and the conditions under which it stays valid: unchanged relevant source/dependencies/environment/assumptions. Rerun invalidated cases after fixes; one final focused candidate pass is sufficient unless a concrete concern requires more. Do not duplicate B's pure cases under C's name without an independent risk or acceptance reason. Retain actual SDK/SQL/runtime-identity verification where mocks cannot prove the behavior.

A docs-only/affected green CI is not a full candidate pass and cannot clear an earlier unresolved failure. D records validation mode and last applicable full source; run full Development checks on the consolidated ref and confirm the resolved commit. Run separate Database migrations where required. Keep existing migration-integrity, protected-object, rollback and owner checks. If manual full dispatch is unavailable on the default branch, use an existing valid full path rather than waive the gate.

Do not push once per save or screenshot. Group intended checked source/evidence into coherent publication points. Cancel obsolete CI, never automatically cancel deployment or database operations. A failed check blocks dependent delivery until resolved; unaffected authorized work may continue.

## Delivery tooling follow-through

These are tracked engineering improvements, not claims of implementation or permission to change live infrastructure. D verifies their actual status before use:

| Work item | Owner and completion evidence |
| --- | --- |
| Finish affected-check routing and deduplicate push/PR database runs | D; representative event/path tests plus one remote run per intended candidate; retain main/manual full checks |
| Separate auth/session code from the presentation shell | A defines boundary, B refactors, C verifies unchanged auth and UI; narrower CI must not hide sensitive changes |
| Run independent app/Terraform checks concurrently | D coordinates app checks and F owns infrastructure validation; both results remain required where applicable; preserve the required-check identity |
| Classify only vetted evidence-only paths as cheap | D with A/C review; no blanket exclusion for JSON, fixtures or migration manifests |
| One maintained delivery entrypoint for the actual live services | D; explicit target/source/config/artifact, recovery capture, changed-component delivery, smoke and sanitized manifest; prove with scoped DEV rehearsal |

D coordinates application delivery and publication; F owns any required Terraform/cloud/IAM/Secret Manager/networking configuration. The historical readiness-API/synthetic-site workflow is not the default live-app delivery route. Until a unified entrypoint is verified, reuse the current maintained scoped procedure; do not improvise a new deployment command every batch or replace a working route prematurely.

## Measure the next two delivery batches

Use the small metrics section in the batch record, populated from existing timestamps/evidence once at closeout: start, first reviewable preview, implementation freeze, CI start/end, delivery completion, CI attempts, handoffs and repeated-test reasons. Derive time to preview, CI elapsed and closeout time; distinguish waits from execution when evidence allows.

Record token usage only if actual per-run measurements are available; otherwise mark unavailable. Do not infer token savings from elapsed time, rerun tests to measure them or create a monitoring service. After two batches, root compares the results and recommends further adjustments. Measurement must not become another completion gate.

## Current checkpoint and reporting order

[PWA Progress](PWA_Progress.md) owns current status; [checkpoint evidence](../outputs/r052-pwa/README.md) and change logs own history. The process rules do not restate historical pending checks.

**Owner checkpoint order — 11 October 2026:** complete the authorized work through Phase 6, fix affected defects, and run one consolidated CI checkpoint on the final corrected source. Deliver the reviewed DEV candidate for owner hands-on testing before starting Phase 3 production readiness. No PROD changes are authorized in this batch. Passed tests and DEV delivery do not infer owner acceptance or permission to advance.

Phase 7 Metabase enhancements remain post-go-live. Existing reporting access and required native OLAP management remain in scope. No phase advancement or owner acceptance follows from this process update alone.


**Owner checkpoint cleared — 11 October 2026:** owner explicitly verified Phase5/6 and requested starting Phase3. Phase5/6 acceptance is recorded; the prior pause is cleared. A Architect, F Infrastructure and D Miscellaneous / Delivery and Documentation prepare the bounded Phase3 design/configuration/read-only inventory batch. E remains request-only; no particular owner-tested device or future production authority is inferred. [Batch](../outputs/r052-pwa/phase3-foundation-batch.md).
