# PWA routine UI delivery path — 8 October 2026 (Bangkok)

Owner requested a shorter path for future routine UI fixes. PWA_Orchestration.md now makes behavior-based scope and the existing-design B/C/D path authoritative: one coherent batch, relevant checks/one visual pass, changed-frontend DEV delivery, asynchronous low-risk CI and one closeout. Cosmetic edits do not require new tests that mirror CSS/text; meaningful interaction risk gets regression coverage. Substantive financial/auth/backend/database/infrastructure changes retain full validation and can be delivered separately from independent UI.

PWA_Progress.md links this governance decision without changing product readiness, owner acceptance, model assignments or the Open release. Baseline3f242d07; preserve pre-existing unpublished process rules/paragraph, CI/template/log work and unrelated draft. Rollback is only this added policy section/progress note/log.

Checks: bounded published/worktree comparison, saved readback, staged diff/whitespace and relative Markdown targets. No app/live operations, CI, tests or build required for these documentation changes. Only the new intended hunks are staged; standing normal upstream publication applies.
