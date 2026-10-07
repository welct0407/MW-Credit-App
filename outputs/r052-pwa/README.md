# R052 PWA checkpoint 1A

Date: 7 October 2026, Asia/Bangkok.

Status: revised checkpoint ready for owner visual validation; all agents stopped; no phase advance. The checkpoint stops for owner visual validation; it does not complete Phase 1 or the secure foundation in Phase 2.

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

Application commit: 4dfe363f64927720e1ddd03260d0c28e2ffd35fa (owner visual revision), published on codex/r052-review-shell. [Draft app PR3](https://github.com/welct0407/MW-Credit-App/pull/3). The deployed Firebase foundation remains unchanged.

- Agent A (Astra High): 43-row recorded workflow backlog and checkpoint design; source architecture reviewed.
- Agent B (Astra Medium): responsive synthetic Collection/Borrowers implementation, bilingual navigation, search/filter/detail, clear future-module states.
- Agent C (Astra Low): revised clean build, 6 guard tests and 17 browser checks passed; 1 duplicate desktop run of the mobile-only Thai capture intentionally skipped. The final neutral mobile-nav color adjustment passed a clean build and 5 affected visual checks.
- Parent inspected the desktop/mobile and final Thai screenshots, checked source boundaries, and opened the local review preview.
- Initial preview GitHub app CI passed for d2d6c83: [Development checks](https://github.com/welct0407/MW-Credit-App/actions/runs/37598942585), including build/tests/browser checks, runtime dependency audit and Terraform validation.
- [Pinned test report and screenshots](https://github.com/welct0407/MW-Credit-App/tree/4dfe363f64927720e1ddd03260d0c28e2ffd35fa/outputs/r052-preview).

Final fixes addressed small mobile text/contrast, mobile drawer keyboard focus/Escape, optional follow-up notes, analytics scope wording and two formatter-induced CSS selector errors. Tests were rerun against the final source. Project document links, phase dependencies and Git whitespace/scope checks passed.

Local review: http://127.0.0.1:4173/ on VM-01. The preview server is left running for the owner; it is not a production service or a background implementation worker. Restart through MW-Credit-App's documented local command if the session ends.

Limits: Chromium desktop/mobile emulation only; real-device behavior, authentication/authorization, live data, financial operations, offline storage and full parity are not established. Phase 1 remains open.

## Owner review and continuation

Review mobile/desktop navigation, Collection versus Borrowers layout, search/filter/detail behavior and English/Thai labels. Record requested changes or acceptance in this same checkpoint before continuing. The proposed next slice is Phase 1B: reconcile enabled Collection/Borrower read objects and sign-in/record rules, inspect configured Firebase capability read-only, and define read contracts plus denied-access cases. It starts only after visual go-ahead; payment posting and broad authentication implementation do not start automatically.

## Owner review feedback — 7 October 2026

Remove the aggregate outstanding-principal summary; match OLTP DEV orange #e8710a and PROD pink #d81b60 using White/light surfaces; replace the invented monogram with the exact OLTP logo. Remove the extra pale-green summary-card fill. Per-borrower/loan principal remains in context. Revised source 4dfe363 and independent verification are complete. The exact logo hash/rendering, both accent colors, white summary surfaces, transparent text backgrounds and removed aggregate were verified. Borrower/loan principal remains. The earlier d2d6c83 package is retained historical first-preview evidence.

Visual comparison: http://127.0.0.1:4173/?theme=dev and http://127.0.0.1:4173/?theme=prod are local colors-only previews; neither changes environment or connects to production. Owner review remains pending.

Revision GitHub CI passed for4dfe363: [Development checks37602964498](https://github.com/welct0407/MW-Credit-App/actions/runs/37602964498). No deployment was performed.
