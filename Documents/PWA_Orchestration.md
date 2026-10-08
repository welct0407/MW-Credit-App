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

The owner's reference to Agent C testing its own work is interpreted as testing the Coding Agent B's work. On 8 October 2026, new C and D workers were dispatched successfully with `gpt-6.1-sol` / `medium`: `agent_c_testing_sol` and `agent_d_infrastructure_sol`. They supersede the former Astra Low C/D workers; the old threads were not modified. Existing A/B workers and assignments remain unchanged. The owner assigned all future infrastructure and miscellaneous tasks to D; the main conversation manages and reviews the team. Agents are on-demand workers, not a persistent unattended service.

## Routine UI delivery — owner revision, 8 October 2026

This path takes precedence over a generic milestone/full-suite requirement for routine UI work. Classify by changed behavior, not filename: financial contracts, authentication/session policy, access, backend, database and infrastructure changes still require their applicable full validation before sensitive delivery.

For routine UI, reuse the existing design. B implements one coherent batch; C runs relevant checks and ONE representative visual pass; D publishes and deploys the changed DEV frontend after those checks pass. Consult A only for a real requirement ambiguity or architectural decision. Preserve accessibility, readability, errors and recovery. Cosmetic reversible edits use existing build/type checks as needed plus the visual check; do not add tests that merely mirror CSS or text. Add regression tests when changed interactions create a meaningful failure risk.

Remote CI may run asynchronously for low-risk UI and its status must be reported honestly. Do not run backend, database, Terraform or global suites, or rebuild/deploy unchanged components. Rebuild a changed frontend when its source/build inputs require it; tests/docs-only changes do not rebuild unchanged app artifacts. Separate independent UI from substantive changes so its review/delivery is not held by unrelated sensitive gates; those changes retain their own mandatory checks and unresolved relevant failures still block dependent delivery.

Reuse the existing B/C/D workers and compact direct B–C defect handoffs. Freeze the coherent source once, publish at a useful checked point rather than chaining trivial commits, and close once. Stop after passing relevant checks and the required deployed smoke; do not repeat unchanged tests, visuals or worker wake-ups. Escalate a concrete blocker promptly instead of adding ceremonial reviews or promising a fixed delivery time. Production authorization and product/owner-acceptance boundaries are unchanged.

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
