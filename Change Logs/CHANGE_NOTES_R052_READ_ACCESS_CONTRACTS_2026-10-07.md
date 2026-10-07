# R052 read and access contract checkpoint

Date: 7 October 2026. Status: implemented and independently verified; ready for owner review.

## Scope

Owner accepted checkpoint 1A and authorized the next roadmap slice. Architect A (Astra High) specifies a default-deny read/access contract; B (Astra Medium) implements; C (Astra Low) independently tests. Project coordination and source evidence live in AppSheet-Loan-Project outputs/r052-pwa/checkpoint-1b-design.md.

The local preview adds clearly labeled simulated access states and projects synthetic Collection/Borrower data through a shared read boundary. This is not Firebase sign-in, token verification or server authorization. The deployed readiness API, IAM, SQL, credentials, AppSheet and production remain unchanged.

## Baseline and rollback

Starting commit ea22c16f05b7d1c235370fe55dd5e6379a3e7fa3 on codex/r052-review-shell, clean at batch start. Preserve accepted DEV orange / PROD pink styling, original/derived logos and readable typography. Revert this scoped checkpoint commit for local rollback; there is no live-system mutation to undo.

## Verification

Clean TypeScript/Vite build and 42 unit tests passed (6 existing guards, 36 read/access tests). Final frozen-source browser suite: 22 passed, 2 intentional duplicate skips. Focused scenarios cover denied access, stale-detail clearing, distinct module membership, malformed data, decimal cents, and English/Thai desktop/mobile layouts. An initial browser run was interrupted by source hot reload; the final clean run passed without a product workaround. See [independent report](../outputs/r052-phase1b/test-report.md).

Architect accepted the bounded source; parent reviewed the contracts, inspected desktop/mobile screenshots and manually exercised expired-to-allowed in the existing in-app preview. Preserved historical checkpoint 1A screenshots at their baseline; new evidence is under outputs/r052-phase1b. No actual borrower data is present in fixtures or evidence. Live identity verification, explicit app access grants, unique Partners.Login Email mapping, narrowly scoped DB privileges and DEV/PROD authentication separation remain prerequisites to a real read flow.

## Changed files and review stop

- services/api/read-access.mjs and declarations: explicit synthetic-only default-deny evaluator over injected verifier output.
- services/api/synthetic-read-adapter.mjs and declarations: minimal gated list/detail projections, status populations, decimal/date handling and stable identities.
- apps/pwa/src/preview-session.ts, fixtures.ts, main.tsx, style.css: adapted sample data, bilingual five-state review control and safe display transitions.
- tests/unit/read-contract.test.mjs, tests/e2e/read-access.spec.ts and affected foundation selector; new synthetic evidence; development note.

Owner selected only welct0407@mw-credit.com for the first future real DEV sign-in/read test; others later. The simulator uses fictional identities and does not provision this grant. All A/B/C workers stop at this checkpoint. Next accepted slice configures actual DEV Google/Firebase identity and the scoped authorized read path. Git publication is source review, not deployment or production authorization.
