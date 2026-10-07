# R052 checkpoint 2B continuation

Date: 7 October 2026. Status: next bounded slice in design; no new live mutation.

Owner said “ok. continue” after completed checkpoint 2A. A owns the next slice design; B implements the agreed scope, C verifies, D owns infrastructure/miscellaneous execution, documentation and publication; parent coordinates and reviews.

Starting baselines: MW-Credit-App adedf6915f51f6edd6dcf58daebb2667d3d29f0c; isolated PM d58a498892e18c5da04033f8310ab7990e45de29. Both clean on resumption. Primary checkout untouched. R052 remains sole Open release. No evidence of interrupted mutation required a restart.

Corrected stale implementation-plan statuses: 1B is accepted; Phase 2 is in progress following completed owner-validated 2A, not Not started. Full Phase 1/2 completion is not claimed. Orchestration records the new go-ahead and retains the next visual-checkpoint stop rule.

Rollback: starting Git commits for these documentation changes. No live resources, credentials, schema, rows or AppSheet objects changed by this preflight. Retain actual owner UID pin, existing old private API and parallel AppSheet. Checks: bounded baseline/status reads and git diff --check. Next: A's agreed 2B design, implementation and relevant verification before delivery.

A's exact contract and source review passed; C84units/4affectedbrowser tests passed. App084bb537 published. D applied one reviewed14-column Loans SELECT; private ACL snapshot retained. Effective DEV23/PROD0/no DML/schemaCREATE verified. Four actual source query shapes passed EXPLAIN with synthetic parameters as operator; direct reader execution was unavailable, separately disclosed. No rows returned. B/C source/tests and six synthetic screenshot evidence are published; prior2A screenshots preserved. Deployment/owner review pending.

Exact app source084bb537 passed CI https://github.com/welct0407/MW-Credit-App/actions/runs/37619664493 and Cloud Build9c05cff6-94f1-491a-bef9-b92e257cdb51. Image b0a44c370d7afa7c17675a0a0f12fa290a9d3bc2714b32e731e237444f554c30 deployed via image-only plan to read revision00004-wmg; actual owner UID pin retained. Hosting0e7710ff18851030 at existing DEV URL deployed; priorc0872b1adcb4006f retained for rollback. Owner related-loan visual/runtime validation remains pending; no next slice.

C final deployed checks passed: health200, nested unsigned401, invalid synthetic token401, POST405, preflight204, allno-store; signed-out EN/Thai desktop/mobile no rows/API/overflow. App final evidence commit e9281e9075b33995bc51ce4233c977ffe06f1a01 published, clean/upstream verified; exact tested/deployed source remains084bb537. Owner visual related-loan/list/detail/back validation pending. No more implementation; R052 Open and full Phase2 incomplete.

## Owner review refinements — 7 October 2026

Owner requested changes at the same checkpoint2B: hide technical IDs, show governed Loan Key and bilingual Borrower - TE labels, include the agreed borrower-profit source, grey inactive/closed cards, improve independent desktop scrolling, pagination/grouping/labels and baht currency display. This is feedback, not acceptance. A is resolving exact source/meaning contracts before B implementation; D will add only any justified exact column delta after review. Broader borrower fields remain the roadmap inventory, not a blanket grant. Starting clean app e9281e9075b33995bc51ce4233c977ffe06f1a01 and PM6c3b6f91d84e54edf5df2c232e121b9eb74400d3. R052 remains Open; no new schema, production or financial scope.

A's saved refinement addendum confirms exact three-field privilege delta and records deferred borrower parity categories under Phase5. Updated plan inventory distinguishes the current Description/profit/loan-rate additions from future communication/location/referrer/preferences/related-record/metrics/Upcoming Charges work. No contact/document access or blanket grant is introduced.

Owner clarified Next page meant the disabled/greyed-out control at the end of the list. Existing27-record paging worked; the refinement changes end-of-list messaging/control visibility, not an established SQL cursor bug. No additional clarification is required for this feedback.

Refinement package9ffc957 published after A/C acceptance. D applied only three reviewed SELECT columns with private ACL recovery snapshot; actual audit DEV26/PROD0/no DML/schemaCREATE. Sixteen actual grouped borrower/loan query variants passed read-only EXPLAIN as existing operator; direct-reader limitation unchanged and disclosed. Cloud Buildc9ef1ee8-0277-4471-b19f-7a972167b821 running; final CI/deployment pending. Owner acceptance remains pending.

Refinement CI9ffc957 failed an instantaneous mobile color assertion during CSS transition; C's exact-color retry assertion passed focused tests and is published at6fbcb5c (test/report-only diff). API build source remains9ffc957, successful buildc9ef1ee8/imageaab122...32c0d and Ready00005-wn4, UID pin retained. Hosting publication held at prior0e7710ff18851030 until corrected CI passes. Do not claim original CI passed or that application code changed for this test correction.

Corrected validation6fbcb5 passed CI https://github.com/welct0407/MW-Credit-App/actions/runs/37626536327 . Built application remains9ffc957, differing only by the later test/report correction. API00005-wn4/imageaab122ed6262bf4f857598e8c35989899399fabcc7ee5b4dd10f00964a632c0d and Hosting3f33c848f8542024/release1791378835319000 deployed. UID pin retained; rollback Hosting0e7710ff18851030 and imageb0a44c...54c30/private ACL snapshot retained. C API smoke passed; owner visual acceptance pending.

Final unsigned API and Hosting EN/Thai desktop/mobile smoke passed; no records/API requests/overflow in signed-out state. App final evidence af2bc2625d435c6b2eeb474197043c1aa4df0af3 published clean/upstream verified. Exact application9ffc957, validation6fbcb5/CI37626536327 and deployed pins remain distinct. Owner visual acceptance pending; same2B checkpoint, no further slice. R052 remains soleOpen; fullPhase2 incomplete.

## Neutral theme and desktop hierarchy refinement

The owner superseded the earlier orange-tinted body/cards and proposed colored group bands with mostly white/light-grey surfaces and neutral group headers. Environment color remains on the main page header. Related/Open/Closed loans and Active/Inactive borrowers retain a stronger neutral header hierarchy; redundant Active loan/No active loan badges are removed. Desktop list/detail allocation is 40/60 with existing independent scrolling. This is the same checkpoint 2B read-only summary, not full loan management (Phase 5) or the first financial workflow (Phase 4).

Starting app af2bc2625d435c6b2eeb474197043c1aa4df0af3 and PM59c85ee5ab4f4413454e0079f693087feea1ce74 were clean. Read-only Hosting API verified rollback version3f33c848f8542024/release1791378835319000. Four UI source files are frozen and both builds passed; independent verification and exact-source CI precede Hosting-only publication. No API/image, database, IAM, auth or Terraform change. Owner visual acceptance remains pending; private owner screenshots are excluded.
Neutral UI source d59904124cb595b9a3a8b4156289cd549b3a6064 is published. C passed20 affected checks (2 intentional skips) plus2/2 long bilingual-key checks; parent reviewed synthetic desktop English/mobile Thai with no blocker. Actual-config live frontend build passed. CI37634043751 and Hosting-only delivery are pending; API/DB/auth remain unchanged. Owner acceptance pending.

Neutral UI delivery: exact frontend source d59904124cb595b9a3a8b4156289cd549b3a6064 passed CI37634043751 and actual-config build, published Hosting e112e2801d7ff306/release1791382263648000. Rollback Hosting3f33c848f8542024. API source9ffc957/revision00005-wn4 and DB/auth/IAM remain unchanged. Signed-out smoke pending; owner visual acceptance pending. Subsequent persistent-sign-in request is queued separately and is not included here.

Final independent Hosting smoke passed e112e2801d7ff306: signed-out EN/Thai desktop1440x900/mobile390x844, DEV orange header and white access panel, zero records/API requests/overflow. No API probes or owner login repeated. Sanitized neutral-live-hosting.json and NEUTRAL-live screenshots are published with the report. Owner visual acceptance remains pending; neutral UI delivery complete.

## Owner-requested persistent sign-in follow-up

The owner reports that each browser refresh requires Google sign-in again and explicitly requests persistence. The initial inMemoryPersistence policy explains the existing behavior; the next bounded change is Firebase SDK-managed frontend auth persistence, subject to A's contract and B/C verification. This does not authorize business-record caching, offline reads or additional users. Existing pinned-owner/backend authorization remains authoritative.

Clean starting app67d2e2d1a0a27e96a9039e3acff26165b8ece52e and PMe68e3c5f86fb28ad5e83f8d5ac083e7caa917071 verified. Read-only Hosting API confirms rollback e112e2801d7ff306/release1791382263648000. Implementation/test freeze, exact-source CI and Hosting-only delivery are pending; no backend, IAM, database or Terraform changes expected. Never publish real tokens or browser auth stores. Existing in-memory-only documentation must be revised with the final implementation, preserving initial-slice design as historical context.
A approved the frontend-only SDK persistence contract; B frozen source uses browserLocalPersistence before auth observation, explicit temporary-session fallback, blocked/retryable sign-out failure and expired-session cleanup. Restored identity fetches fresh records; 403 remains denied and backend checks are unchanged. Documentation updated to distinguish SDK auth storage from business-data caching. C verification and Hosting delivery pending.

Actual-SDK verification exposed the default IndexedDB-to-LOCAL transition retaining a cross-tab listener on the prior store. A/B replaced that transition with supported initializeAuth using LOCAL persistence and popup resolver from construction. A random nonsecret marker probes storage; blocked storage chooses explicitly labelled SDK-memory fallback. C reruns actual-SDK refresh/cross-tab tests; publication remains pending final green. No auth stores or real tokens are captured.

Persistence source11c91c2f952ade53265f8bc41cf3f5a160399a97 published after11 relevant browser checks (1 intentional SDK/mobile skip) and expanded actual installed-SDK1/1 test passed. Tests cover reload/full browser reopen, cross-tab signout, API401 session clearing and usable memory fallback; identities/API responses are synthetic. Managed-config frontend build passed; CI37636993134 pending. Actual owner Google refresh remains unverified. Hosting-only delivery follows passing CI; rollback e112e2801d7ff306.

Persistence deployment: exact11c91c2f952ade53265f8bc41cf3f5a160399a97 passed CI37636993134 and managed-config build. Hosting922b3ab61894b240/release1791383539803000 deployed; rollback e112e2801d7ff306. API00005-wn4/backend/DB/IAM unchanged; no real tokens/auth stores saved. Final unsigned smoke and actual owner refresh confirmation pending.

Final C signed-out desktop/mobile EN/Thai smoke including reload passed on922b3ab61894b240, with zero records/API requests/overflow. No live owner login or backend probes repeated. Evidence outputs/r052-auth-persistence/live-hosting.json and synthetic/unsigned report is complete. Actual owner Google refresh/reopen confirmation remains pending; delivery complete and agents stop.
