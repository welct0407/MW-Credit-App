# PWA orchestration and owner review

**[Overall progress: completed, current review and next steps](PWA_Progress.md)** — updated at every development-session closeout.

Owner instruction: 7 October 2026; team revision: 8 October 2026 (Asia/Bangkok). Applies to the [implementation plan](PWA_Implementation_Plan.md); it overrides generic model defaults for this implementation only.

## Responsibilities

| Role | Model and effort | Responsibility |
| --- | --- | --- |
| Main conversation | Orchestrator | Manage all agents, keep direction and scope aligned, coordinate dependencies, review evidence, facilitate issues and lead team resolution and owner checkpoints |
| Agent A | GPT-6 Astra High | Detailed phase/slice design, an executable test plan alongside each design, decisions and direction for development challenges |
| Agent B | GPT-6 Astra Medium | Implement Agent A's agreed design and address defects |
| Agent C | GPT-6.1 Sol Medium | Execute Agent A's test plan against Agent B's implementation, record failures and evidence, and retest corrections; escalate ambiguities or missing coverage to A |
| Agent D | GPT-6.1 Sol Medium | All infrastructure and miscellaneous execution, including tooling, deployment, documentation, evidence and authorized publication |
| Agent E | GPT-6 Astra Low | User Experience Officer: requested UX review and suggestions only; grouped human-readable codes by page; no automatic activation or implementation without owner approval |

**Current worker roster — owner revision, 11 October 2026:** A `agent_a_architect` (GPT-6 Astra High), B `agent_b_coding` (GPT-6 Astra Medium), C `agent_c_phase4_completion` (GPT-6.1 Sol Medium), D `agent_d_infrastructure_sol` (GPT-6.1 Sol Medium), and owner-authorized E `agent_e_user_experience` (GPT-6 Astra Low). A–D responsibilities remain unchanged. E reviews user experience and supplies uniquely coded, human-readable suggestions grouped by page only on owner request; no automatic activation, product edits or implementation without owner approval. This narrowly supersedes the former four-worker limit for E only. Reuse these existing workers; do not create parallel replacements or recovery workers without explicit owner authorization. The main conversation orchestrates. Workers are on demand, not a persistent unattended service.

**Historical dispatch note:** earlier on 8 October, `agent_c_testing_sol` and `agent_d_infrastructure_sol` were accepted with `gpt-6.1-sol` / `medium`, superseding former Astra Low C/D workers without modifying those old threads. The retained current C is now `agent_c_phase4_completion`. Root confirmed the redundant `agent_d_delivery_recovery` worker retired; old `agent_c_testing`, `agent_c_testing_sol` and `agent_d_infrastructure` were not live when checked. These dated facts do not change the current four-role responsibilities or unrelated task/model/service settings.

## Routine UI delivery — owner revision, 8 October 2026

This path takes precedence over generic full-suite requirements for routine UI work. Classify by changed behavior, not filename: financial/auth/access/database/infrastructure changes receive relevant immediate verification and applicable protections; broad suites require changed-risk/dependency or consolidated-checkpoint justification. Additive display-only API fields are not automatic full-suite triggers.

For routine UI, reuse the existing design. B implements one coherent batch; C runs relevant checks and ONE representative visual pass; D publishes and deploys the changed DEV frontend after those checks pass. Consult A only for a real requirement ambiguity or architectural decision. Preserve accessibility, readability, errors and recovery. Cosmetic reversible edits use existing build/type checks as needed plus the visual check; do not add tests that merely mirror CSS or text. Add regression tests when changed interactions create a meaningful failure risk.

Remote CI may run asynchronously for low-risk UI and its status must be reported honestly. Do not run backend, database, Terraform or global suites, or rebuild/deploy unchanged components. Rebuild a changed frontend when its source/build inputs require it; tests/docs-only changes do not rebuild unchanged app artifacts. Separate independent UI from substantive changes so its review/delivery is not held by unrelated sensitive gates; those changes retain their own mandatory checks and unresolved relevant failures still block dependent delivery.

Reuse the existing B/C/D workers and compact direct B–C defect handoffs. Freeze the coherent source once, publish at a useful checked point rather than chaining trivial commits, and close once. Stop after passing relevant checks and the required deployed smoke; do not repeat unchanged tests, visuals or worker wake-ups. Escalate a concrete blocker promptly instead of adding ceremonial reviews or promising a fixed delivery time. Production authorization and product/owner-acceptance boundaries are unchanged.

## Consolidated UI checkpoints — owner revision, 9 October 2026

Strictly batch several related UI iterations into one agreed consolidated checkpoint. This revision governs validation frequency and supersedes older generic full-suite gates for every backend or small UI delivery. B implements coherent iterations; C uses existing type/build checks as needed, affected interaction checks and a representative DEV visual pass; D delivers changed components after relevant passes. Reuse A/design unless ambiguity or architecture changes. Preserve accessibility, readable details, errors and recovery; do not add tests that merely mirror CSS/text.

Run full browser CI once on the final agreed consolidated checkpoint ref and before promotion, not once per small edit, selector fix or screenshot. An additive display-only API field is not an automatic full-suite trigger: verify its source binding/read/auth boundary and affected UI, then carry it with the batch. Financial, authentication, access and database changes require relevant immediate verification and applicable recovery; broad suites run only when changed behavior/dependencies justify them or at the checkpoint. Do not rebuild or test unchanged components; tests/docs-only changes retain exact-input artifact reuse. Independent UI must not wait for unrelated sensitive gates.

A stale selector/label failure gets affected-test repair/verification during iteration. At a failed consolidated checkpoint, preserve unaffected passes and artifacts, then run full browser CI on the corrected consolidated ref once ready. A skipped-success ordinary CI job is not full proof; neither an older green nor product acceptance proves the final source. Before promotion require full exact final-candidate evidence and all applicable database/authorization/recovery protections.

Current automation: ordinary app PR updates still start the existing unit/build/audit/Terraform workflow; they skip browser installation/full E2E. Apply or reapply `ci:checkpoint` to the PR at the agreed ref to run full browser checks; leaving that label on later edits does not trigger full E2E. Main pushes/manual runs stay full. Verify the actual checkpoint run SHA and executed E2E step. The unrelated unpublished path router remains unpublished, so do not claim path-selective automation or no automatic runs. Keep one short direct B–C handoff and one closeout; communicate meaningful previews/results/deployments or blockers, not repeated unchanged CI narration. Reuse the existing A–D workers; E joins requested UX reviews only.
## Delivery loop and stop rule

1. Orchestrator identifies a bounded slice, its baseline and meaningful visual checkpoint.
2. A inspects relevant evidence and supplies design, limitations, acceptance scenarios and an executable test plan alongside each design. The plan identifies prerequisites, steps or commands, expected results and evidence to retain.
3. B implements that design. C executes A's test plan against the resulting implementation and records results, failures and evidence. C escalates ambiguities or missing coverage to A rather than silently inventing scope.
4. B fixes failures; A resolves architectural or test-plan ambiguity and supplies missing coverage. C retests fixes and verifies affected behavior using the agreed plan.
5. D completes infrastructure, documentation and authorized publication. **Owner rule, 7 October 2026:** after every development session, update the single [overall progress overview](PWA_Progress.md) with the Bangkok date, completed/tested/deployed/accepted distinctions, current checkpoint, pending review, concrete next step, blockers and evidence. Keep phase statuses aligned with the roadmap; no inferred acceptance or invented percentage. The orchestrator verifies this closeout and presents a concrete preview plus status.
6. All workers stop at the checkpoint. Wait for the owner's visual validation and go-ahead before starting the next slice. Do not treat silence, a passed test or a phase boundary as permission to continue.

A checkpoint may occur inside a phase. Distinguish prototype review, feature acceptance, live validation and production authorization. A user-visible mockup is not evidence of authenticated data access or financial correctness.

## Coordination boundaries

Assign disjoint file ownership; the orchestrator coordinates shared scope and dependencies while D executes authorized Git publication, release documentation, credentials and infrastructure work. Existing schema/production authority still applies. Worktrees do not isolate the shared DEV database. Reuse the current Open release; R052 is the recorded release at this checkpoint. Read the tracker again before subsequent development.

No production mutation, financial posting, scheduler switch or AppSheet cutover is authorized by this orchestration setup. Existing scoped owner authority and repository controls govern those future actions. Do not expose real borrower data in previews or test artifacts.

## Current checkpoint

See the authoritative [overall progress overview](PWA_Progress.md) for the current checkpoint, owner review, next steps and blockers.

## Revised reporting order

Phase 7 Metabase changes are post-go-live work. Existing reports remain available through their retained authorized interfaces; required native OLAP management and production monitoring stay in the launch scope. The deferral must not create a hidden prerequisite in phases 8–12.

## Checkpoint 2B owner feedback

The owner requested presentation/source-label refinements after the first related-loan preview; checkpoint2B is not accepted yet. A settled exact Loan Key, bilingual borrower label, profit and grouping semantics; B implemented, C verified, and D completed bounded permissions, deployment and publication. The refined page and final smoke passed; owner visual acceptance remains pending. Stay at the same visual checkpoint. Broader field parity remains planned work, not unrestricted database access.

Neutral UI delivery: exact frontend source d59904124cb595b9a3a8b4156289cd549b3a6064 passed CI37634043751 and actual-config build, published Hosting e112e2801d7ff306/release1791382263648000. Rollback Hosting3f33c848f8542024. API source9ffc957/revision00005-wn4 and DB/auth/IAM remain unchanged. Signed-out smoke pending; owner visual acceptance pending. Subsequent persistent-sign-in request is queued separately and is not included here.

Final independent Hosting smoke passed e112e2801d7ff306: signed-out EN/Thai desktop1440x900/mobile390x844, DEV orange header and white access panel, zero records/API requests/overflow. No API probes or owner login repeated. Sanitized neutral-live-hosting.json and NEUTRAL-live screenshots are published with the report. Owner visual acceptance remains pending; neutral UI delivery complete.

Persistence deployment: exact11c91c2f952ade53265f8bc41cf3f5a160399a97 passed CI37636993134 and managed-config build. Hosting922b3ab61894b240/release1791383539803000 deployed; rollback e112e2801d7ff306. API00005-wn4/backend/DB/IAM unchanged; no real tokens/auth stores saved. Final unsigned smoke and actual owner refresh confirmation pending.

Final C signed-out desktop/mobile EN/Thai smoke including reload passed on922b3ab61894b240, with zero records/API requests/overflow. No live owner login or backend probes repeated. Evidence outputs/r052-auth-persistence/live-hosting.json and synthetic/unsigned report is complete. Actual owner Google refresh/reopen confirmation remains pending; delivery complete and agents stop.

Owner validation received: 'Yes-refresh keeps me signed in' after the deployed sign-in/refresh/borrower-list check. This confirms actual owner refresh persistence only; full browser reopen remains synthetic-SDK evidence. Neutral visual approval and full Phase2 acceptance are not implied. Persistence follow-up complete.
