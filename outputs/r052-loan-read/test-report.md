# Checkpoint 2B independent test evidence

7 October 2026 — Agent C. Starting application baseline adedf691. All records, identities, tokens and API responses in these tests are synthetic. No real Google login, business rows, financial writes or live SQL were used by C.

## Results

- `npm run check`: passed TypeScript/synthetic build and 84/84 unit tests, including 12 new loan boundary cases.
- Affected Playwright regression: 4/4 passed across desktop Chromium and Pixel 7 Chromium projects (`live-read.spec.ts` and `loan-read.spec.ts`). Final loan screenshot filename correction was followed by another 2/2 passing loan run.
- `git diff --check`: passed (normal line-ending notices only).
- B separately reported successful live build; D owns actual metadata, privilege, SQL plan and deployment checks.

New unit checks cover mapping on every nested operation, visible-parent SQL predicates, missing/ambiguous parent/mapping, joined wrong-parent details, generic missing IDs, closed/defaulted inclusion, date-descending/null-last/C-ID ordering, bounded cursor parameters, same-date tie and trailing-null predicates, canonical borrower-bound cursor rejection, exact decimal strings/null/14-field projection, sanitized source failures/rollback/release, invalid queries, and denial before SQL. These inspect parameterized SQL using injected clients; they do not claim to execute PostgreSQL query semantics. D's SQL plan gate remains separate.

Browser checks cover list/detail, cents and unavailable values, closed/defaulted labels, EN/Thai, pagination and empty page, 503/404 nested failures retaining authorized borrower context while clearing loan freshness, retry, 401 clearing the entire workspace, and held nested responses discarded after Back/parent change and sign-out. A second synthetic borrower has no loans. The existing owner-auth borrower regression remains intact with an explicit empty nested fixture. Fresh per-worker Vite caches are retained. No forced clicks or increased timeouts were used.

## Visual evidence and limits

The six `*-MOCKED-*.png` files here show desktop/mobile loan lists and EN/Thai loan details. C inspected desktop EN and mobile Thai detail captures: readable labels/amounts, wrapping and separators; no obvious clipping. Browser document overflow check passed for Thai detail; parent-change checks also used 390×844. This is Chromium emulation, not real-device or comprehensive accessibility certification. Wire decimals are checked exactly; UI uses the established two-decimal currency presentation.

No live owner authentication or live loan correctness is established by mocks. Deployed unsigned/API denial smoke will be recorded separately after D's deployment. Owner visual validation of actual DEV related records remains pending.

C evidence and test files are frozen for D publication. The four regenerated historical `outputs/r052-auth-read/*MOCKED*.png` files should be restored to their prior committed versions; current loan evidence is kept only here. Parent preview 4173 was preserved; test-owned Vite servers exited.
