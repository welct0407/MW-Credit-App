# R052 checkpoint1B — synthetic access/read verification

7 October2026. Baseline app ea22c16. No live authentication, database or production endpoint was exercised.

## Final results

- `npm run check`: clean TypeScript/Vite build;42 unit tests passed (6 existing environment guards plus36 read/access tests).
- `npm run test:e2e`:22 passed,2 intentional duplicate-project skips,18.0seconds. No final failures.
- Initial browser run had one mobile Thai timeout while source changes triggered Vite reload and reset locale to English. Frozen-source targeted and final full runs passed; no workaround was added to hide an application failure.

## Verified behavior

- Missing, unverified, revoked, disabled, expired or tuple-mismatched synthetic principals deny. Missing/disabled/wrong/duplicate grants deny. Normalized LoginEmail uniquely maps Partner identity; delivery email and Partner business role grant no access.
- Access denied before source access; no records/counts are returned. Each read reevaluates access. Unknown/out-of-view details return generic not_found.
- Collection membership is governed by valid collection status, includes fully-paid zero-remaining rows, and follows documented status order. Borrower visibility separately follows hidden=false; hidden rows may appear in Collection when status-eligible.
- Explicit DTO projection excludes synthetic sensitive fields recursively, preserves decimal strings/null and stable charge IDs, and exposes read methods only. Unknown status, malformed/duplicate source identity, invalid envelope dates and oversized/unavailable sources fail closed. Impossible detail dates become null.
- Synthetic EN/Thai UI scenarios signed-out/expired/denied/unmapped clear prior records, selection, details and totals; allowed restores only sample data. Notices explicitly state real sign-in/live access is not established. No external/API/non-GET requests observed during these scenarios.
- Fractional amount1200.34 injected solely into the isolated browser fixture response remains1200.34 in both language detail views and yields4400.34 in summary; repository source is unchanged by this test.
- Existing navigation, search/filter, detail/back, theme/logo, contrast and readable layout checks pass, including1440/1024/768/390/360 English/Thai states. Readability evidence is scoped; no blanket accessibility claim.

## Evidence and limits

The six desktop/mobile allowed/denied screenshots in this folder document the new states. dev-desktop-overview.png and dev-mobile-overview.png retain useful full-suite overview captures. Thai mobile denied screenshot visually inspected: no borrower/summary data and readable explanatory copy. Parent preserves historical checkpoint1A screenshots independently.

These tests cover pure injected synthetic policy and adapter behavior, not a cryptographically verified principal or secure live backend. Firebase setup, real sign-in, owner-only DEV grant provisioning, database privileges, financial writes, actual AppSheet parity and production cutover remain unverified/not implemented in this checkpoint. Existing API health/readiness server was not executed by tests. Parent-owned local preview4173 remains running. No Git or infrastructure changes performed by tester. Ready for owner visual review.
