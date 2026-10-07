# PWA orchestration and owner review

**[Overall progress: completed, current review and next steps](PWA_Progress.md)** — updated at every development-session closeout.

Owner instruction: 7 October 2026. Applies to the [implementation plan](PWA_Implementation_Plan.md); it overrides generic model defaults for this implementation only.

## Responsibilities

| Role | Model and effort | Responsibility |
| --- | --- | --- |
| Main conversation | Orchestrator | Manage all agents, keep direction and scope aligned, coordinate dependencies, review evidence, facilitate issues and lead team resolution and owner checkpoints |
| Agent A | GPT-6 Astra High | Detailed phase/slice design, decisions and direction for development challenges |
| Agent B | GPT-6 Astra Medium | Implement Agent A's agreed design and address defects |
| Agent C | GPT-6 Astra Low | Independently test Agent B's implementation, report failures and retest corrections |
| Agent D | GPT-6 Astra Low (Astra Light) | All infrastructure and miscellaneous execution, including tooling, deployment, documentation, evidence and authorized publication |

The owner's reference to Agent C testing its own work is interpreted as testing the Coding Agent B's work. All four requested agent/model configurations were dispatched successfully in this conversation. The owner assigned all future infrastructure and miscellaneous tasks to D; the main conversation manages and reviews the team. Agents are on-demand workers, not a persistent unattended service.

## Delivery loop and stop rule

1. Orchestrator identifies a bounded slice, its baseline and meaningful visual checkpoint.
2. A inspects relevant evidence and supplies design, limitations and acceptance scenarios.
3. B implements that design. C may prepare coverage independently but tests the resulting implementation.
4. B fixes failures; A resolves architectural ambiguity. C verifies affected behavior.
5. D completes infrastructure, documentation and authorized publication. **Owner rule, 7 October 2026:** after every development session, update the single [overall progress overview](PWA_Progress.md) with the Bangkok date, completed/tested/deployed/accepted distinctions, current checkpoint, pending review, concrete next step, blockers and evidence. Keep phase statuses aligned with the roadmap; no inferred acceptance or invented percentage. The orchestrator verifies this closeout and presents a concrete preview plus status.
6. All workers stop at the checkpoint. Wait for the owner's visual validation and go-ahead before starting the next slice. Do not treat silence, a passed test or a phase boundary as permission to continue.

A checkpoint may occur inside a phase. Distinguish prototype review, feature acceptance, live validation and production authorization. A user-visible mockup is not evidence of authenticated data access or financial correctness.

## Coordination boundaries

Assign disjoint file ownership; the orchestrator coordinates shared scope and dependencies while D executes authorized Git publication, release documentation, credentials and infrastructure work. Existing schema/production authority still applies. Worktrees do not isolate the shared DEV database. Reuse the current Open release; R052 is the recorded release at this checkpoint. Read the tracker again before subsequent development.

No production mutation, financial posting, scheduler switch or AppSheet cutover is authorized by this orchestration setup. Existing scoped owner authority and repository controls govern those future actions. Do not expose real borrower data in previews or test artifacts.

## Current checkpoint

Checkpoint 1A: recorded feature baseline and local synthetic Collection/Borrowers preview, visually accepted by the owner on 7 October 2026. Checkpoint 1B read/access contracts and denied-access simulator were accepted by the owner, including darker separators; continuation to checkpoint 2A was authorized; its [design](../outputs/r052-pwa/checkpoint-1b-design.md) records the owner-only initial DEV pilot and the live-auth boundary. Design and feature gaps are recorded under [R052 PWA evidence](../outputs/r052-pwa/README.md).

Accepted review: mobile/desktop navigation and layout, Collection versus Borrowers presentation, search/filter/detail flow, English/Thai labels and readable themed styling. Checkpoint 2A authentication/read source passed 72 unit and 2 mocked UI tests. DEV reader grants and the separate read service exist; the owner-approved service-only Firebase authentication setting is applied after domain-restricted sharing rejected allUsers. Owner reported successful real Google login/list/detail; the actual verified UID is pinned. Final CI37615986417 passed after the tested tooling correction; checkpoint 2A is complete. The owner subsequently said “ok. continue”; checkpoint 2B related loan reads are now deployed and independently verified, with owner visual validation pending. All workers stop at this checkpoint. Real offline storage and payment posting remain future work.

## Revised reporting order

Phase 7 Metabase changes are post-go-live work. Existing reports remain available through their retained authorized interfaces; required native OLAP management and production monitoring stay in the launch scope. The deferral must not create a hidden prerequisite in phases 8–12.

## Checkpoint 2B owner feedback

The owner requested presentation/source-label refinements after the first related-loan preview; checkpoint2B is not accepted yet. A settled exact Loan Key, bilingual borrower label, profit and grouping semantics; B implemented, C verified, and D completed bounded permissions, deployment and publication. The refined page and final smoke passed; owner visual acceptance remains pending. Stay at the same visual checkpoint. Broader field parity remains planned work, not unrestricted database access.

Neutral UI delivery: exact frontend source d59904124cb595b9a3a8b4156289cd549b3a6064 passed CI37634043751 and actual-config build, published Hosting e112e2801d7ff306/release1791382263648000. Rollback Hosting3f33c848f8542024. API source9ffc957/revision00005-wn4 and DB/auth/IAM remain unchanged. Signed-out smoke pending; owner visual acceptance pending. Subsequent persistent-sign-in request is queued separately and is not included here.

Final independent Hosting smoke passed e112e2801d7ff306: signed-out EN/Thai desktop1440x900/mobile390x844, DEV orange header and white access panel, zero records/API requests/overflow. No API probes or owner login repeated. Sanitized neutral-live-hosting.json and NEUTRAL-live screenshots are published with the report. Owner visual acceptance remains pending; neutral UI delivery complete.

Persistence deployment: exact11c91c2f952ade53265f8bc41cf3f5a160399a97 passed CI37636993134 and managed-config build. Hosting922b3ab61894b240/release1791383539803000 deployed; rollback e112e2801d7ff306. API00005-wn4/backend/DB/IAM unchanged; no real tokens/auth stores saved. Final unsigned smoke and actual owner refresh confirmation pending.

Final C signed-out desktop/mobile EN/Thai smoke including reload passed on922b3ab61894b240, with zero records/API requests/overflow. No live owner login or backend probes repeated. Evidence outputs/r052-auth-persistence/live-hosting.json and synthetic/unsigned report is complete. Actual owner Google refresh/reopen confirmation remains pending; delivery complete and agents stop.

Owner validation received: 'Yes-refresh keeps me signed in' after the deployed sign-in/refresh/borrower-list check. This confirms actual owner refresh persistence only; full browser reopen remains synthetic-SDK evidence. Neutral visual approval and full Phase2 acceptance are not implied. Persistence follow-up complete.
