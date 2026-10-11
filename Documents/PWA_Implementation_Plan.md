# MW Credit OLTP and OLAP implementation plan

**Current R052 promotion, 11 October 2026:** Deployment applied; verification incomplete. Owner-authorized frozen product b40c695 and separately published operator4a27a1c applied grouped PROD77→87 with exact temporary authority restored; final Flyway validation passed with zero pending. PROD reader00002-984/command00002-vtl serve pinned image4cc345a8 at100%; Hosting3227832eb21e31cc/release1791727412743000 exposes markerc8e9c5007ab5c35436a6b084. Two-member policy and35-reference receipt catalogue use actual secret versions1. Reader remains exact SELECT-only/no application-role membership; command has reviewed DML capability/no owner membership. Both unchanged AppSheet apps3.000274/1.100214 remain Deployed, editor-clear and loaded/synced after87. Health200/session-denial401/no-store passed. First real PWA receipt AppSheet rendering remains owner hands-on pending; Owner signed in on iPhone; two authenticated mapping42501 errors were repaired by the approved PROD-only Partners.Partner Role SELECT. Complete reader57/DEV56 and command-policy0-violations comparison passed; owner refresh/historical receipt GUI remains pending. Model documentation is complete and evidence is published in this batch. Notifications/replacement PWA jobs/Grafana remain deferred; existing AppSheet analytical/charges schedulers retain ownership. R052 stays Frozen, R053 sole Open, nextR054; no finalR052tag. [Single master checklist](../outputs/r052/promotion-checklist.md).

**[Overall progress: completed, current review and next steps](PWA_Progress.md)** — updated at every development-session closeout.

**R052 checkpoint 4F, 8 October 2026:** Combined stable DEV application capability, guarded journal/API and AppSheet-compatible receipts are implemented and verified: 23 focused integration and 3 recovery-validation cases, with maintained database CI passing separately. Actual synthetic receipt roundtrip and exact native readback passed, with original reference/protected state restored and authorized synthetic timestamp effect recorded. Separate command identity Terraform validates and defaults disabled. Live DEV/PROD remain V77; no grants, migrations or command deployment. [Design and executable plan](../outputs/r052-pwa/checkpoint-4f-design-and-test-plan.md) · [Infrastructure and receipt authority](../outputs/r052-payment-command-api/infra-authority-4f.md).

**R052 checkpoint 2A, 7 October 2026:** Checkpoint 2A live DEV Google sign-in and Borrowers read is owner-validated: owner reported successful list/detail reads; actual verified Google UID is pinned in managed Secret Manager version 1, read revision00003-pzr. Independent signed-out desktop/mobile, static health and denial checks passed. App source20358d1 includes the tested cold-start test-tooling correction; final CI37615986417 passed. Checkpoint 2A is complete. Phase 2 remains incomplete and the team stops at this checkpoint; no next slice, production, financial, schema or AppSheet change. [Evidence](../outputs/r052-pwa/README.md).

Prepared 7 October 2026, Asia/Bangkok. This is the delivery plan for a complete replacement of the current AppSheet OLTP and OLAP applications. We will implement and verify one phase at a time. The final deliverable is the new system operating in production alongside AppSheet, with full required coverage, proven recovery and an executable cutover procedure.

**Target — owner revision, 11 October 2026:** mobile and desktop provide every current OLTP and OLAP capability. Phone optimization targets iPhone16/17/18 Pro Max; all pages also support iPad portrait/landscape, preserving desktop behavior. Existing APIs/authority are reused. Focused large-iPhone viewport checks do not establish physical-device acceptance, and no iPhone18 dimensions are assumed. Payments require online confirmation; offline viewing and drafts are included. The existing databases, GCS, Metabase, Grafana and retained integrations remain in use.

Completing the plan makes the system **ready for cutover**. Switching the default application and retiring AppSheet remain explicit owner decisions after the final readiness review. AppSheet remains available throughout development and the parallel production period.

**Owner update, 7 October 2026:** use the [orchestration and review workflow](PWA_Orchestration.md). Agent A designs, Agent B implements and Agent C independently tests B's work. Pause at meaningful visual checkpoints and wait for the owner's go-ahead. Phase 7 Metabase integration/enhancement work is deferred until after production go-live; it is not a launch prerequisite. Existing authorized reports remain available, and native OLAP management remains required before go-live.

## Starting position

| Area | Recorded position | Consequence |
| --- | --- | --- |
| Development infrastructure | New private MW-Credit-App repository, Terraform, development Cloud Run and Firebase Hosting, Secret Manager, federated GitHub delivery and toolchain verified | Reuse the working foundation |
| Database tooling | Complete V1–V77 history, promotion runners and tests moved to MW-Credit-App; hashes, disposable rebuilds and CI verified | One canonical migration sequence and one history per existing database |
| Existing application baseline | R051 records PROD OLTP 3.000270, OLAP 1.100212 and SQL V77 | Phase 1 checks for subsequent changes before freezing the feature map |
| Application implementation | Synthetic landing page and infrastructure readiness endpoint | Authentication, business APIs, functional screens and workflow parity remain to be built |
| Production replacement | New production application runtime and deployment controls not yet established | Prepare them in Phase 3 after the Phase 6 DEV owner-testing checkpoint |
| Repository transition | Database transfer complete; remaining implementation-code transfer deferred by owner | Schedule its required parts explicitly, preserving unrelated and in-progress work |

The [database ownership handover](Database_Ownership_Transfer.md), [development runbook](https://github.com/welct0407/MW-Credit-App/blob/main/docs/Development.md) and [R051 production record](../outputs/r051-production/README.md) provide the starting evidence. Recorded versions are checkpoints, not a reason to skip checking affected live objects when implementation starts.

## Ownership and delivery rules

| Owner or repository | Responsibility |
| --- | --- |
| AppSheet-Loan-Project | This plan, overall scope and decisions, cross-system acceptance, project release coordination and cutover record |
| MW-Credit-App | PWA, API, application infrastructure, shared database migrations/promotion, application-owned jobs, automated tests and operating instructions |
| MW-Integration-Agent and MW-AI-Collection | Retained integration/collection implementations and their existing service authority boundaries |
| Project owner | Business decisions, acceptance, scoped production authorization, pilot scope and final cutover decision |
| Implementer and reviewer | Deliver each phase, maintain evidence and contracts, identify gaps, and report whether its exit criteria are met |

React/TypeScript PWA, the Cloud Run API and existing PostgreSQL remain the target. Authoritative financial calculations stay in SQL. Metabase provides governed reporting; desktop forms provide OLAP management commands. A screen size is never an authorization boundary.

Planning changes allocate no release number. At implementation start, read the current project release tracker; R052 is the recorded Open release today. Phase numbers are delivery milestones, not replacement release or Flyway numbers. Do not reserve future migration/release numbers here.

Every financial command must enforce server-side identity and permissions, preserve the established posting/correction contracts, use durable request identity where needed, and reconcile uncertain outcomes. Database changes must remain compatible with AppSheet and the PWA throughout parallel operation. No second copy of operational data, independent financial engine or duplicate business scheduler is introduced.

## Phase roadmap

| Phase | Objective | Dependency | Current status |
| --- | --- | --- | --- |
| 0 | Establish development infrastructure and database ownership | Completed setup | Complete for the recorded scope |
| 1 | Establish full feature coverage, contracts and acceptance criteria | 0 | In progress; checkpoints 1A and 1B accepted; complete feature/parity and acceptance coverage remains open |
| 2 | Build the secure application foundation and first read flow | 1 | In progress; 2A owner-validated, 2B/2C reads delivered, 2D domain validated, 2E installation accepted, 2F visibility correction accepted; 2G tracing deployed and owner-accepted |
| 3 | Make production infrastructure and delivery ready | 2 and owner review of the Phase 6 DEV candidate | In progress — readiness preparation started11October2026 after explicit owner Phase5/6 verification; no PROD mutation authority inferred |
| 4 | Prove one complete financial workflow in DEV | 2 | Completed and owner-accepted on 8 October 2026 (Asia/Bangkok); tested/deployed first financial workflow and recorded live synthetic proof |
| 5 | Complete mobile and desktop OLTP | 4 | Implemented/tested/deployed DEV85; owner-verified/accepted11October2026, recorded device and future native reconciliation evidence limits retained |
| 6 | Complete mobile and desktop OLAP management | Shared contracts from 4; operational dependencies from 5 | Phone/iPad/desktop implementation deployed DEV85; owner-verified/accepted11October2026, no specific owner test device inferred |
| 7 | Enhance Metabase integration and reporting after go-live | Production go-live; 5 and 6 contracts | Deferred by owner |
| 8 | Required event notifications and retained-source coexistence | Event inventory from 1; relevant commands from 4–6 | Notifications/replacement scheduled jobs deferred after go-live; required receipt/source compatibility pending |
| 9 | Verify the complete launch release and operational recovery | 3–6 and 8; retained reporting access | Not started |
| 10 | Deploy the accepted system to production under containment | 9 and scoped production authorization | Not started |
| 11 | Operate and validate the parallel production pilot | 10 and approved pilot scope | Not started |
| 12 | Close readiness gaps and prepare the cutover decision | 11 | Not started |

The launch sequence is **1 → 2 → 4 → 5 → 6 → DEV owner testing → 3 → 8 → 9 → 10 → 11 → 12**. Phase numbers stay stable for traceability. Phase 7 is a separate post-go-live workstream, scheduled with the owner after production is operating; it does not block deployment, parallel operation or cutover readiness. Owner revision, 11 October 2026: complete authorized development through Phase 6 and fix affected defects before one consolidated CI checkpoint on the final corrected source; deliver DEV for owner testing before starting Phase 3 production readiness. This batch authorizes no PROD changes. Coordinated preparation may overlap where interfaces are settled, but workers must stop at the agreed owner-review checkpoint.

Existing reports, governed calculations, exports and reporting access required by current workflows must remain usable before cutover, using their retained interfaces where appropriate. Deferring Metabase does not defer native OLAP forms, assessments or management actions, nor does it remove required features. New embeds, dashboard changes and report-navigation enhancements belong to Phase 7.

## Phase 0 Development foundation

**Objective:** provide a reproducible development environment and a single owner for database source.

Completed scope includes development infrastructure, synthetic hosting, private readiness checks, IAM/OIDC credential paths, managed application secrets, application CI and delivery, the database source transfer, and local/CI migration verification. Existing services were retained.

**Exit evidence:** the existing [infrastructure verification](https://github.com/welct0407/MW-Credit-App/blob/main/outputs/infrastructure-20261007/verification.json) and [database transfer completion](https://github.com/welct0407/MW-Credit-App/blob/main/outputs/database-transfer-20261007/completion.json).

This phase does not claim completed application sign-in, financial permissions, feature parity or production readiness.

## Phase 1 Feature baseline and implementation backlog

**Objective:** make full OLTP/OLAP coverage explicit before building screens.

- Inventory current enabled views, forms, actions, related lists, security/update rules, bots, schedules, files, exports, languages and integrations in both apps. Include newer R051 correction and source-history behavior.
- Create one traceable parity matrix. Each row records the current workflow/object, mobile/desktop requirement, SQL and integration dependencies, target module, owning phase, acceptance scenarios and evidence/status. Classify dormant features separately; do not activate them by accident.
- Agree the role/action/record-access matrix, supported real phones and browsers, Thai/English behavior, timezone/date rules, data-retention boundaries and pilot users.
- Define measurable acceptance targets for critical response times, expected concurrent use, recovery time and recovery point, alert freshness and reconciliation. Use measured existing behavior and business needs; do not invent promises or thresholds.
- Settle development/production authentication separation and the production domain plan. Record how existing authorized reports remain accessible; defer embedding design and reporting enhancements to post-go-live Phase 7.
- Inventory remaining implementation source in the management repository. Prepare its separately authorized move by dependency; keep integration/collection code in its established repositories.
- Select the first operational workflow and identify required database privileges and any justified schema changes for approval.

**Deliverables:** accepted parity matrix, module backlog, dependency/event/job register, permission matrix, decision register and acceptance targets.

**Exit criteria:** every enabled OLTP/OLAP capability has a destination and test; no unresolved gap blocks the first slice. Optional enhancements are distinguished from required parity.

## Phase 2 Secure application foundation

**Objective:** provide a usable mobile/desktop application with verified identity and an authorized read path.
**Owner additions — current status, 8 October 2026:** DEV domain https://dev-lm.mw-credit.com is Terraform-managed, HTTPS verified and owner-validated for sign-in, Borrowers/Collection reads and refresh persistence. Existing web.app remains fallback; production DNS stays Phase3. Fixed header and independently scrolling desktop panes are implemented with responsive/mobile navigation and tested layouts; broader physical-device/browser acceptance remains scoped to recorded evidence. These completed slices do not establish full Phase2 completion.

- Implement sign-in, session expiry, account disabling/revocation behavior and sign-in-to-Partner mapping. Preserve distinct login identities even when notification delivery addresses are shared.
- Enforce record and action permissions in the API. Select and verify the browser-to-API authentication path; the current IAM-only readiness service is not already an end-user authorization solution.
- Introduce shared API contracts, validation, error/status handling, audit context, pagination, request tracing and environment guards. Grant only the database permissions required by the slice.
- Build navigation, reusable forms/tables/details, bilingual terminology, currency/date formatting, accessibility basics and mobile/desktop layouts.
- Deliver read-only Borrower/Collections navigation with current balances/status and related records using existing governed providers.
- Establish the PWA manifest, installation/update handling and the offline storage design. Sensitive cached data must be scoped to the signed-in user and cleared on sign-out/account switch.
- Establish synthetic fixtures and API/browser tests. Port required shared utilities from the old repository under the agreed ownership plan.

**Deliverables:** authenticated DEV application and first complete read flow.

**Exit criteria:** allowed users see the correct records; denied users cannot access them through UI or direct API; account/environment isolation and representative real-device layouts pass. No browser talks directly to PostgreSQL.

## Phase 3 Production infrastructure readiness

**Objective:** after the Phase 6 DEV owner-testing checkpoint and the owner go-ahead, prepare production infrastructure and delivery readiness. Production mutations still require explicit scoped authorization.

**Status — 11 October 2026:** Phase 5/6 are owner-accepted. The explicitly approved shared-project/default-auth contained foundation is deployed: exact-source full CI, Ready runtime, real fallback owner sessions/business denial, immutable no-store/no-worker frontend, live maintenance rollback/restore and initial safe-test metrics passed; DEV remains working. [Owning batch](../outputs/r052-pwa/phase3-foundation-batch.md) records actual pins and recovery metadata. Canonical hosting/ownership/certificate and shared-owner foundation sessions are verified; Grafana/alerts are owner-deferred. Final business package preparation/DEV87 delivery is recorded in the checkpoint below; actual PROD activation remains separate. Full Phase 3 remains in progress, R052 stays Open and business launch is disabled.

- Refactor the working Terraform into explicit DEV/PROD configurations with separate state, service identities, secrets, application configuration and deployment permissions. Preserve existing Cloud SQL/GCS as retained dependencies.
- Provision the new production API, frontend hosting/domain/HTTPS, artifact delivery and required execution identities. Define scale, connection-pool, timeout and storage-access limits against the shared instance's actual capacity.
- Implement the agreed shared human Firebase authentication with separate API authorization/runtime and delivery bindings. Separate frontend configuration alone is insufficient; the server must enforce the intended issuer/audience/tenant and business membership.
- Keep credentials in managed identity/OIDC or Secret Manager. Inventory remaining credential-file consumers, then migrate required application/promotion integrations deliberately while retaining verified recovery until replacement access is proven.
- Create the protected production promotion path. Promote tested immutable frontend/API artifacts and the exact reviewed SQL package; support compatible artifact rollback.
- Add initial availability, error, latency, connection and cost visibility to existing Grafana/monitoring. Configure actionable ownership and escalation; preserve existing alert routes.
- Establish backup/recovery responsibilities for SQL, receipt objects, identity configuration, secrets, Terraform state and retained service configuration. Verify current coverage and schedule restore exercises in Phase 9.
- Deploy a contained production foundation and perform only authorized bounded access/smoke checks. Keep business commands, notification delivery and replacement schedules inactive until their scoped activation.

**Deliverables:** production infrastructure inventory, tested promotion/rollback path, access matrix, monitoring baseline and recovery plan.

**Exit criteria:** authorized contained deployment/access, monitoring baseline and recovery responsibilities verified; DEV automated runtime/deployment credentials and configuration remain separated from production resources after actual reviewed containment; shared human Firebase authentication is intentional, with server-side production authorization and no tenant claim. Production secrets stay unavailable to previews; no duplicate jobs or financial effects. Passing local preparation alone is not Phase3 completion or business launch.

## Phase 4 First financial workflow

**Objective:** prove the complete financial path in DEV before repeating its pattern across the application.

**Status, 8 October 2026 (Asia/Bangkok):** Phase 4 is completed and owner-accepted. This acceptance does not complete Phase 2, the newer Phase 5 receiving checkpoint, production readiness or Phase 8 notification delivery.

- Implement an agreed collection/payment flow through existing canonical SQL: select borrower/charges and account, validate eligibility, submit, confirm the committed result and show allocations, cash effects and history.
- Preserve receiving-channel semantics, rounding, dates, original rates and source tracing. Use the current unified receiving engine where applicable.
- Add durable request IDs, payload validation, conflict handling, status lookup after timeout, and a safe retry/reconciliation experience. A pending or unknown result must never appear as posted.
- Complete payment Notes and authorized Uploaded Receipt upload/read support, including manual-versus-agent evidence rules. These capabilities are required before the first live financial workflow is complete; each individual input remains optional under the current dictionary. Protected Receipt Image is separate. Manual upload must not silently create another payment or start OCR.
- Capture the verified actor and original command/outcome in the immutable journal; prove financial effects and recovery for API-originated writes. Owner correction, 8 October 2026: actual notification delivery remains Phase 8; this batch adds no notification schema, bot, API credential or dispatcher.
- Implement offline viewing/drafts for this flow; reconnect, refresh and explicitly confirm online. Never automatically post an offline draft.

**Deliverables:** one complete, recoverable DEV payment flow usable from mobile and desktop.

**Exit criteria:** success, rejection, duplicate retry, uncertain response, permission denial, AppSheet/PWA contention, receipt access and committed actor/journal audit tests pass. Notification delivery is deferred to Phase 8 by the owner, not counted as a Phase 4 pass. Financial results reconcile to the established SQL behavior.

## Phase 5 Complete OLTP

**Objective:** implement every current operational capability on mobile and desktop.

Deliver borrower search/create/edit/detail, notes/preferences and related records; all three loan types and their lifecycle commands; charges and collections; all seven current receiving modes (P09–P15), each with its own parity evidence; payments, allocations, repayments, permitted source corrections and deletion requests; receipt handling; upcoming charges; expenses/rebates; operational cash views/statements; preferences and current report/export entry points.

Preserve currently approved correction behavior, including R051 source/history reconciliation, reimbursement handling and opening attribution. Do not substitute blanket edit/delete rules for the actual business contracts. Never expose unrestricted accounting-table editing.

Finish offline dataset boundaries, visible freshness, drafts, attachment handling, sign-out cleanup, installation and safe application updates across the supported real devices. Preserve drafts and request IDs through updates and connection loss.

**Receiving parity — all seven are required:** P09 Single Full (รับชำระ), P10 Single Partial (รับชำระบางส่วน), P11 Receive All (รับชำระทั้งหมด), P12 Lump Sum (รับชำระรวม), P13 First-day Auto (eligible loan-creation path, not a newly verified menu action), P14 Loan Close (ปิดยอดเงินกู้), and P15 Selected Charges (รับชำระรายการที่เลือก). Current DEV82 unifies P09 Single Full, P10 Single Partial, P11 Receive All, P12 Lump Sum and P15 Selected Charges in the amount-first flow with Auto or exact manual principal/interest; independent financial/UI proof and deployed read-only verification are recorded, with owner review pending. P13 First-day Auto and P14 Loan Close remain separate lifecycle capabilities to implement/verify. These are seven business behaviors, not seven required UI channels. The local-only Checkpoint4A P15 result is dated historical evidence; see the [baseline](../outputs/r052-pwa/feature-baseline.md) and [current unified receiving proof](https://github.com/welct0407/MW-Credit-App/tree/codex/r052-review-shell/outputs/r052-unified-receiving).

Payment notes/manual receipt evidence are required completion capabilities, not optional roadmap enhancements. Preserve optional Notes/Uploaded Receipt inputs, Uploaded Receipt At semantics, protected Receipt Image/Receipt Received At ownership, and AppSheet-compatible receipt references. Existing SQL-relative file paths and normalized GCS keys require a proven reference adapter; do not blindly replace one with the other.
**Deliverables:** feature-complete OLTP candidate and populated parity evidence.

**Exit criteria:** every required mobile OLTP row and its desktop equivalent passes permission, financial and UI tests. The system correctly distinguishes online confirmation, pending operations and unsent drafts. Integration-dependent exits remain explicitly open until Phase 8 rather than being declared complete early.

## Phase 6 Complete mobile and desktop OLAP management

**DEV checkpoint, 10 October 2026:** full desktop management implementation is verified and deployed DEV85; consolidated deferred Phase5/6 checks and representative owner read-only smoke passed. Owner acceptance and physical-device/native unknown-reference limits remain separate. [Current proof](https://github.com/welct0407/MW-Credit-App/blob/codex/r052-review-shell/outputs/r052-phase6/delivery-manifest.json).

**Objective:** replace every existing OLAP management workflow on desktop, iPad and the targeted Pro Max mobile devices, reusing the same API and authority.

- Implement partner identity, delivery/language/reviewer preferences and permission-aware administration.
- Implement capital contributions, partner entitlements, reservations, allocations and settlements, including exact amount/settle-all, completion, cancellation and approved reversal/correction behavior.
- Implement cash holders/accounts, supported transfers and ledger commands, opening handling and historical account review while preserving the distinction between cash custody and partner entitlement.
- Implement assessment inputs/results and permitted assessment-history handling, analytical controls and authorized history refresh/rebuild commands.
- Provide status/progress and safe retry handling for long management operations. Retain audit trails and avoid heavy browser or OLTP calculations.
- Preserve allowed cross-links to operational details without creating conflicting duplicate editors.

**Deliverables:** full mobile and desktop OLAP management candidate. Phone optimization remains limited to iPhone16/17/18 Pro Max; iPad portrait/landscape is included across all pages. Physical-device acceptance remains separate.

**Exit criteria:** every editable OLAP workflow has a tested replacement. Concurrency, over-reservation, historical corrections, permissions and source reconciliation pass. Metabase reporting does not substitute for missing management actions.

## Phase 7 Metabase enhancements after production go-live

**Objective:** improve the integrated reporting experience after the operational replacement is live.

**Scheduling:** deferred by the owner on 7 October 2026. This phase is excluded from pre-launch Phase 9, production Phase 10 and cutover Phase 12 prerequisites. Existing authorized reporting interfaces and exports are preserved and verified as dependencies of the launch candidate; enhancements below begin only after production go-live and a subsequent go-ahead.

- Integrate existing Metabase dashboards/questions, governed SQL metrics and the borrower matrix/chart service. Cover portfolio, borrowers/risks/health, income, cashflow, cash/accounts, partners and forecast/planning.
- Implement authorized navigation and immutable-ID/date drill-through, including return links to the new application.
- Preserve actual-versus-forecast, live-versus-snapshot, unknown/missing data and freshness semantics. Verify exports and existing approved destinations.
- Use authenticated report links first where they satisfy the workflow. Adopt embedding only after confirming actual licence, access and export boundaries; never make sensitive reports public to achieve embedding.
- Measure representative query plans, history-refresh costs and concurrency with operations on the shared database. Add indexes/materialization only when justified and approved.
- Move deferred reporting implementation source as its separately authorized ownership work is executed. Preserve recovery and keep external runtimes under their proper owners. Monitoring needed for production remains in Phase 3/9.

**Deliverables:** complete desktop reporting workspace, export parity and measured analytics behavior.

**Exit criteria:** required reports reconcile with governed sources; access and filters are correct; heavy analysis meets agreed operational-impact limits. Mobile retains all existing OLTP report entry points.

## Phase 8 Automation notifications and coexistence

**Current owner scope, 11 October 2026:** PWA event notifications may follow go-live and are explicitly deferred with replacement scheduled PWA jobs and Grafana. Existing AppSheet analytical/charges schedulers remain active owners; other required business workflows move to PWA. Payment entry switches to PWA plus the existing agent at promotion; preserve historical receipt reads and verify in the current AppSheet GUI that new PWA receipts render. Future AppSheet receipt uploads are excluded; the owner manually avoids cross-channel duplicates, so no new cross-channel deduplication is required. The broader scheduler/source-transfer roadmap below adds no launch requirement beyond this current scope and no activation authority. Candidate controls remain inactive until authorized activation; this is distinct from notification implementation/readiness. Event notification delivery is not a launch requirement; actual AppSheet rendering of new PWA receipts remains required verification.
**Objective:** make workflows behave correctly regardless of which frontend created the business event.

- Map each business event and channel to its durable intent, actor, recipient rule, retry policy and exactly one delivery owner. Preserve existing email/integration behavior until its replacement is accepted.
- Implement Web Push, notification history, preferences, authenticated deep links, per-device subscriptions, permission denial and expired-subscription cleanup. Lock-screen messages must not expose borrower/payment details.
- Preserve recorded-actor-to-Partner routing, exclusion and delivery deduplication. Unknown actors must not generate business recipients.
- Implement required daily charge, snapshot/analytics and other application-owned jobs, including Bangkok business dates, locks, retries, missed-run recovery and visible execution status.
- Transfer scheduler ownership job by job: contain the new executor, verify it, record the old executor's last completed run, switch under authorization, and reconcile. Do not run two active schedulers for one job.
- Adapt retained receipt/OCR, integration-agent, email and collection references, permissions and deep links through their owning repositories. Preserve reviewer controls and dormant-service states.
- Test AppSheet-originated and PWA-originated changes against both frontends and downstream effects. Handle in-flight work at transitions without replaying notifications or financial commands.

Complete the separately scoped implementation-source transfers needed by the delivered system. By this phase's exit, application, database and monitoring code needed for launch must have a designated implementation repository; AppSheet-Loan-Project retains project management, historical evidence, permitted immutable references and necessary transition pointers. Reporting source moves tied to deferred Phase 7 may follow after go-live. Remove forwarding adapters only after their consumers have been reconciled.

**Deliverables:** event/job ownership matrix with verified DEV behavior, operating controls and switch/rollback procedures.

**Exit criteria:** required side effects work from either frontend; no duplicate posting/sending/scheduling in tested concurrency and failure scenarios; delayed or failed delivery is observable and recoverable.

## Phase 9 Full acceptance and recovery verification

**Objective:** accept the complete integrated system before permitting production business use.

- Close the launch parity matrix across all supported roles, mobile/desktop devices, languages, exports and integrations. Verify retained reporting access; separately list deferred Phase 7 enhancements without treating them as missing launch features. Exercise complete borrower-to-loan-to-collection-to-cash/settlement/report lifecycles.
- Test all receiving modes and loan types, partial/selected payments, corrections/deletion requests, default/closure, reimbursement, opening attribution, history and date boundaries.
- Test authorization bypass attempts, session/account changes, file access, offline freshness, device loss/sign-out limitations, update compatibility and duplicate/uncertain requests.
- Measure agreed workload/performance targets with realistic synthetic or approved protected test data. Check shared database connection/query pressure and retain evidence limits.
- Rehearse backup restoration, application rollback, compatible SQL recovery, job ownership recovery and uncertain-operation reconciliation in isolated targets.
- Finish operating instructions, support/escalation, incident handling, user guidance and training. Verify monitoring/alert coverage and update the existing Grafana visual guide whenever its dashboards change.
- Generalize or replace any release-specific cloud promotion adapter needed for this release, preserving target, transport, commit/hash and approval/backup guards. The moved historical V58 adapter is not automatically suitable for future migrations.

**Deliverables:** accepted release candidate, complete test/evidence package, defect disposition and rehearsed operations/recovery procedures.

**Exit criteria:** no unresolved financial-integrity, authorization, required-feature, duplicate-effect or recovery blocker. Owner accepts the candidate; remaining minor defects are explicit and do not mask missing parity. Production authorization is recorded separately from DEV acceptance.

## Phase 10 Deploy the production system

**Objective:** install the accepted application and its dependencies safely into the prepared production environment.

- Pin the frontend, API, job artifacts, SQL manifest, configuration and rollback artifacts. Verify current production baselines and recovery coverage.
- Promote compatible SQL additions first through the existing guarded tool, then dependent API/jobs and frontend. Reuse tested artifacts; do not rebuild a different production package.
- Verify actual production identity, secrets, database/file access, authorization, hosting/domain and monitoring with approved bounded checks.
- Install business features and job definitions under containment. Enable only the scope required for the approved pilot; keep unapproved financial commands, schedules and recipients contained.
- Check retained integrations and distinguish deployment health from complete business verification. Record any partial failure and stop dependent steps.
- Preserve AppSheet availability and its required bindings. No bulk financial-data migration or new borrower IDs are needed.

**Deliverables:** deployed production release with exact versions, verified access/monitoring and recovery package.

**Exit criteria:** the accepted system is deployed and operationally healthy; exposure and side effects match the scoped authorization; AppSheet still functions; pilot controls and fallback are ready.

## Phase 11 Parallel production operation

**Objective:** prove the new system through controlled real use while AppSheet remains available.

- Start with the agreed users and representative workflow scope. Users must understand which frontend they are using and how to check an uncertain result before entering a second transaction.
- Expand by workflow and user group only after reconciliation and observed stability, until every required OLTP/OLAP capability is deployed and accepted for its intended users.
- Compare receipts, allocations, loan balances, cash, partner entitlements/settlements and governed reports using bounded reconciliation; classify timing differences separately from financial discrepancies.
- Observe natural job cycles, notifications and integrations. Do not manufacture duplicate production transactions or forced notifications to obtain test evidence.
- Validate mixed-client concurrency, current-data visibility, old offline AppSheet submissions, PWA updates and support response.
- Resolve defects through compatible releases, retesting affected paths and extending observation when a fix invalidates earlier evidence.
- Maintain one executor per business job/event/channel. Rehearse operational fallback without reverting newer financial data or replaying delivered effects.

**Deliverables:** production pilot evidence, reconciled financial outcomes, stable operations and user acceptance across full required scope.

**Exit criteria:** the agreed observation period and required business cycles complete with no unexplained material discrepancy or unresolved critical incident. Monitoring, support, recovery and both frontends' coexistence are demonstrated. Pilot duration and thresholds are set in Phase 1; elapsed time alone is insufficient.

## Phase 12 Ready for cutover

**Objective:** produce an explicit go or no-go decision package for changing the normal application.

- Recheck complete mobile OLTP and desktop OLTP/OLAP coverage, production acceptance, operating ownership, remaining defects and support readiness.
- Finalize the cutover runbook: people and responsibilities, communications/training, bookmarks/domains/deep links, old queued-sync drain, job/event boundaries, backup checkpoint, go/no-go checks and step-by-step recovery.
- Verify how AppSheet write access and late offline submissions will actually be controlled. A hidden form or disabled menu is not proof that old clients cannot write.
- Define the stabilization period, measurable rollback triggers and later AppSheet read-only/retention/retirement steps. Test feasible access controls in a safe environment before relying on them.
- Record the exact production package and accepted pilot evidence. Obtain the owner's cutover decision without treating plan completion as permission to disable AppSheet.

**Final exit:** the new system is running in production, all required functions have passed acceptance, real operation is reconciled, recovery is proven, users/support are ready, and the cutover procedure is executable. Status becomes **Ready for cutover**; AppSheet retirement is not performed automatically.

## Required coverage checkpoints

This is the initial coverage checklist. Phase 1 expands it into actual objects, permissions and tests; broad category completion cannot hide a missing action.

| Capability | Mobile v1 | Desktop v1 | Main delivery and final check |
| --- | --- | --- | --- |
| Navigation, identity, preferences, Thai/English | Required | Required | 2, then 9 |
| Borrowers, notes and related records | All OLTP behavior | Same plus management context | 5 |
| All loan types, schedules, principal/term commands, closure/default | All OLTP behavior | Same | 5 |
| Charges, all receiving modes, allocations and repayments | Required | Required | 4–5 |
| Payments, permitted corrections/deletion requests and reconciliation | Required | Required | 4–5 |
| Manual and agent receipt evidence | Required | Required | 4–5, integrations in 8 |
| Upcoming charges, cash dashboard and recent statements | Required | Required | 5 |
| Expenses, rebates and reimbursement effects | Current OLTP scope | Full applicable operational/management scope | 5–6 |
| Partners, contributions, entitlements, allocations and settlements | Current OLTP access only | Full OLAP scope | 6 |
| Cash holders/accounts, transfers/openings and controlled ledger commands | Current OLTP access only | Full OLAP scope | 6 |
| Assessments, history controls and native management analytics | Later OLAP expansion | Full OLAP scope | 6; retained reporting verified in 9 |
| Existing Metabase dashboards, governed reporting, matrix and exports | Retain existing access | Retain existing access and capabilities | Verify in 9; integration/enhancements in post-go-live 7 |
| Offline viewing/drafts, installation and safe updates | Required | Required where applicable | 2, 4–5, then 9 |
| Notifications, device preferences and deep links | Required | Required where supported | 8 |
| Jobs, retained integrations and cross-client effects | Required effects | Required effects | 8, observed in 11 |
| Monitoring, recovery, support and cutover controls | System-wide | System-wide | 3, 9–12 |

## Acceptance and phase handover

For each phase, keep one concise completion record containing the delivered scope, remaining parity rows, exact repository/artifact/SQL pins, tests and observed results, documentation changes, recovery, unresolved decisions and proposed next phase. Link technical evidence instead of duplicating it across repositories.

Each business feature is complete only when its API/SQL behavior, authorization, UI on the required devices, failure/retry handling, directly affected consumers and operating documentation are complete. A screen demo or green infrastructure probe does not establish business parity.

Reuse valid prior evidence; rerun checks when code, dependencies, environment or assumptions invalidate it. Follow existing AppSheet release/backup/diagnostic rules for any actual AppSheet changes. Existing financial-write, notification and production authority boundaries remain in force; do not add routine approval requests for already-authorized reversible development.

This plan authorizes no future live production action by itself. Execute the next phase when requested, reuse the owner's scoped authorization, and request only missing decisions or authority that materially affect the work.

## Final readiness checklist

The final review must establish all of the following:

- Every required mobile OLTP and desktop OLTP/OLAP parity row is accepted in production.
- Production identity, permissions, secrets, database/file access, deployment controls and domains are verified.
- Financial outcomes reconcile across AppSheet, PWA, SQL and governed reports.
- Required natural job/event/notification cycles run under one verified owner without duplicate effects.
- Supported devices, offline drafts, updates and late/uncertain requests have tested handling.
- Performance, availability, observation-period and recovery targets agreed in Phase 1 are met.
- Backups/restores, application rollback and financial/operational reconciliation have been rehearsed with evidence.
- User training, support ownership, incident procedures and production monitoring are in place.
- The cutover runbook covers old-client sync drain, access controls, rollback triggers and stabilization.
- No unresolved required-feature, financial-integrity, access-control or recovery blocker remains.

**Current implementation task:** Combined 4F candidate and independent verification plus maintained database checks passed; complete evidence publication, then activate the reviewed DEV role/schema/separate identity and tested runtime package. Stable DEV application capability supersedes the earlier per-feature narrow-role preference; protected governance/journal boundaries remain. Real bounded receipt compatibility is verified, while deployed command identity/transport and event delivery remain open. Live remains V77.

## Borrower-field parity inventory after checkpoint 2B feedback

Current 2B refinement adds only Description for the governed bilingual borrower label and Total Interest Earned for the governed profit display, plus the Loans original daily rate for Loan Key. This inventory is not a blanket read grant.

Phase 5 retains fuller borrower information from the recorded Visible Borrowers_Detail reference: Communication Name, Instagram Username, City, Working Location, Address and Ref Referrer; preferences and related records; additional governed metrics and Upcoming Charges. Each later slice must reconcile current source semantics, access and acceptance before implementation. Contact/document exposure is not added here, and none of these categories is promised wholesale for the next iteration.



11 October delivery checkpoint: notifications/replacement scheduled PWA jobs and Grafana are owner-deferred after go-live. PWA+agent entry retains historical AppSheet receipt reads; future AppSheet uploads excluded. All35 current native references have exact-generation/content/decoder evidence, rechecked19:07:28+07; refresh at cutover. One actual PROD agent locator proof passed. Actual DEV4F AppSheet PWA-path rendering/current1.000207 plus PROD binding is reused; first real PROD view remains conditional postpromotion verification. C actual grouped/role-finally/receipt/financial path proofs passed; final exact-source CI/artifact build and DEV85–87 delivery pending. Prepared versus applied package is separated: planned payload resources are not invented numeric versions/observed denial. No PROD activation or full readiness closure. AppSheet SQL configured username remains masked; root actual Metabase source2 current_user=metabase_borrower_reader/readOnly=on proof at19:09:24+07 resolves reporting identity only. R052 remains Open.

## Final promotion preparation checkpoint — 11 October 2026

Final exact product/test source is MW-Credit-App `b40c69526bc40b2ef3f6ab6b631df8c51695c921`. The single consolidated checkpoint recovered two observed harness gaps and passed: fullCI38139391405 (271 browser passes,9 existing skips) and Database38139390752. PROD API and both frontend/DEV API artifacts were rebuilt from that exact archive. Existing canonical HTTPS/shared-owner foundation sign-in/rollback evidence remains valid; PROD still serves the foundation with business access disabled.

Authorized DEV85→87 and exact-source DEV delivery are applied. Initial migration committed inert V86 and rolled back V87 for missing existing owner authority; maintained exact single-owner snapshot/prepare/retry/finally restoration then completed pending V87. DEV validation passed, zero pending, authority restored; no repair/checksum changes. DEV reader00017-c75 and command00018-jk2 each100% preserve runtime configuration; Hosting versiona2c35070c3b55ef3 marker9f4ee8e4c8f20724a9351cb3. Health200/session-denial401/no-store passed; bounded newrevision ERROR rows0. Root authenticated Dashboard/version-gate/explicit-refresh GUI passed with zero alerts/denied/sign-in/loading and no writes. Selective dictionary closure records five relations,20 routines and two settings; index/1571documents validate with0errors,PROD77/AppSheet sources unchanged. PROD remains V77.

Strict material prepared-package validation passes `reviewReady=true`, `deployReady=false`, `deploymentAuthorized=false`; digest7f64e9a96dd2ec3416e4fb0a0ed81f33e598dc1364421b26fb995330b65b588d. It binds actual source/artifact/CI/policy/catalog/migration and recovery hashes. All35 historical AppSheet references and one current agent receipt have generation/full-content/decoder proof; refresh historical references at cutover. AppSheet reading new PWA receipts uses qualified DEV4F rendering/current1.000207 plus unchanged generator/current PROD binding; first actual PROD view remains postpromotion limited verification.

Configured PROD consumers are now accounted for: owner-confirmed AppSheet/operator postgres, actual configured Metabase metabase_borrower_reader, and read-only installed Debian integration/reviewer/projector/audit-relay identities. AppSheet UI stays masked; owner confirmation is distinct evidence. Planned CONNECT preserves unrelated existing ACLs and requires fresh effective DEV direct/inherited denial, zero DEV sessions and retained consumer reconnect before grouped V78–87. No access change has been applied. Verified DEV85 dump/isolated restore is retained; fresh restorable PROD backup remains the first separately authorized promotion step.

Remaining actions are owner promotion authorization; fresh PROD baseline/backup and final reference refresh; reviewed resource/secret/access apply with readbacks; guarded grouped SQL; pinned runtime/Hosting deployment; limited authenticated PROD validation including first real PWA receipt AppSheet view. Notifications/replacement PWA scheduled jobs and Grafana remain owner-deferred; AppSheet analytical/charges schedulers retain ownership. R052 remains Open, with no business PROD activation or release closure. App evidence lives under `outputs/r052-promotion-readiness/` (final-delivery-evidence.json, prepared-candidate-result.json and CI/build/receipt/consumer proofs). Task-owned disposable restore/browser assets are cleaned; required private provenance/backups are retained for review18October. Existing six-role orchestration mapping is correct and reused.

