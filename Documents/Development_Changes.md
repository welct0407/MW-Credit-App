# Open development differences

R049 DEV implementation complete (29 September 2026): OLTP **1.000157**, OLAP unchanged **1.000045**, database **V56**. Upcoming Charges now groups borrower totals only by date; Collection and Borrowers show Date/Total summaries with details behind row taps. Borrowers summary precedes loans. V1 stays intact; V2 covers the seven-day and first-five-date union. SQL CI, backup/restore, migration, all three GUI paths and both-app zero-issue diagnostics passed. Exact DEV dictionary overlays are recorded. R049 stays Open for owner review; no new PROD authorization or change. [Handover](../outputs/r049-upcoming-summary/HANDOVER.md).

R048 upcoming charges — **promoted and verified** (29 September 2026): PROD OLTP **3.000260**, OLAP unchanged **1.100208**, PostgreSQL **V55**. Normal App Upgrade used frozen PROD-mapped RC1 **1.000009** from accepted DEV OLTP1.000151 / OLAP1.000045 /V55. Seven-day Upcoming Charges and Collection summary/details passed basic PROD checks; both editors are clear and Deployed. RC1 was deleted after validation, preserving shared data/files/logo. Upcoming-charge DEV differences are closed; R049 is the sole Open release. [Promotion, evidence and recovery](../outputs/r048-production/README.md).

R048 original daily interest — **delivered to PROD by owner-authorized manual cutover** (28 September 2026): PROD OLTP **3.000257**, OLAP **1.100208**, PostgreSQL **V53**; DEV at that cutover was1.000128 /1.000045 /V53. Both PROD editors clear, canonical load/sync and read-only loan details verified. Backfill **80/80** after the owner confirmed the final historical daily rate; the focused correction added its original-basis note and stored 10% without changing posted amounts. [Correction evidence](../outputs/r048-loan-interest-correction/README.md). Original-rate feature differences are closed. Forecast watchlist original-rate integer labels are now verified; other independent report keys remain outside scope. [Evidence](../outputs/r048-forecast-original-rate/README.md). This earlier scoped direct cutover is included in the completed R048 release above. [Ordered execution, verification and recovery](../outputs/r048-loan-interest-production/README.md).

R048 Forecast watchlist refinement (27 September 2026): Metabase question360 now displays Loan Key, with 34 rows and other values unchanged. No DEV/PROD schema or AppSheet difference from this report edit. [Evidence](../outputs/r048-forecast-watchlist/README.md). Included in the completed R048 release above.

R048 direct PROD correction (27 September 2026): canonical OLTP **3.000253** now matches DEV **1.000124** for displayed-charge receipt filtering and the Receipt Preview image label. Applied under the owner’s explicit instruction to skip the promotion process. Both PROD editors clear; load/sync and Collection receipt rendering verified. OLAP, SQLV52, GCS and Debian unchanged. No remaining feature difference; This correction is included in the completed R048 release above. [Evidence and rollback](../outputs/r048-collection-receipts/PRODUCTION.md).

R046/R047 promoted together on 27 September 2026: PROD OLTP **3.000252**, OLAP **1.100205**, PostgreSQL **V52**. Both apps are Deployed with zero editor issues. PROD sources, links, receipt store/folder, API enablement, scheduled guards, load/sync and changed entry points passed; original shared logos render after RC deletion. At R047 capture, DEV was OLTP **1.000118**, OLAP **1.000042**, V52; the R048 checkpoint above is current. That earlier capture hold was released; the current development release is R049. [production verification](../outputs/r047-production/production-verification.json).

R046/R047 product differences are closed. Intentional DEV database/source bindings, companion links, theme, owner-only Partner delivery and `manual-receipts/dev` remain; PROD uses `MW Receipt Images PROD` and `manual-receipts/prod`. Prior DEV checkpoints remain in the release logs and closed dictionary overlays. No DEV refresh was performed.

R045 delivered (27 September 2026): DEV/PROD V48; dashboard3 adds **13 · Forecast & Planning** (tab262), four models344–347 and 21 questions348–368. Existing 12 tabs /247 placements preserved. Recovery dashboard22. No AppSheet, source-record, notification or operational binding change. No remaining R045 DEV/PROD schema difference; R046 is the sole Open release. [Evidence](../outputs/r045-forecast-planning/README.md).

R044 delivered (26 September 2026): DEV/PROD V47; dashboard3 adds **12 · Partners** (tab249), 19 visible questions plus picker324 and six models318–323. All prior11 tabs /223 placements are preserved; total12 tabs /247 placements. Recovery dashboard21. Both AppSheet apps, source records and operational bindings are unchanged. No remaining R044 DEV/PROD schema difference; R045 is the sole Open release. [Evidence](../outputs/r044-partners/README.md).

R043 report/navigation checkpoint (26 September): dashboard3 has11 tabs /223 placements. Canonical Health Review31 is seventh; Detail105 is eighth; original Insight10 and its two exclusive filters are removed. Borrower links use hidden keys; custom matrix static assets updated on vm-mw-credit-agent without restart. Recovery dashboard20 plus private shared-question/static baselines. AppSheet, database V46, credentials, permissions and bindings unchanged; no remaining DEV feature difference. [Evidence](../outputs/r043-borrower-navigation/README.md).

R042 delivered: DEV/PROD both V46 with original Payments reporting; three Detail refinements verified. No remaining R042 DEV/PROD schema difference or AppSheet change. R043 is the sole Open release. [Evidence](../outputs/r042-borrower-payments/README.md).

R040 (26 September): Portfolio104 saved questions313/289 show the achieved daily rate with one decimal, both lifetime ratios and current V3 BCG category in the bottom comparison table. Portfolio104 is now sixth as `6 · Borrowers`; original tab6 and empty tab17 were removed, with 21 old placements removed and their saved questions retained. Model310, calculations, all other placements and dashboard parameters are unchanged. Ratios/category ignore Activity dates but respect population; inactive borrowers are outside the matrix cohort. Metabase report published and verified; R040 remains Open for owner review. Recovery dashboards14/15/16; [evidence](../outputs/r040-borrower-lifetime-display/README.md). No AppSheet, SQL, runtime or permission difference.

R039 (26 September): Portfolio104 restores saved amount-ranking questions285/286 below pies311/312; ratios313/314 retained. Six charts in three rows; later Portfolio rows shifted9. Query definitions, apps, SQL, runtime and permissions unchanged; no DEV difference. Recovery dashboard13; [evidence](../outputs/r039-restore-borrower-bars/README.md). R040 sole Open.


R038 (26 September): Portfolio104 question314 now uses lifetime interest received / total original principal lent, including active and closed loans. Model310 adds three fields; context315 and note aligned. Apps, SQL schema, runtime and permissions unchanged; no DEV deployment difference. Recovery dashboard12; [contract and evidence](../outputs/r038-lifetime-return/README.md). R039 sole Open.


R037 (26 September): Metabase dashboard3/Portfolio104 contribution refinement delivered with model310 and questions311-315. Both AppSheet apps, SQLV45, bindings, permissions and runtime unchanged; no remaining DEV feature difference from this report-only work. Recovery dashboard11; [saved definitions and checks](../outputs/r037-borrower-contribution/README.md). R038 is the sole Open release.


R036 promoted 25–26 September 2026: PROD SQL **V45**, OLTP **3.000249** from frozen RC1 **1.000007**; OLAP **1.100202** unchanged. Both PROD editors clear and Deployed; OLTP sync, logo, API enablement, guard and changed expense/navigation entry points verified. RC `7a5da6c5-98cc-4fa0-902a-a996f08a641d` deleted with shared data/files preserved. DEV remains OLTP1.000092 / OLAP1.000033 / V45. [Production evidence](../outputs/r036-production/production-verification.json) · [Checklist](../outputs/r036-production/promotion-checklist.md). No remaining R036 feature difference; routine DEV environment bindings/theme/owner-only delivery remain. Prior unrelated release limitations stay separately documented.

R035 borrower pages (25 September): V44 applied and validated in DEV and PROD; new Portfolio104 and Detail105 added to Metabase dashboard3. No remaining R035 SQL/AppSheet deployment difference; browser/documentation closure is recorded in the [single checklist](../outputs/r035-borrower-pages/promotion-checklist.md). Existing pages and V41/V42 health definitions remain unchanged. R036 is the sole Open release. Prior R026 app limitations remain separately recorded.

R034 (25 September): accepted matrix moved above its category tables, with whole-baht amount presentation on the review tab. No remaining R034 DEV/AppSheet difference; SQL V43 and chart API unchanged. R035 sole Open release. [Evidence](../outputs/r034-matrix-order/README.md).

R033 (25 September): owner accepted the custom matrix. Dashboard3/tab31 now shows iframe1501 at row31; old plot849 and labels1280–1283 removed. Saved question274 retained for recovery; method note and details retained, later rows shifted upward20. Apps, SQL and service unchanged. Recovery dashboard8. R034 sole Open release. [Evidence](../outputs/r033-matrix-cutover/README.md).

R032 (25 September): custom matrix animal icons updated in the existing Debian chart.js only; cow head and seated dog visually verified. Runtime, SQL V43, Apps, Metabase placement and credentials unchanged. R033 is the sole Open release. [Evidence](../outputs/r032-matrix-icons/README.md).

## R031 matrix presentation — 25 September 2026

Custom chart now uses grey category symbols and local borrower-name labels without connector lines; dots remain radius5.5. Only three static Debian assets changed. SQL V43, API/authentication, Metabase iframe1501/native274, AppSheet and existing routes are unchanged. Verified23 labels on desktop/mobile; R032 is the sole Open release. [Evidence](../outputs/r031-matrix-labels/README.md).

## R030 custom matrix — deployed 25 September 2026

The separate comparison chart, service, chart reader role and HTTPS route are deployed. No R030 AppSheet changes or remaining deployment differences; owner comparison/review remains available alongside native chart274. R031 is the sole Open development release. Prior R026 differences remain separately deferred. [R030 evidence](../outputs/r030-custom-matrix/README.md).


## R029 delivered — SQL/report only

V43 equal-quadrant coordinates and the review-tab native matrix are deployed in DEV/PROD/report respectively. Accepted R028 scores/categories unchanged. R030 was the Open release at that checkpoint; current development is R031. Existing R026 AppSheet differences remain owner-deferred and were not changed by this package. [Evidence](../outputs/r029-bcg-matrix/README.md).

## R028 — automatic SQL/report categories delivered

DEV and PROD share V42. Borrower Health Review tab31 now uses matrix V3 plus automatic schedule assessment; no manual intervention or borrower override list. Three new views are additive and both AppSheet definitions/bindings are unchanged. Original Borrowers/Risks remain intact. No remaining R028 development-only feature; R029 is the sole Open release. Prior R026 app issues remain separately owned. [Evidence](../outputs/r028-schedule-health/README.md).

## R027 — SQL/report delivered; AppSheet scope removed

DEV and PROD V41 now share payment-health and independent BCG providers. Metabase review tab 31 is delivered alongside the original Borrowers tab, pending owner review before any cutover. There is no remaining R027 AppSheet feature: two bindings/view/generated references were removed in DEV OLTP 1.000085. Dormant SQL adapters remain for possible future OLTP work. Prior R026 DEV OLAP issues remain separately owned. R028 is the sole Open development release. [Evidence](../outputs/r027-payment-health/README.md).

## R026 owner-directed closure — 24 September 2026

**Current R026 state supersedes earlier checkpoints below:** DEV/PROD SQL V40; PROD OLAP name corrected to Loan Business Insights at 1.100201 on 25 September by explicit owner instruction; canonical default folder observed unchanged, other final R026 verification incomplete; PROD OLTP unchanged 3.000246. DEV OLAP 1.000033 has regenerated Daily Analytics and four generated slice warnings at last observation; DEV OLTP 1.000075. Export template is in Trash; bots disabled. Shared pg_cron instance flag remains on. Owner instructed keeping apps as-is; no further R026 app edits. On 25 September all four R026 RC definitions were deleted and verified under separate explicit owner instruction; DEV/PROD apps and shared data/files were preserved. R026 places no hold on development; see the tracker for the current Open release. [Exact closure and deleted candidate identities](../outputs/r026-dictionary-fixes/closure.md).

## Earlier R026 checkpoint — superseded by closure above

V40 is applied and validated in DEV and PROD. The unused pg_cron extension and disabled job are removed; non-cron business definitions are unchanged. The shared Cloud SQL pg_cron flag remains on pending restart coordination. The owner retired Daily Loan Analysis export: its exact shared template was verified in Drive Trash, and both export bots remain disabled. [Database evidence](../outputs/r026-dictionary-fixes/database-verification.json) · [Template retirement](../outputs/r026-dictionary-fixes/template/retirement.json).

All 37 candidate table locales are explicitly en-US after PROD source rebinding. Candidate validation and App Upgrade remain pending; PROD locale values have not yet changed. R026 remains Frozen; R027 is the sole Open release. The paused V41/payment-health work belongs to R027 and is excluded from this promotion.

## R025 — Canonical Collection Monitor

Owner accepted 8R and authorized replacement. Tab19 is now **8 · Collection Monitor** in eighth position; old tab9 and its 26 placements are removed. Dashboard3 has **11 tabs / 184 placements**. All remaining placements, saved questions, filters and source definitions preserved. Top row: receipts, remaining, people fully paid, today-charge paid %. No DB/AppSheet/permissions/jobs changes. R025 Released; R026 Open. [Evidence](../outputs/r025-20260924/cutover-verification.json).

R016 established ten canonical pages, 129 visual placements, 117 distinct questions, 15 active models / 228 fields and four snippets. Original tabs 2/9/10 are replaced by Cash Position (14), Income Statement (16) and Cashflow Statement (15), now ordered as pages 2/3/4, with later tabs shifted back. Fourteen unused questions and seven models are recoverably archived after dependency checks. DEV/PROD are V39; AppSheet and financial rows are unchanged. [canonical cash statements](../outputs/r016-20260922/statement-cleanup/README.md).

Current production baseline is R015; final R016 owner acceptance and migration-key retirement remain pending.

## R019 — Loan-cohort return correction

24 September current reporting checkpoint: **Weekly loan-cohort return · live** (233) replaces the R018 period ratio. It groups loans issued within the selected period by Monday issuance week, using only those loans' interest received within the same period and counting principal once per loan. Existing live models 70/71 retain Loan ID attribution; the chart includes today when selected and is placed above the snapshot section. Unpaid loans stay in the denominator; zero principal/unknown inputs remain unavailable. The 100% reference and capital-yield chart 232 are retained. Dashboard 3 has 205 placements. Other questions, source models, database/AppSheet, permissions and jobs are unchanged. [R019 corrected contract and verification](../outputs/r019-20260924/README.md).

## R018 — Weekly Loan Return on 6R (superseded by R019)

24 September current reporting checkpoint: 6R retains **Daily capital yield · snapshots** (232) and adds **Weekly loan return · snapshots** (233). Loan Return is selected-week gross interest ÷ principal issued, with a 100% reference, Monday weeks and completed Bangkok dates. Partial weeks use selected days; missing inputs/zero denominator stay blank. It is a period ratio, not a loan-cohort return. Dashboard 3 has 204 placements. Existing question/source definitions, database/AppSheet, permissions and refresh jobs are unchanged. [R018 verification](../outputs/r018-20260924/README.md) · [Capital-yield contract](../outputs/r017-20260924/README.md).

## R017 — Capital yield on 6R

R017 capital-yield addition, 24 September: **Daily capital yield · snapshots** (question 232) is now on 6R beside weekly average loan size. Existing model 74 formula and Performance period filter are reused; completed days only, percent format, missing snapshots blank. Dashboard 3 has 203 placements. Existing questions, database/AppSheet, permissions and refresh jobs are unchanged. [Verified implementation](../outputs/r017-20260924/README.md).

## R016 — Metabase reporting migration

**Performance review, 24 September:** implemented separate tab **6R · Performance** (18), now immediately after original Performance by owner arrangement. Daily question 222 and new cumulative 230 use Metabase helper 229 for strict seven-day averages before the display-date filter; readiness 231 complements unchanged snapshot status 228. Original Performance (7) is preserved. No DB objects/SQL, snapshot engine, AppSheet or financial-data change. [Saved definitions, 41 checks, browser evidence and rollback](../outputs/r016-20260922/performance-redesign/ROLLING_IMPLEMENTATION.md). R016 is Frozen for promotion; R017 is the sole Open release for subsequent work.

Cash Position keeps today/live and past/snapshot routing. Income and Cashflow statement totals and detail remain live for every selected period. Their separately labeled completed-day trends use stored portfolio/account snapshots, with missing-day counts and actual refresh times. Income excludes principal, capital movements and partner payments; no FIFO distributions or retained-profit bridge appears. Cashflow uses a fresh source opening seed and selected-period running balances. Transfers cancel only in All accounts; unknown balances remain unavailable. The database retains superseded providers for compatible rollback under expand/contract.

There are no open R011/R012 product differences. The owner merged the reserved R012 Cash Ledger Recent scope into R011, and R011 was released on 21 September 2026 at PROD SQL V29 / OLTP 3.000240 / OLAP 1.100189. R012 was never promoted independently and its number is retired. See the [R011 production report](../outputs/r011-20260920/production/REPORT.md).

There are no open R013 product differences. R013 promoted only PostgreSQL V30; production AppSheet definitions remain OLTP 3.000240 / OLAP 1.100189. Any future app change belongs to R014. Automatic receipt payment creation remains disabled. [R013 production report](../outputs/r013-20260921/production/REPORT.md).

## R014 — promoted and closed

R014 is promoted to PROD V32 / OLTP 3.000245 / OLAP 1.100194. Dashboard, account balances, partial/FIFO settlements, account-selector restrictions, borrower grouping/principal and disabled record swipes are included. Both editors are clear. Forecast proposal excluded. [Production evidence and rollback](../outputs/r014-20260921/production-report.md).

Partners[AI Reviewer] and the reviewed integration-agent policy are deployed. Tommy is selected and Lisa unselected; OLAP owns editing and OLTP reads the field. Current production master selection and 102 VM tests passed. Partner summaries/results retain their routing. No open R014 product difference remains.

## Intentional environment differences

**Dictionary observation, 24 September:** both apps' PROD business-table `Data locale` controls are blank, while every corresponding DEV table explicitly selects `en-US`. The exact blank/value states are retained in the [current dictionary evidence](../outputs/dictionary-reconciliation-20260924/findings.md); effective inheritance and the intended locale policy have not been established. This is an observed difference for review, not an approved setting change or a newly allocated release. The same audit verified the existing source aliases, companion links and four theme colors; it changed no live app, SQL or delivery data.

R015 is promoted and closed: both databases have V33 internal transaction audit. The agent uses separate `mw_agent` PostgreSQL state and append-only audit, with current-reviewer API-first corrections and approved exact-key DELETE. AppSheet definitions remain at the R014 versions. No open R015 product difference remains. [Production evidence](../outputs/r015-20260922/production-report.md).

- Separate DEV database and app identities, DEV themes and within-DEV companion links. DEV uses `loan_manager_dev` and PROD uses `loan_manager_prod` on the same Cloud SQL instance; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- The former five-account zero-opening fixture was replaced by the owner-requested refresh. Current DEV has four initialized accounts. R014 retains one audited, cancelled synthetic settlement with no cash effect; DEV test records do not establish PROD balances.
- DEV and PROD may advance through owner saves independently. Current DEV is OLTP 1.000075 / OLAP 1.000031 while PROD is OLTP 3.000246 / OLAP 1.100195 (current saved versions observed during R016; no app edit in that database task). Production APIs remain enabled for the integration agent; DEV API settings remain unchanged.

## Closed differences

R001–R015 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R012 was merged into R011 and retired. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.

## R020 — Compact 6R chart layout (released)

Weekly loan-cohort return now sits beside EOD activity at half width. Notes retain source/filter distinctions; the trends heading identifies the live exception. No query, filter, DB or app changes. [Evidence](../outputs/r020-20260924/README.md).

## R021 — Live Performance summary metrics (released)

Added questions 234 Net Principal Deployed and 235 Loan-Cohort Return to 6R, retaining the original three cards in one five-card row. Same live period filter; saved questions describe the two different attribution rules. Short dashboard labels fit the row. No other queries, database or AppSheet changes. Eight installed checks and Chrome desktop visual verification passed. [Evidence](../outputs/r021-20260924/README.md).

R022: all eight 6R Performance trend charts use selective value labels (Show values on data points = on; Values to show = Some/fit). Metabase fits labels to available space; calculations, filters and layout unchanged. [Evidence](../outputs/r022-20260924/README.md).

## R023 — Canonical Performance replacement (released)

R023 current Performance: owner accepted 6R as the replacement. Tab18 is now **6 · Performance**, sixth in order; old tab7 and its 18 placements are removed. The unused performance-date filter is removed, while Performance period remains. Dashboard3 has **11 tabs / 189 placements**. Saved questions retained, including shared question56. All retained chart definitions/layouts and other tab order preserved. [Evidence](../outputs/r023-20260924/README.md). Wider R016 closure remains separate.

## R024 — Performance and Borrowers order (released)

R024 checkpoint order: **5 · Performance** (tab18) preceded the then-current **6 · Borrowers** (tab6) on dashboard3. Their identities, cards and filter mappings were unchanged at that checkpoint. [Evidence](../outputs/r024-20260924/README.md). R040 replaced tab6 with tab104.


R040 report-only refinement delivered: Detail monthly punctuality chart304 and summary316 use existing V41 data. No DEV/PROD database or AppSheet definition difference introduced. R040 scope frozen at report publication; R041 is the sole Open release. [Evidence](../outputs/r040-borrower-punctuality/README.md).


R041 report-only Detail presentation delivered; no AppSheet or PostgreSQL DEV/PROD difference introduced. R042 is the sole Open release. [Evidence](../outputs/r041-borrower-detail/README.md).
