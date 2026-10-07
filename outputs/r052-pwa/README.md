# R052 PWA checkpoints

Date: 7 October 2026, Asia/Bangkok.

Status: Checkpoint 2A accepted; owner authorized continuation. Checkpoint 2B borrower-scoped loan list/detail passed architecture review, 84 unit and four affected browser checks; DEV exact14-column Loans SELECT applied, total23 allowed DEV columns/zero PROD business columns/no write privileges. Four actual query shapes passed read-only EXPLAIN with synthetic parameters as operator, with separate effective reader audit. Source084bb537 passed CI37619664493 and is deployed as read revision00004-wmg / Hosting0e7710ff18851030; independent deployed denial/health and signed-out EN/Thai desktop/mobile checks passed; owner visual loan validation remains pending. Full Phase2 is incomplete; Collection remains deferred for exact provider reconciliation.

## Scope

- Recorded current feature baseline, dependencies and unresolved decisions.
- Responsive synthetic Collection and Borrowers preview, search/filter/detail, English/Thai labels.
- Independent desktop/mobile checks and screenshots.
- Updated roadmap: Metabase enhancements after production go-live.

[Architecture and acceptance](checkpoint-1-design.md) · [Recorded feature baseline](feature-baseline.md) · [Orchestration](../../Documents/PWA_Orchestration.md)

## Baseline and boundaries

Management baseline: 83d48817d884a29589e2c7102988cf1140646a7a.
Application baseline: 761b7010adf353afd1efd0c3b6f0abd41be32c30.

App code belongs to MW-Credit-App on codex/r052-review-shell. Project records use the existing codex/pwa-implementation-plan branch and PR19. Existing unrelated legacy checkout changes are preserved.

No live AppSheet, SQL, Terraform, credential, scheduler or production change. The preview contains synthetic data; it does not implement authentication, financial posting or real offline storage. The recorded R051/V77 baseline is not a new live audit.

## Delivered package and checks

Application commit: ea22c16f05b7d1c235370fe55dd5e6379a3e7fa3 (readable typography with retained themed cards and logos), published on codex/r052-review-shell. [Draft app PR3](https://github.com/welct0407/MW-Credit-App/pull/3). The deployed Firebase foundation remains unchanged.

- Agent A (Astra High): 43-row recorded workflow backlog and checkpoint design; source architecture reviewed.
- Agent B (Astra Medium): responsive synthetic Collection/Borrowers implementation, bilingual navigation, search/filter/detail, clear future-module states.
- Agent C (Astra Low): revised clean build, 6 guard tests and 17 browser checks passed; 1 duplicate desktop run of the mobile-only Thai capture intentionally skipped. The final neutral mobile-nav color adjustment passed a clean build and 5 affected visual checks.
- Parent inspected the desktop/mobile and final Thai screenshots, checked source boundaries, and opened the local review preview.
- Initial preview GitHub app CI passed for d2d6c83: [Development checks](https://github.com/welct0407/MW-Credit-App/actions/runs/37598942585), including build/tests/browser checks, runtime dependency audit and Terraform validation.
- [Pinned test report and screenshots](https://github.com/welct0407/MW-Credit-App/tree/ea22c16f05b7d1c235370fe55dd5e6379a3e7fa3/outputs/r052-preview).

Final fixes addressed small mobile text/contrast, mobile drawer keyboard focus/Escape, optional follow-up notes, analytics scope wording and two formatter-induced CSS selector errors. Tests were rerun against the final source. Project document links, phase dependencies and Git whitespace/scope checks passed.

Local review: http://127.0.0.1:4173/ on VM-01. The preview server is left running for the owner; it is not a production service or a background implementation worker. Restart through MW-Credit-App's documented local command if the session ends.

Limits: Chromium desktop/mobile emulation only; real-device behavior, authentication/authorization, live data, financial operations, offline storage and full parity are not established. Phase 1 remains open.

## Owner review and continuation

Review mobile/desktop navigation, Collection versus Borrowers layout, search/filter/detail behavior and English/Thai labels. Record requested changes or acceptance in this same checkpoint before continuing. The proposed next slice is Phase 1B: reconcile enabled Collection/Borrower read objects and sign-in/record rules, inspect configured Firebase capability read-only, and define read contracts plus denied-access cases. It starts only after visual go-ahead; payment posting and broad authentication implementation do not start automatically.

## Owner review feedback — 7 October 2026

Remove the aggregate outstanding-principal summary; match OLTP DEV orange #e8710a and PROD pink #d81b60 using White/light surfaces; replace the invented monogram with the exact OLTP logo. Remove the extra pale-green summary-card fill. Per-borrower/loan principal remains in context. Revised source 4dfe363 and independent verification are complete. The exact logo hash/rendering, both accent colors, white summary surfaces, transparent text backgrounds and removed aggregate were verified. Borrower/loan principal remains. The earlier d2d6c83 package is retained historical first-preview evidence.

Visual comparison: http://127.0.0.1:4173/?theme=dev and http://127.0.0.1:4173/?theme=prod are local colors-only previews; neither changes environment or connects to production. Owner review remains pending.

Revision GitHub CI passed for4dfe363: [Development checks37602964498](https://github.com/welct0407/MW-Credit-App/actions/runs/37602964498). No deployment was performed.

## Current owner refinement: theme-colored cards

The owner requests stronger orange DEV / pink PROD presence across card surfaces. A coordinated whole-card light-tint treatment supersedes the previous all-white surfaces. No new phase or functionality. Verification passed; owner visual review pending.

Owner further requested the DEV logo background to match orange. A separate orange-background variant is bundled for DEV; PROD keeps its original pink logo. Final card/logo verification passed; no deployment or phase advance.

Final owner refinement removes every remaining pink decorative accent from the DEV logo, using orange shades throughout. PROD original remains unchanged. Appcc0435a is published in the existing draftPR3. Clean build,6guards,17browser checks passed for card/interaction scope; final logo replacement passed5targeted checks, both with1intentional screenshot duplicate skip. Readability checks found representative text contrast>=4.5:1. Parent visually inspected final DEV desktop/logo, C verified both asset loads and originalPRODhash. All agents stopped for review.

Final themed-card/all-orange-logo GitHub CI passed forcc0435a: [Development checks37605487858](https://github.com/welct0407/MW-Credit-App/actions/runs/37605487858). Local preview remains running; no deployment.

## Current readability refinement

Owner requested enlarging all small text. A/B/C are applying a coherent readable scale and verifying English/Thai desktop/tablet/mobile layouts. Colors, logos and behavior retained; no phase advance. Verification passed; owner visual acceptance pending.

Readable revision ea22c16: clean build, 6 guards and 18 browser checks passed (2 intentional duplicate skips). Final focused scan passed at 1440/1024/768/390/360px in English and Thai, covering list/detail/empty/planned/drawer text and controls. Meaningful text >=14px, input/select >=16px and relevant controls >=44px; checked clipping, text bounds, overflow and control overlap passed. Parent inspected desktop/mobile screenshots; architecture accepted. All workers stopped for review.

Readable typography GitHub CI passed for ea22c16: [Development checks 37606523746](https://github.com/welct0407/MW-Credit-App/actions/runs/37606523746). Preview server remains available; no deployment.

## Owner acceptance and Phase 1B continuation

The owner accepted the latest readable, themed preview and authorized continuation. Phase 1B now establishes the Collection/Borrowers read and access contracts. See [checkpoint 1B design](checkpoint-1b-design.md) for the bounded implementation and remaining policy decisions. Phase 1 remains open.

## Checkpoint 1B delivered — read and access contracts

Application commit **3ec1ffc3c824d2aae9c2486196c7d0979a1464eb**, verified on the existing remote branch and [draft PR3](https://github.com/welct0407/MW-Credit-App/pull/3). [Pinned independent report and screenshots](https://github.com/welct0407/MW-Credit-App/tree/3ec1ffc3c824d2aae9c2486196c7d0979a1464eb/outputs/r052-phase1b).

- A reconciled recorded Collection/Borrower filters, status/amount semantics and login policy; no live AppSheet parity claim.
- B implemented synthetic-only default-deny policy, gated read projections and five bilingual access-review states. Selected records and totals disappear when access is denied. Decimal cents and date validation are preserved.
- C verified a clean build, 42 unit tests and 22 browser checks, with 2 intentional duplicate skips. Final frozen-source run passed; an earlier hot-reload interruption is explained in the report.
- Parent inspected source and desktop/mobile screenshots, exercised expired-to-allowed in the existing in-app preview, preserved historical 1A evidence and verified branch publication.

The owner selected **welct0407@mw-credit.com only** for the first real DEV sign-in/read test; add others later. [Read-only Firebase evidence](firebase-capability-20261007.json) found the Firebase project active, no registered web app and an auth-config HTTP404. Actual auth setup, token verification, grants and business database access remain to implement. No live resources changed.

Review http://127.0.0.1:4173/?theme=dev using **Simulated access**: Allowed, Signed out, Expired, Access denied and Unmapped login. These are synthetic scenarios, not real sign-in. Retained colors, logos and typography remain available. All workers stopped at this checkpoint; await owner visual validation/go-ahead before actual DEV authentication/read integration. Phase 1 and Phase 2 are not complete; production and financial posting remain outside this checkpoint.


GitHub CI passed for app 3ec1ffc: [Development checks 37608585989](https://github.com/welct0407/MW-Credit-App/actions/runs/37608585989), including build/unit/browser checks, dependency audit and Terraform validation. No deployment was performed.

## Owner refinement: prominent separators

The owner found the record lines too faint. App a3d21d5ffe6219bb4ec1caa78cf7b52e6bfa2952 darkens the existing 1px borders: DEV #b86d32, PROD #b9577f, preserving card fills, typography and layout. A directed the palette, B changed the two CSS tokens and branding reference, C verified both themes at desktop/mobile list/detail. Actual color/contrast checks passed (minimum 3.345:1); no page overflow. Parent visually inspected the results. [Pinned screenshots and report](https://github.com/welct0407/MW-Credit-App/tree/a3d21d5ffe6219bb4ec1caa78cf7b52e6bfa2952/outputs/r052-phase1b). Branch publication verified; no phase advance or live deployment. All workers stopped for review.

Separator revision a3d21d5 passed [GitHub CI 37609641961](https://github.com/welct0407/MW-Credit-App/actions/runs/37609641961). Preview remains available; no deployment or phase advance.

## Checkpoint 2A — DEV authentication and Borrowers read

Checkpoint 1B and darker separators accepted; checkpoint 2A source verified at app 18c3736 (72 unit, 2 mocked UI tests). DEV-only reader grants and separate read service created; owner-approved service-only Firebase authentication is applied; live frontend version c0872b1adcb4006f and corrected read revision00002-ln2 are deployed; independent live signed-out desktop/mobile and API boundary smoke passed; recurring mocked desktop CI startup failure remains under investigation. Real owner Google login/read and UID pin remain pending. Phase 2 is incomplete; no production, financial, schema or AppSheet change.

[Design](checkpoint-2a-design.md). Application source/evidence belongs to MW-Credit-App branch codex/r052-review-shell, draft PR3. Reader has SELECT on seven Borrowers and two Partners columns in DEV only, read-only default and 5-second statement timeout; no PROD column grants. PUBLIC CONNECT remains unchanged. Service mw-credit-app-read-dev is Ready at revision mw-credit-app-read-dev-00001-kmk, with owner-approved service-only Firebase authentication; business routes reject unauthenticated requests. Existing private API is unchanged; live Hosting version c0872b1adcb4006f replaces the synthetic release, whose version 911d3a1e1883b92c is retained for rollback. D owns infrastructure/miscellaneous execution; the parent leads coordination and review.

## Owner live validation and managed pin

Checkpoint 2A live DEV Google sign-in and Borrowers read is owner-validated: owner reported successful list/detail reads; actual verified Google UID is pinned in managed Secret Manager version 1, read revision00003-pzr. Independent signed-out desktop/mobile, static health and denial checks passed. App source20358d1 includes the tested cold-start test-tooling correction; final CI37615986417 passed. Checkpoint 2A is complete. Phase 2 remains incomplete and the team stops at this checkpoint; no next slice, production, financial, schema or AppSheet change.

Live Hosting remains versionc0872b1adcb4006f at https://mw-credit-app-dev-737787224638.web.app. Deployed API image/source remains18c3736, digest89f10f0398df19071601caf39df28dc4c26559c69ea0dd9af2d358615e0d8593; later source20358d1 changes test tooling and managed identity configuration. The UID is never included in Git or browser artifacts. Owner-reported business reads are distinct from independent sanitized boundary tests. Final evidence is in MW-Credit-App outputs/r052-auth-read/owner-validation.json and live-smoke-uid-pinned-boundary.json.

## Checkpoint 2B — borrower-related loans

Checkpoint 2A accepted; owner authorized continuation. Checkpoint 2B borrower-scoped loan list/detail passed architecture review, 84 unit and four affected browser checks; DEV exact14-column Loans SELECT applied, total23 allowed DEV columns/zero PROD business columns/no write privileges. Four actual query shapes passed read-only EXPLAIN with synthetic parameters as operator, with separate effective reader audit. Source084bb537 passed CI37619664493 and is deployed as read revision00004-wmg / Hosting0e7710ff18851030; independent deployed denial/health and signed-out EN/Thai desktop/mobile checks passed; owner visual loan validation remains pending. Full Phase2 is incomplete; Collection remains deferred for exact provider reconciliation.

[Agreed design](checkpoint-2b-design.md). App evidence is outputs/r052-loan-read in MW-Credit-App. Existing pinned owner identity, runtime account, AppSheet/private API and SQL V77 remain. No schema or financial write. Direct SET ROLE and reader impersonation were unavailable; no new permissions added. EXPLAIN did not run as the reader and returned no business rows. The actual owner loan read is the remaining runtime proof. Rollback uses prior read image and Hosting c0872b1adcb4006f plus private scoped ACL snapshot; remove only introduced Loans privileges if recovering.
