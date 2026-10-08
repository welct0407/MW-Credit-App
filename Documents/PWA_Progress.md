# MW Credit implementation progress

**Last updated:** 8 October 2026 (Asia/Bangkok)

**Current position:** R052 is Open. Checkpoint 4E implements a local command API candidate against disposable V78 PostgreSQL with server-derived actor identity, retained command outcomes and fail-closed receipt handling. Final API tests passed 22/22 and pure contracts passed 5/5; maintained database verification passed separately. The local candidate is ready for owner review. Authentication tests inject a synthetic cryptographic-verifier seam; they do not verify real Firebase sessions or live writer authority. The concrete future runtime/access plan is ready for review. Live DEV/PROD remain V77; no new live financial endpoint, grants or GCS integration. All seven receiving paths remain required; full Phase 1, 2 or 4 completion is not claimed.

[Open DEV app](https://dev-lm.mw-credit.com) · [Fallback](https://mw-credit-app-dev-737787224638.web.app) · [Detailed roadmap](PWA_Implementation_Plan.md) · [Checkpoint evidence](../outputs/r052-pwa/README.md)

## Completed and available

| Capability | Current result |
| --- | --- |
| Development foundation | Infrastructure, delivery tooling and shared database ownership established for the recorded scope |
| Initial navigation and read/access prototypes | Checkpoints 1A and 1B accepted by the owner |
| Canonical DEV domain | HTTPS active; owner confirmed sign-in, Borrowers/Collection reads and refresh persistence |
| Traceable read errors and recovery | Server-generated references, sanitized operator logs and scoped copy/retry tested, deployed and owner-accepted |
| Borrower name search | Server-side Thai/English search and query-bound paging implemented/tested/deployed; owner review pending |
| PWA foundation | Install/update controls, public-only offline fallback and themed mobile navigation tested and deployed; owner confirmed iPhone Safari home-screen installation and installed-app offline/reconnect; native update review pending |
| Owner-only Google sign-in and borrower reads | Checkpoint 2A tested, deployed and owner-validated; actual owner identity pinned |
| Related loan list/detail and presentation refinements | Implemented, tested and deployed; neutral surfaces, grouping, readable labels and wider desktop details await final owner visual acceptance |
| Collection board, charge detail and Upcoming Charges | Tested/deployed with full-width compact header, expandable navigation and bounded first-page Upcoming previews. Owner visual/perceived-speed review pending |
| Sign-in survives refresh | Implemented, tested and deployed; owner confirmed real sign-in persists after refresh. Browser reopening and cross-tab logout were tested with the actual SDK and synthetic identities, not the owner's live session |

Business records are fetched afresh and kept in memory. Offline records/drafts, payments and full loan management are not delivered by this read-only checkpoint.

## Overall roadmap

| Phase | Outcome | Status |
| --- | --- | --- |
| 0 | Development infrastructure and database ownership | Complete for recorded scope |
| 1 | Full feature coverage, contracts and acceptance criteria | In progress; initial checkpoints accepted, full parity inventory still open |
| 2 | Secure application foundation and first read flows | In progress; 2A complete, 2B/2C delivered, 2D domain owner-validated, 2E installed PWA, 2F search delivered and visibility fix owner-accepted; 2G error tracing tested, deployed and owner-accepted |
| 3 | Production infrastructure and delivery readiness | Not started |
| 4 | First complete financial workflow in DEV | Checkpoint 4A visually accepted; 4B total/scroll accepted; 4C pure contract tested; 4D disposable journal verified; 4E local API candidate verified; live remains V77; authority, receipts and events remain open |
| 5 | Complete mobile/desktop OLTP, including full loan management | Not started |
| 6 | Complete desktop OLAP management | Not started |
| 7 | Metabase integration/reporting enhancements | Deferred until after production go-live; not a launch prerequisite |
| 8 | Automation, notifications and coexistence | Not started |
| 9 | Complete launch verification and operational recovery | Not started |
| 10 | Contained production deployment | Not started; requires scoped production authorization |
| 11 | Parallel production pilot | Not started |
| 12 | Close readiness gaps and prepare cutover decision | Not started; actual cutover remains the owner's decision |

Launch order: **1 → 2 → 3/4 → 5 → 6 → 8 → 9 → 10 → 11 → 12**. Phase 7 is a separate post-go-live workstream. No overall completion percentage is assigned because full feature/parity coverage is still being established.

## Review needed and what comes next
**Domain and scrolling status, 8 October 2026:** dev-lm.mw-credit.com is active and owner-validated for sign-in, Borrowers/Collection reads and refresh persistence. Fixed header and independent desktop scrolling are implemented/tested; retain the recorded limits of physical-device and browser acceptance. [Scope](PWA_Implementation_Plan.md#phase-2-secure-application-foundation).

- **Owner acceptance:** compact mobile header and mobile/desktop navigation accepted on 8 October ("looks good. carry on"). This does not establish full Phase 2 or broader financial/performance acceptance.
- **Next checkpoint:** review the 4E candidate evidence, then prepare the targeted least-privilege SQL hardening candidate: nonlogin-owner wrappers, exact transitive permissions and disposable role tests. In parallel, define the bounded synthetic DEV manual-receipt roundtrip and exact prefix permission experiment. Live schema application, grants, GCS writes and financial tests still require their exact scope; none is activated by this rehearsal.
- **Remaining planning work:** close Phase 1 feature/parity and acceptance gaps alongside agreed slices. Production readiness and financial workflows follow the roadmap dependencies, not completion of this UI review alone.
- **Current blockers:** no blocker to the local 4E candidate review. Final API/contract tests and maintained database CI passed. Live command identity/ACLs, manual GCS/AppSheet compatibility, event delivery and native update acceptance remain open. Repository V78 is not applied to live databases.

**Team update, 8 October 2026:** A remains Astra High and supplies an executable test plan with each design; B remains Astra Medium. Replacement C and D workers use GPT-6.1 Sol Medium. C executes A's plan, records failures/evidence, retests fixes and escalates ambiguities or missing coverage to A; D retains infrastructure, miscellaneous execution, documentation and authorized publication. The previous C/D workers are superseded. [Team assignments](PWA_Orchestration.md) · [Governance change record](../Change%20Logs/CHANGE_NOTES_PWA_TEAM_GOVERNANCE_2026-10-08.md). This governance update changes no product checkpoint, acceptance or deployment status.

## Evidence and session updates

[Current checkpoint and detailed evidence](../outputs/r052-payment-command-api/README.md) · [4E change record](../Change%20Logs/CHANGE_NOTES_R052_LOCAL_COMMAND_API_2026-10-08.md) · [Design and tests](../outputs/r052-pwa/checkpoint-4e-design-and-test-plan.md) · [Authority plan](../outputs/r052-payment-command-api/infra-authority-plan.md) · [Release status](Release_Tracker.md) · [Team and closeout rule](PWA_Orchestration.md)

This is the single current owner-facing progress overview. At every development-session closeout, update this page's date, completed/tested/deployed/accepted distinctions, current review, next checkpoint, blockers and evidence links. Keep detailed history in the linked change records and roadmap; do not create competing progress trackers.