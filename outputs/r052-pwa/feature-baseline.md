# R052 PWA recorded feature baseline and backlog

7 October 2026. Agent A: GPT-6 Astra, High. Status: initial recorded-baseline backlog, not accepted full parity inventory. This document supports checkpoint 1A and the continuing Phase 1 discovery.

## Evidence and limits

- [Implementation plan](../../Documents/PWA_Implementation_Plan.md) defines full mobile OLTP and desktop OLTP/OLAP coverage, online-confirmed payments, offline viewing/drafts, retained SQL/GCS and parallel operation.
- [R051 production record](../r051-production/README.md) records OLTP 3.000270, OLAP 1.100212, SQL V77 and seven-channel unified receiving. This is dated production evidence, not a fresh live audit.
- [Solution design](../../Documents/Solution_Design.md) supplies current ownership and later release refinements. [Model overview](../../Documents/AppSheet_Data_Model_Overview.md) supplies relationships; some older paragraphs describe pre-R051 correction restrictions.
- [R051 scenario matrix](../../Documents/R051_CRUD_Scenarios.md) contains the intended source CRUD contracts. Its historical DEV-only status prose is superseded by the linked R051 production record. Preserve its behavior contract; never reinstate blanket posted-receipt locks from older overview text.
- [AppSheet dictionary](../../Documents/Data%20Dictionary/systems/appsheet/README.md) contains recorded per-object configuration and evidence dates. The 24 September general inventory has later selectively reconciled R047–R051 changes; a directory listing alone is not proof of current enabled behavior.
- MW-Credit-App apps/pwa/src/main.tsx, style.css, package.json and tests/e2e/foundation.spec.ts were inspected. They contain a static synthetic landing page with build/unit/browser tooling. No functional user authentication or business API was observed in that scaffold. docs/Development.md records Firebase/Cloud Run infrastructure and planned end-user sign-in.

No live application, database, report or external service was inspected or changed for this baseline. The initial rows were recorded / implementation pending; the five rows explicitly reconciled on 8 October below supersede that historical status for their bounded delivered subset. Checkpoint 1A tests only the synthetic visual subset. Complete Phase 1 must expand these rows to every enabled action, form, related list, permission, bot, schedule and export and reconcile later live drift.

## Navigation mapping

| Recorded application | Recorded primary/menu entries | Target destination |
| --- | --- | --- |
| OLTP | Dashboard; Collection; Payments; Borrowers; Loans; Business Expenses; Cash Statement; Upcoming Charges; Reporting App Shortcut | Responsive Operations workspace; preserve every OLTP workflow on mobile and desktop |
| OLAP | Dashboard; Analytics; Loan Assessment; Partners; Borrowers; Loans; Cash Accounts; Cash Position; Daily Analytics - Validation; Operations App Shortcut | Desktop Management workspace and linked operational details; retained reporting access |

These names were read from dictionary view identities/positions. Conditional visibility, role permissions and current enablement remain to be reconciled. Preview grouping is a proposed new layout, not a claim of identical old navigation.

## Traceable workflow backlog

Device key: `Both` = complete mobile and desktop OLTP; `Desktop` = native OLAP management, preserving any existing OLTP access. Evidence abbreviations: SD = Solution Design; MO = model overview; R51 = R051 scenario matrix plus production record; DD = exact AppSheet dictionary objects. Each row needs later precise object/action references and executable acceptance evidence before closure.

| ID | Recorded workflow / object | Device | Dependency and target | Phase | Acceptance scenario / remaining evidence |
| --- | --- | --- | --- | --- | --- |
| P01 | Navigation, Partner language and per-user preferences (DD/MO) | Both | Login Email mapping; shell/preferences | 2 | 8 Oct: owner-pinned auth, two-view bilingual shell, persistent sign-in and access checks delivered. Broader role/action policy, Partner-backed preferences and final frequent-view selection remain open. [2F reconciliation](checkpoint-2f-design.md) |
| P02 | Borrowers list/detail, active grouping and outstanding principal (R014/SD) | Both | Borrowers/Loans read providers; borrowers | 2,5 | 8 Oct: physical list/detail, global grouping, bilingual label, profit and scoped loan reads delivered. Name search is checkpoint2F implemented/tested/deployed, owner review pending; contact/document/full read-field parity and source CRUD remain open. |
| P03 | Borrower create/edit/delete, contact/referrer, collection notes (R51) | Both | Source reference guards; borrowers | 5 | Unreferenced delete, dependent rejection, assessment retention and original referral payee |
| P04 | Create New Loan and three loan types (R51/MO) | Both | Loans, source account, capacity and schedule SQL; loans | 5 | Each type and first-day behavior, insufficient-capital concurrency, original rate |
| P05 | Loan terms/principal/interval changes and ordinary delete (R51) | Both | Source recalculation; loans | 5 | Received/booked principal guard; preserve later booked charges; unpaid dependent cleanup |
| P06 | Daily charge creation and auto-charge preferences (MO/DD) | Both | Canonical generator, Bangkok date, one scheduler | 5,8 | Retry/no duplicates; auto-off semantics; no concurrent scheduler ownership |
| P07 | Manual charge add/edit/delete (R51) | Both | Charges/receipt dependencies; charges | 5 | Under-received rejection, parent refresh, reassignment/delete prerequisites |
| P08 | Collection and Today's Collection Charges (SD/DD) | Both | Visible borrower/charge providers; collection | 2,4,5 | 8 Oct: governed board/charge reads, Upcoming provider detail and bounded previews delivered. Name search is checkpoint2F implemented/tested/deployed, owner review pending. Receiving/actions and complete workflow parity remain open; no Borrowers Hidden Flag equivalence. |
| P09 | Single Full receiving | Both | Existing unified SQL receipt engine; payments | 4,5 | Exact eligible charge residual, selected account, one posted effect, retry and conflict |
| P10 | Single Partial receiving | Both | Same engine; payments | 5 | Positive partial, caps, component allocation and residual |
| P11 | Receive All | Both | Borrower/account/token command; payments | 4,5 | Eligible date-bound total recomputed atomically, stale amount rejection |
| P12 | Lump Sum | Both | Unified engine/date eligibility; payments | 5 | Amount within available debt; allocation order and retry |
| P13 | First-day Auto | Both | Loan creation engine and existing event ownership | 5,8 | Exactly one receipt/charge effect; dormant legacy action stays dormant |
| P14 | Loan Close | Both | Final-charge preparation, receipt/token, closure source | 5 | Atomic close, correction/reopen, retain prepared booked charge for separate edits |
| P15 | Selected Charges (R047/SD) | Both | Payments.Selected Charge IDs, charge refs, V51 contract | 4,5 | Exact combined positive residual, borrower/date membership, no spillover |
| P16 | Payment history and ordinary source correction/delete (R51) | Both | Existing source-owned recalculation; payments | 5 | Amount/date/borrower/selection/account changes; other receipts preserved; receipt delete command |
| P17 | Interest allocation reassignment (R51) | Both | Same-loan whole-interest rule; payment detail | 5 | Eligible dates/capacity; reject arbitrary child amount/add/delete |
| P18 | Repayment and allocation related lists (R51) | Both | Generated child grain and legacy independent rows | 5 | Correct trace, positive visible allocations, no duplicate independent cash |
| P19 | Default and Undo Default (R51) | Both | Recorded before-values, zero-cash loss | 5 | Restore unchanged source components, reject missing/changed recovery evidence |
| P20 | Manual receipt upload/replacement and agent receipt read (R047/SD) | Both | Private GCS, Payments image/time, protected agent evidence | 4,5,8 | Authorized file read/write; manual precedence; no OCR/payment from upload; both evidence sources |
| P21 | Collection receipt relevance (R048/SD) | Both | Positive allocation to displayed collection charge | 5 | Relevant older partial receipt retained; unrelated receipt excluded; one card per Payment |
| P22 | Upcoming Charges menu and borrower future-date detail (R048/R049/SD) | Both | Governed forecast providers; upcoming | 5 | 8 Oct: borrower-scoped Collection summary/detail delivered. Standalone Upcoming entry and other consumers remain separately scoped; no complete menu parity claim. |
| P23 | Business Expenses and referral rebate (R51/MO) | Both | Source expense allocation, linked loan/cash | 5 | Correct historical ratios; preserve independent reimbursements on deletion; automatic rebate source-owned |
| P24 | Cash Dashboard and Business Cash Held (R014/MO) | Both | Read-only governed cash/account providers | 5 | Signed metrics, unknown openings remain unavailable, custody distinct from entitlement |
| P25 | Cash Statement recent window/preferences (R010/MO) | Both | SQL balance-before-window, per-Partner account/date | 5 | Fifteen Bangkok dates, authorized preferences, signed running balances |
| P26 | Partner identity/delivery/language/reviewer preferences (R009/R014/MO) | Desktop | Partners, login versus delivery identity; partner admin | 6 | Unique sign-in, shared delivery allowed, referenced delete rejection, permission-aware editing |
| P27 | Cash Pool Contributions and history correction (R51) | Desktop | Contribution/expense/history sources | 6 | Add/edit/delete, historical ratio changes, no invented later-repayment blanket lock |
| P28 | Entitlement, exact-amount and settle-all reservations (R014/MO) | Desktop | SQL net available/reservations; settlements | 6 | Concurrent over-reservation rejection; pending reservation versus withdrawal |
| P29 | Complete/Reverse Transfer, Cancel and settlement correction (R51) | Desktop | Settlement source/cash engine | 6 | Preserve existing command semantics, correct cash inverse and reservation release |
| P30 | Cash holder/account add/edit and active/default routing (MO/R51) | Desktop | Custody/configuration refs; cash administration | 6 | Owner/holder immutability, default replacement, used-reference protection; OLTP read consumer |
| P31 | Manual transfers, expense reimbursement and account history (R51) | Desktop | Source cash ledger and independent reimbursement | 6 | Endpoint/date/amount corrections; same-holder different-account; no bank transfer claim |
| P32 | Opening balances and historical attribution (R51) | Desktop | Recorded cutover attribution and approved Lisa fallback | 6 | Reconciled opening correction, no historical full repost, unknowns not zero |
| P33 | Loan Assessment inputs/results/history (R51/MO) | Desktop | SQL assessment calculation and source/date freshness | 6 | Stamped results, permitted edits, retained optional snapshots, no recalculation on ordinary sync |
| P34 | Native Analytics, Daily Analytics - Validation, refresh/history controls (MO/DD) | Desktop | Governed SQL providers, atomic refresh job | 6,8 | Actual/snapshot distinction; bounded refresh, history correction, progress/retry; not deferred with Metabase |
| P35 | Existing reporting/export entry points and authorized destinations (SD/DD) | Both/current scope | Existing reports and access paths | 5,6,9 | Retained access before cutover; exact links, export enablement and permissions must be inventoried |
| P36 | New Metabase workspace/embedding/dashboard refinements | Existing OLTP access retained | Existing governed reporting sources | 7 after go-live | Owner-deferred implementation; no new embed/public access before scoped design |
| P37 | Offline reads and drafts; install/update/sign-out (plan) | Both/as applicable | User-scoped client storage, request identity | 2,4,5,9 | 8 Oct: canonical PWA installation owner-confirmed; public-only fallback/update tested. Owner offline/update review and user-scoped business offline records/drafts design remain open. |
| P38 | Durable financial request/status recovery (plan/MO) | Both | API identity + existing SQL idempotency/transaction contract | 4 | Duplicate, timeout/unknown result, payload conflict and reconciliation; existing token alone not assumed sufficient |
| P39 | Business notifications and actor routing (R009/MO) | Both effects | Actor→Partner, exclude actor, dedupe delivery; event owner | 8 | AppSheet/PWA-originated writes; unknown actor no recipients; correction/no-op does not resend |
| P40 | Web Push/device preferences/authenticated deep links (plan) | Both where supported | Session, subscription, durable notification intent | 8 | Denial/expiry/cleanup, lock-screen privacy, no duplicate delivery |
| P41 | Daily charges, snapshot/history schedules and coexistence | System | Job locks, Bangkok dates, old/new handoff | 8,11 | One executor, last-run boundary, missed-run/retry recovery and natural production cycles |
| P42 | Receipt/OCR, reviewer, collection and email integrations | System | Existing owning repositories/catalogues | 8 | Preserve reviewer controls and dormant states; no activation implied by replacement |
| P43 | Monitoring/recovery/delivery/parallel operation/cutover | System | Immutable artifacts, SQL compatibility, retained AppSheet | 3,9–12 | Restore rehearsal, scoped production pilot, reconciliation, old queued-write controls, separate cutover decision |

Seven receiving channel names above are grounded in MW-Credit-App database/migrations/V51__selected_charge_receiving.sql and confirmed as retained unified behavior in R051 production evidence. Current implementation contracts must be checked against the complete V77 chain before API design; V51 alone is not the complete current engine.

## Dependency and event ownership register — initial, unverified live

| Dependency/event | Recorded owner/behavior | Required follow-up |
| --- | --- | --- |
| Financial truth | Shared PostgreSQL, canonical MW-Credit-App migrations V1–V77; no alternate financial engine | Verify exact affected provider/functions and least-privilege read/write grants before connection |
| Authentication | Infrastructure uses IAM; end-user Firebase sign-in remains planned | Set DEV/PROD issuer/audience separation, Partner mapping, disabled user/session semantics, API authorization |
| Receipt files | Retained private GCS; manual and agent evidence distinct | Verify signed access/storage boundary and exact reference formats without exposing real objects |
| Posted receipt/closure notifications | Recorded OLTP notification bots and reusable exact-receipt tasks | Inventory actual enabled bots/conditions; choose one durable owner per event/channel before PWA writes |
| Daily charges | Recorded Generate Daily Charges plus source generator | Determine current scheduler and Bangkok run boundaries; preserve active ownership until authorized handoff |
| Analytics refresh | Recorded Refresh Daily Analytics Daily and manual/history controls | Reconcile current actual schedule and implementation; preserve source correction recomputation |
| Legacy first-day automation | R051 evidence explicitly leaves legacy first-day action/bot dormant | Distinguish active first-day SQL flow from disabled legacy definitions |
| Spreadsheet export definitions | Dictionary includes Daily Loan Analysis Export and template/task names | Later retirement evidence may supersede entries; classify enabled/retired rather than implementing blindly |
| Collection/OCR/reviewer integrations | Existing integration and collection repositories own runtime/catalogue | Read their applicable instructions only when scoped integration work begins |
| Reporting | Existing Metabase and governed SQL retained | Inventory authenticated access/export paths; no dashboard rewrite during deferral |

No event ownership transfer, external agent contact, schedule activation or notification test is authorized by this register.

## Permission and decision register

No new role model is invented. Existing sign-in identities are distinct from delivery addresses; screen size is not a permission boundary. Before real reads, confirm allowed users/roles, record filters, action rights, administrative scopes and disabled-account behavior. Operational edits belong to OLTP, while OLAP analytical mirrors remain read-only and link to the owning command. R051 permits ordinary source CRUD under real dependency/financial guards; a generic editor on every SQL table would violate ownership.

| Decision | Status and consequence |
| --- | --- |
| Checkpoint 1A visual shape | Reversible architect proposal; owner review requested after tested preview |
| Phase 7 | Owner deferred Metabase work until after production go-live. Existing reporting access stays available; native OLAP and its required governed read/control functions remain pre-go-live |
| First financial slice | Propose Collection → Selected Charges receipt using existing SQL, because explicit charge selection allows clear reconciliation; final scope/channel must be agreed before Phase 4 |
| Auth provider/DEV-PROD separation | Firebase is recorded planned direction, not working business authorization; technical/provider constraints remain to verify |
| Role/action/record matrix | Pending exact enabled configuration review; no assumed administrator-only or all-partners access |
| Supported phones/browsers and Thai terminology | Viewports and translation are provisional; owner real-device support/translation acceptance pending |
| Performance, concurrency, RTO/RPO and alert freshness | No fabricated numerical promises; measure baseline and agree targets |
| Pilot users, observation duration and discrepancy thresholds | Pending owner decision before production pilot; elapsed time alone insufficient |
| Production domain and access | Pending; no production infrastructure action in 1A |
| Remaining implementation-source transfers | Inventory dependencies later under separately scoped owner work; database ownership already transferred |

## Phase 1 closure backlog and handover

1. Reconcile current enabled views/actions/forms/related lists, security/update rules, bots/schedules and reports against dated dictionary and release evidence; record object-level destinations and status, including dormant/retired objects.
2. Resolve permission/auth/read-provider choices for the first authenticated read slice and explicitly document supported device/language boundaries.
3. Set measurable acceptance/recovery/pilot targets using evidence and owner priorities. Leave unknown values visibly pending until decided.
4. Expand financial/integration contracts immediately before their owning implementation phase, retaining exact SQL behavior and cross-client compatibility.
5. Maintain this as the Phase 1 baseline/backlog and link actual implementation/test evidence rather than marking broad categories complete from the synthetic preview.

Checkpoint 1A completion means tested visual preview ready for owner validation. It does not establish full feature coverage, live parity, authentication, offline support, production readiness or go-live authorization.
