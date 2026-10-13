# Release tracker



**5 October 2026 owner closeout:** R050 mobile testing accepted; deployed batch closed with final evidence/tag publication under its [checklist](../outputs/r050-production/promotion-checklist.md#owner-acceptance-and-repository-closeout--5-october-2026). R016 reporting accepted and closed at owner direction; temporary migration-key retirement evidence/final tag remain unresolved. Earlier dated component checkpoints remain historical evidence.



## Current development release



**12 October owner exception for R053:** native agent/API/app retirement applied (SQL V90, API/PWA Reporting removal, agent catalogue 27). Monitoring/Grafana remains deferred with temporary failure accepted. R053 Released by owner direction, with first natural charges and genuine payment accepted as deferred; final evidence tag R053. R054 UI is Released by owner acceptance13October; unfinished credential work carries into R055, now Frozen for monitoring promotion. See [continuation](../outputs/r053-notifications-jobs/continuation.md).



| Start-of-work lookup | Value |

| --- | --- |

| **Use this release for new development** | **R056 — Open** |

| Next number, not yet open or usable | **R057 — opens only when R056 is frozen at promotion start** |

| Current release evidence | R051 Released: PROD OLTP3.000270 / OLAP1.100212 / V77; both editors clear, load/sync and logos verified, four RC definitions deleted. R052 is Released with owner-accepted deferred first genuine manual receipt/AppSheet rendering; R053 is Released with owner-accepted deferred natural-business checks; R056 is the sole Open development release. [Promotion](../outputs/r051-production/README.md). |



Read this section before assigning any development task. All new features, fixes and refinements join the single Open release; completing a task or waiting for review does not open another number. At authorized promotion start, record the current release as Frozen with timestamp and pinned-package evidence in its row/log/checklist, switch this section to the next Open release, add its tracker row and advance the next number in the same published update. Do not freeze merely to obtain another number. Shared DEV edits resume only after the frozen package has been independently captured.



Rule adopted 24 September: R016 was frozen at its authorized 6R promotion start; subsequent release handoffs retain their dated evidence. R052 is now Released; R056 is the sole Open development release. R016's reporting deliveries and Performance replacement are owner-accepted; administrative closure is recorded separately from the unresolved migration-key retirement evidence/final tag; its historical V39 checkpoint is not the current SQL baseline. See [numbering policy](../AGENTS.md#project-release-tracking--owner-rule-16-september-2026) and [freeze handoff](Release_Workflow.md#release-scope-freeze-and-number-handoff).



## Release history and status



| Release | Scope / dependency | Status | Latest milestone | Evidence |

| --- | --- | --- | --- | --- |

| R056 | New development after R055 scope freeze | Open | Opened in the coordinated R055 promotion handoff; no feature scope assigned. Next unused R057. | This tracker |

| R055 | Approved Grafana Terraform adoption and native PWA monitoring; carried-forward unfinished credential work | Frozen | Promotion started 2026-10-13T04:10:19.463891+00:00; PM 3aca2683 / app d9b32ff8. Twelve adopted resources have a no-change baseline. Reviewed plans: one new dashboard, one existing dashboard update, two protected secret containers; no deletes/IAM changes. Execution and carried credential work remain pending. | [Manifest](../outputs/r055-grafana/release-manifest.json) · [Single checklist](../outputs/r055-grafana/promotion-checklist.md) |

| R054 | Reviewed UI refinement batch; unfinished credential scope carried forward to R055 | Released | Owner confirmed real-operation and latest PROD UI verification DONE on13October and directed closure. Deployed sourcec07ada0 / Hosting218943a0966051ca / marker461e27e038cef8ff1d645ac8 unchanged. No new CI/live test; unique final evidence tag R054. Credential work is not claimed complete. | [Single checklist](../outputs/r054-production/promotion-checklist.md) · [Actual manifest](../outputs/r054-production/promotion-actual.json) |

| R053 | Notifications, charges/analytics, shared receipt API and owner-approved native AppSheet retirement extension | Released | Original promotion2026-10-11T19:54:37.882990+00:00; tested 5fca4e4/artifacts 1bc08f3/agent e9fd149. SQL V90/API/PWA/native agent applied; worker split preserved; native OIDC reads/status passed. Owner accepted closure12October with first natural charges/genuine payment deferred; final evidence tag R053. | [Single checklist](../outputs/r053-notifications-jobs/promotion-checklist.md) · [Actual manifest](../outputs/r053-notifications-jobs/promotion-actual.json) |

| R052 | Reviewed PWA+agent business launch, SQL78–87 and approved reader permission repair; notifications/jobs deferred | Released | Owner confirmed Collection/Borrowers and historical receipts11Oct and explicitly accepted first genuine manual PWA receipt/AppSheet rendering as deferred, not tested. Pinned b40 package applied; final evidence tag R052. | [Single checklist](../outputs/r052/promotion-checklist.md) · [Actual manifest](../outputs/r052/promotion-actual.json) |

| R051 | Source CRUD, historical opening consistency, both-app operation access and retained performance improvements; completed monitoring deliveries | Released | PROD OLTP3.000270 / OLAP1.100212 / V77; both editors clear, load/sync and logos verified, all four RC definitions deleted. Final evidence tag R051. PR16 merged into PR15; experimental branch retired. Monitoring PR12 already merged; pending unrelated IRM/verification limitations remain documented in its owning evidence. | [Promotion checklist](../outputs/r051-production/promotion-checklist.md) · [Manifest](../outputs/r051-production/release-manifest.json) · [CRUD completion](../outputs/r051-receipt-corrections/vm01-completion-20261006.md) · [Monitoring](../outputs/grafana-row5-vm01-20261004/README.md) |

| R050 | Deployed reporting/navigation, Grafana bridge, browser controller/certificate evidence, V57 correction and V58 operator/audit rollout; Cloud status client source | Released | Owner reported tested and authorized closeout 5 October; final tag R050 at evidence commit. Retained deployed pins and checks reused; no new deployment. Coordinator-supplied 5 October Cloud shutdown completed generation17 with one POST; direct owner request covered that action and local idle state was unchanged. | [Checklist](../outputs/r050-production/promotion-checklist.md) · [Final manifest](../outputs/r050-production/release-manifest.json) · [Closeout log](../Change%20Logs/CHANGE_NOTES_R050_R016_OWNER_CLOSEOUT_2026-10-05.md) |

| R049 | Upcoming-charge summaries and drilldown in Upcoming Charges, Collection and Borrowers | Released | PROD OLTP3.000263 / OLAP1.100208 unchanged /V56. Frozen RC1 1.000006 upgraded into existing PROD, basic validation passed, both editors clear and RC deleted. Scope pinned at tested Git1991896 / DEV OLTP1.000157. | [Promotion](../outputs/r049-production/README.md) · [Checklist](../outputs/r049-production/promotion-checklist.md) · [Log](../Change%20Logs/CHANGE_NOTES_R049_2026-09-29.md) |

| R048 | Collection receipts; Forecast watchlist Loan Key; original daily interest and Loan Key; upcoming charges | Released | PROD3.000260 /1.100208 /V55 verified; RC1 1.000009 upgraded then deleted; tag R048. Owner accepted upcoming charges; frozen 2026-09-29T06:08:53.532412+00:00 at47efcbf /DEV1.000151 /1.000045 /V55. [Promotion](../outputs/r048-production/promotion-checklist.md). [Upcoming handover](../outputs/r048-upcoming-charges/HANDOVER.md). 80/80 existing PROD rates populated after owner-confirmed 10% correction. Forecast watchlist original-rate integer labels are now verified; other independent report keys remain outside scope. [Evidence](../outputs/r048-forecast-original-rate/README.md). | [Interest cutover](../outputs/r048-loan-interest-production/README.md) · [Final-rate correction](../outputs/r048-loan-interest-correction/README.md) · [Collection evidence](../outputs/r048-collection-receipts/PRODUCTION.md) · [Forecast evidence](../outputs/r048-forecast-watchlist/README.md) · [Log](../Change%20Logs/CHANGE_NOTES_R048_2026-09-27.md) |

| R047 | Collection receipts; selected-charge receiving; manual upload; labels/read-only total; ฿0 displays and accepted cosmetics | Released | PROD3.000252 /1.100205 / V52; basic validation passed, both editors clear, RCs deleted; tag R047 | [Checklist](../outputs/r047-production/promotion-checklist.md) · [Log](../Change%20Logs/CHANGE_NOTES_R047_2026-09-27.md) |

| R046 | Receipt archive and Payment review UI | Released with R047 | Backend V50/mw_agent V4/Debian34c4133 retained; UI now PROD3.000252 /1.100205; tag R046 | [Log](../Change%20Logs/CHANGE_NOTES_R046_2026-09-27.md) |

| R045 | Additive Forecast & Planning tab and read-only SQL providers | Released | DEV/PROD V48; tab262 and21 visuals verified; recovery22; no AppSheet change; tag R045 | [Evidence](../outputs/r045-forecast-planning/README.md) · [Log](../Change%20Logs/CHANGE_NOTES_R045_2026-09-27.md) |

| R044 | Additive Partners tab and read-only SQL providers | Released | DEV/PROD V47; Partners249 and19 visuals verified; recovery21; no AppSheet changes; tag R044 | [Evidence](../outputs/r044-partners/README.md) · [Log](../Change%20Logs/CHANGE_NOTES_R044_2026-09-26.md) |

| R043 | Canonical borrower tabs and drill-through | Released | Tabs7/8, name links, saved-state and Chrome verified; recovery20; tag R043 | [Evidence](../outputs/r043-borrower-navigation/README.md) |

| R042 | Borrower receipts, loan return and interest bars | Released | DEV/PROD V46; Payments317, profit305 and bars302 verified. Tag R042. | [Evidence](../outputs/r042-borrower-payments/README.md) |

| R041 | Detail bars, loan labels and table order | Released | Seven questions verified; grouped bars, Loan Key labels and charges before repayments. Tag R041. | [Evidence](../outputs/r041-borrower-detail/README.md) |

| R040 | Borrower Portfolio display, tab cutover and Detail punctuality | Released | Portfolio refinements retained; Detail chart304/summary316 saved, reconciled and visually verified. Tag R040. | [Evidence](../outputs/r040-borrower-punctuality/README.md) |

| R039 | Restore borrower amount bars alongside pies | Released | Six charts coexist; queries/layout/filters/visual check passed; tagR039. | [Evidence](../outputs/r039-restore-borrower-bars/README.md) |

| R038 | Lifetime interest / total principal lent | Released | Model310/card314/context315; Orgrand160%; data/filter/GUI verified; tag R038. | [Evidence](../outputs/r038-lifetime-return/README.md) |

| R037 | Borrower contribution pies and overall rates | Released | Model310/questions311-315; lifetime daily rate; desktop/mobile and data/filter checks passed; tag R037. | [Handover](../outputs/r037-borrower-contribution/README.md) |

| R036 | Automatic daily interest; OLTP bilingual labels and Payments presentation; delivered Collection Monitor alignment | Released | SQL V45; OLTP3.000249; OLAP1.100202 unchanged; both editors clear; RC deleted; tag R036. | [Checklist](../outputs/r036-production/promotion-checklist.md) · [Manifest](../outputs/r036-production/release-manifest.json) |

| R035 | Metabase monitoring and additive borrower pages | Released — SQL/report and monitoring | DEV/PROD44; new Portfolio104 / Detail105, original tabs preserved; data and desktop/mobile checks passed. Apps unchanged; tag R035. | [Evidence](../outputs/r035-borrower-pages/README.md) · [Release log](../Change%20Logs/CHANGE_NOTES_R035_2026-09-25.md) |

| R034 | Chart above category tables; whole-baht amounts | Released | Live layout and amount formatting verified; tag R034. | [Evidence](../outputs/r034-matrix-order/README.md) |

| R033 | Accepted custom matrix; remove native plot | Released | Native plot removed; iframe/detail table verified; tag R033. | [Evidence](../outputs/r033-matrix-cutover/README.md) |

| R032 | Distinct cow and dog matrix icons | Released | Live visual verification passed; one static asset; tag R032. | [Evidence](../outputs/r032-matrix-icons/README.md) |

| R031 | Grey quadrant icons and nearby borrower names | Released | Desktop/mobile verified; static files only; tag R031. | [Evidence](../outputs/r031-matrix-labels/README.md) |

| R030 | Custom matrix: Debian service, DB reader and comparison iframe | Released — custom comparison chart | 2026-09-25: iframe1501 verified, original274 retained; apps unchanged, SQL schema V43; tag R030. | [Evidence](../outputs/r030-custom-matrix/README.md) |

| R029 | Equal-quadrant borrower matrix | Released — SQL/report only | 25 September; V43 pin `de0a72a`, questions274/275; desktop/mobile geometry and parity verified. Apps unchanged; tag R029. | [Evidence](../outputs/r029-bcg-matrix/README.md) |

| R028 | Automatic schedule-aware SQL categories and Borrower Health Review | Released — SQL/report only | 25 September 2026; PROD V42, 20 report queries and visual check passed; tag `R028`. Apps unchanged. | [Evidence](../outputs/r028-schedule-health/README.md) |

| R027 | Payment-health SQL and parallel Borrower Health Review; delivered GCP currency formatting | Released — SQL/report; review tab retained | DEV/PROD V41; tab 31 and questions 253–269; original report preserved. No App Upgrade. | [Evidence](../outputs/r027-payment-health/README.md) · tag R027 |

| R026 | Table locale alignment, export retirement and unused pg_cron retirement | Closed at owner direction — partial deployment | V40 and template retirement verified; OLAP 1.100198 applied, OLTP unchanged. Further app work stopped; final checks incomplete. All four RC definitions deleted and verified 25 September; PROD OLAP name corrected to Loan Business Insights (1.100201) by owner instruction. | [Closure](../outputs/r026-dictionary-fixes/closure.md) · [Log](../Change%20Logs/CHANGE_NOTES_R026_2026-09-24.md) |

| R025 | Canonical Collection Monitor replacement | Released — report-only | 2026-09-24: canonical tab19; old tab9 removed; 6 cutover checks and Chrome passed; tag R025 | [Implementation](../outputs/r025-20260924/README.md) · [Log](../Change%20Logs/CHANGE_NOTES_R025_2026-09-24.md) |

| R024 | Performance and Borrowers tab order | Released — report-only | 2026-09-24: tab18 fifth, tab6 sixth; saved-state and Chrome checks passed | [Evidence](../outputs/r024-20260924/README.md) · tag R024 |

| R023 | Canonical Performance replacement | Released — report-only | 2026-09-24: tab18 promoted, tab7 removed; 4 checks and Chrome verified | [Evidence](../outputs/r023-20260924/README.md) · tag R023 |

| R022 | Selective Performance trend labels | Released — report-only formatting | 2026-09-24: eight charts set to Some; 9 saved-state checks and Chrome visual verification | [Evidence](../outputs/r022-20260924/README.md) · tag R022 |

| R021 | Net Principal Deployed and Loan-Cohort Return summary cards | Released — report-only | 2026-09-24: questions 234/235; 8 installed checks and Chrome visual verification passed | [Evidence](../outputs/r021-20260924/README.md) · tag R021 |

| R020 | Compact 6R loan-return chart layout | Released — report-only layout | 2026-09-24: half-width chart grouped beside EOD; saved-state and Chrome visual checks passed | [Evidence](../outputs/r020-20260924/README.md) · tag R020 |

| R019 | Correct weekly Loan Return to issuance cohorts; live selected-period interest | Released — report-only correction | 2026-09-24: question 233 corrected; 15 checks and desktop/mobile passed | [Evidence](../outputs/r019-20260924/README.md) · [Checklist](../outputs/r019-20260924/promotion-checklist.md) · tag R019 |

| R018 | Additional weekly Loan Return on 6R; deployed R016/R017 reporting | Released — metric superseded by R019 | 2026-09-24: question 233; 100% reference; 29 checks and desktop/mobile passed; capital yield retained | [Evidence](../outputs/r018-20260924/README.md) · [Checklist](../outputs/r018-20260924/promotion-checklist.md) · tag R018 |

| R017 | Capital-yield chart on 6R; deployed R016 reporting dependencies | Released — report-only | 2026-09-24: question 232; 23 checks and desktop/mobile passed; source/apps unchanged | [Evidence](../outputs/r017-20260924/README.md) · [Checklist](../outputs/r017-20260924/promotion-checklist.md) · tag R017 |

| R016 | Canonical cash statements, snapshots/history and Metabase migration; depends on R015 | Closed at owner direction — reporting accepted; final release evidence incomplete | Whole-R016 acceptance/closure instructed 5 October; R017/R018 deliveries and R023 replacement reused. Temporary migration-key retirement unproven; no final R016 tag. No credential change or repeat retirement. | [Reconciliation](../outputs/r016-20260922/promotion-checklist.md#owner-acceptance-and-repository-closeout--5-october-2026) · [Closeout log](../Change%20Logs/CHANGE_NOTES_R050_R016_OWNER_CLOSEOUT_2026-10-05.md) |

| R015 | Internal agent transaction audit and reviewer DELETE grants; coordinated PostgreSQL agent-state migration; depends on R014 | Released — SQL and agent; apps unchanged | 2026-09-22: V33 and separate mw_agent active; reviewer DELETE and audit relay verified | [Release log](../Change%20Logs/CHANGE_NOTES_R015_2026-09-22.md) · [Report](../outputs/r015-20260922/production-report.md) · [Checklist](../outputs/r015-20260922/promotion-checklist.md) |

| R014 | Cash Ledger account selection, account-level custody balances, Income MTD dashboard, partial settlements, borrower grouping/principal, disabled record swipes and Partner AI Reviewer routing; depends on R013 | Released | 2026-09-21: PROD V32 / OLTP 3.000245 / OLAP 1.100194; reviewer runtime installed, both editors clear | [Release log](../Change%20Logs/CHANGE_NOTES_R014_2026-09-21.md) · [Production report](../outputs/r014-20260921/production-report.md) · [checklist](../outputs/r014-20260921/promotion-checklist.md) · [manifest](../outputs/r014-20260921/release-manifest.json) |

| R013 | Receipt transfer time through existing Payments/Cash Ledger timestamps and both cash statements; depends on R011 | Released — SQL only; apps unchanged | 2026-09-21: PROD V30 / OLTP 3.000240 / OLAP 1.100189 | [Production report](../outputs/r013-20260921/production/REPORT.md) · [manifest](../outputs/r013-20260921/release-manifest.json) · [checklist](../outputs/r013-20260921/promotion-checklist.md) |

| R012 | Reservation retired; Cash Ledger Recent scope merged into R011 by owner direction | Cancelled / merged into R011; number not reusable | 2026-09-21: never promoted independently; DEV evidence consolidated under R011 | [R011 Cash Ledger evidence](../outputs/r011-20260920/cash-ledger-recent/test-results.md) · [R011 production report](../outputs/r011-20260920/production/REPORT.md) |

| R011 | Borrower collection note, bilingual labels/localization, optional cash-account alternative number and enriched OLAP Cash Ledger Recent; depends on R010 | Released | 2026-09-21: PROD V29 / OLTP 3.000240 / OLAP 1.100189 from frozen RC3 definitions | [Production report](../outputs/r011-20260920/production/REPORT.md) · [manifest](../outputs/r011-20260920/release-manifest.json) · [checklist](../outputs/r011-20260920/promotion-checklist.md) |

| R010 | OLTP payment-entry validation and recent Cash Account Statement; depends on R009 | Released | 2026-09-20: PROD SQL V27 / OLTP 3.000235 from RC2 1.000004; OLAP unchanged 1.100183 | [Production report](../outputs/r010-20260919/production/REPORT.md) · [manifest](../outputs/r010-20260919/release-manifest.json) |

| R009 | Partner login/delivery, closure notifications, rate correction and owner GUI refinements | Released | 2026-09-19 | [Report](../outputs/r009-20260919/production/REPORT.md) · [manifest](../outputs/r009-20260919/release-manifest.json) |

| R008 | Cash accounts and account-aware payment commands | Released after correction audit | 2026-09-19 | [Correction audit](../outputs/r008-20260918/production-correction/REPORT.md) · [original production record](../outputs/r008-20260918/production/REPORT.md) |

| R007 | SQL analytical views for OLAP | Released | 2026-09-18 | [Flyway manifest](../outputs/r007-20260918/flyway-manifest-r1.json) · [the report](../outputs/r007-20260918/REPORT.md) |

| R006 | Four OLTP formula optimizations | Released | 2026-09-18 | [PROD comparison](../outputs/r006-20260918/prod-comparison-r1.json) · [PROD observations](../outputs/r006-20260918/prod-saved-observations.json) |

| R005 | Cash custody, reversals and dashboard refinements | Released | 2026-09-18 | [Evidence and rollback](../outputs/r005-20260917/PRODUCTION_REPORT.md) · [history](../Change%20Logs/CHANGE_NOTES_R005_2026-09-17.md) |

| R004 | Bilingual referral expense category | Released — owner-approved export-coverage exception | 2026-09-17 | [Checklist, manifest, exception and recovery](../Change%20Logs/CHANGE_NOTES_R004_2026-09-17.md) |

| R001 | Composite original production baseline; reconciled by R003 | Released — reconciled by R003 | 2026-09-16 | [Audit and resolution](../outputs/r001-appsheet-reconciliation-20260916/REPORT.md) |

| R002 | Loan capacity safeguard and borrower navigation | Released | 2026-09-16 | [Checklist](../outputs/r002-20260916/PROMOTION_CHECKLIST.md) · [production evidence](../outputs/r002-production-20260916/REPORT.md) |

| R003 | Reconcile missing R001 AppSheet configuration | Released | 2026-09-16 | [Evidence](../outputs/r003-production-appsheet-reconciliation-20260916/REPORT.md) · [change log](../Change%20Logs/CHANGE_NOTES_R003_PRODUCTION_APPSHEET_RECONCILIATION_2026-09-16.md) |



R011 [promotion checklist](../outputs/r011-20260920/promotion-checklist.md) records the completed release. All six R011 RC1–RC3 apps were deleted on 21 September 2026 by explicit owner direction; their recorded identities remain historical evidence and are not live rollback sources. R010 OLTP RC1 and frozen RC2 were deleted on 20 September 2026 after owner-approved post-release retirement. R009 RCs were likewise retired with owner approval.



Maintain one short row per release. Versions, tests, decisions and recovery belong in the linked manifest/log/checklist; current identities belong in [Environment Inventory](Environment_Inventory.md). Preserve reserved numbers and distinguish acceptance from production authorization. Detailed past entries are retained in the [dated archive](archive/2026-09-20/Release_Tracker.md).



R014 RC1 pair retired by owner direction on 21 September 2026; [retirement evidence](../outputs/r014-20260921/rc-retirement.md). The immutable R014 tag remains the production-release evidence checkpoint.
