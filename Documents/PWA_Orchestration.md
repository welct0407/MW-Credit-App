# PWA orchestration and owner review

Owner instruction: 7 October 2026. Applies to the [implementation plan](PWA_Implementation_Plan.md); it overrides generic model defaults for this implementation only.

## Responsibilities

| Role | Model and effort | Responsibility |
| --- | --- | --- |
| Main conversation | Orchestrator | Own scope, dependencies, shared-resource coordination, integration, evidence, publication and owner checkpoints |
| Agent A | GPT-6 Astra High | Detailed phase/slice design, decisions and direction for development challenges |
| Agent B | GPT-6 Astra Medium | Implement Agent A's agreed design and address defects |
| Agent C | GPT-6 Astra Low | Independently test Agent B's implementation, report failures and retest corrections |

The owner's reference to Agent C testing its own work is interpreted as testing the Coding Agent B's work. The three requested agent/model configurations were dispatched successfully in this conversation. Agents are on-demand workers, not a persistent unattended service.

## Delivery loop and stop rule

1. Orchestrator identifies a bounded slice, its baseline and meaningful visual checkpoint.
2. A inspects relevant evidence and supplies design, limitations and acceptance scenarios.
3. B implements that design. C may prepare coverage independently but tests the resulting implementation.
4. B fixes failures; A resolves architectural ambiguity. C verifies affected behavior.
5. Orchestrator reviews evidence, preserves unrelated work, publishes the checked package and presents a concrete preview plus status.
6. All workers stop at the checkpoint. Wait for the owner's visual validation and go-ahead before starting the next slice. Do not treat silence, a passed test or a phase boundary as permission to continue.

A checkpoint may occur inside a phase. Distinguish prototype review, feature acceptance, live validation and production authorization. A user-visible mockup is not evidence of authenticated data access or financial correctness.

## Coordination boundaries

Assign disjoint file ownership; only the orchestrator coordinates shared Git publication, release state, live migrations, credentials and infrastructure. Worktrees do not isolate the shared DEV database. Reuse the current Open release; R052 is the recorded release at this checkpoint. Read the tracker again before subsequent development.

No production mutation, financial posting, scheduler switch or AppSheet cutover is authorized by this orchestration setup. Existing scoped owner authority and repository controls govern those future actions. Do not expose real borrower data in previews or test artifacts.

## Current checkpoint

Checkpoint 1A: recorded feature baseline and local synthetic Collection/Borrowers preview, visually accepted by the owner on 7 October 2026. Checkpoint 1B read/access contracts and denied-access simulator are implemented and verified; all workers stopped for owner review; its [design](../outputs/r052-pwa/checkpoint-1b-design.md) records the owner-only initial DEV pilot and the live-auth boundary. Design and feature gaps are recorded under [R052 PWA evidence](../outputs/r052-pwa/README.md).

Accepted review: mobile/desktop navigation and layout, Collection versus Borrowers presentation, search/filter/detail flow, English/Thai labels and readable themed styling. Authentication, business API access, real offline storage and payment posting remain future implementation.

## Revised reporting order

Phase 7 Metabase changes are post-go-live work. Existing reports remain available through their retained authorized interfaces; required native OLAP management and production monitoring stay in the launch scope. The deferral must not create a hidden prerequisite in phases 8–12.
