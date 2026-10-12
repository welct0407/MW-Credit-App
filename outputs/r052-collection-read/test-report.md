# Checkpoint 2C Collection — independent test evidence

7 October 2026. Baseline130fd859. Contract: PM outputs/r052-pwa/checkpoint-2c-design.md. D verified the existing eleven source column types/nullability before these expectations were written. Only synthetic fixtures were used; no live borrower/financial records, credentials, Google login or financial writes.

## Final results

- `npm run check`: static/synthetic build and92/92 unit tests passed.
- `tests/integration/Run-Collection.ps1`:9/9 actual PostgreSQL integration tests passed. A fresh loopback-only PostgreSQL18.6 cluster/database was created, tested and stopped. Synthetic diagnostic files are retained outside repositories; no live database or migration was used.
- Affected Chromium regression:13 passed,1 intentional skip (actual SDK integration runs once on desktop). This includes Collection desktop/mobile EN/Thai, existing borrower/loan navigation and persistent Firebase SDK/error lifecycle tests.
- B reported the live frontend build passed; D owns publication/build/deployment and exact-source CI.

## Actual SQL semantics

Tests execute the implementation's real parameterized SQL with a SELECT-only synthetic reader against synthetic tables matching the affected source types. Covered all eligibility arms, future charge with repayment today, hidden borrower Collection membership while directory denies it, paid-zero rows, excluded paid/null-date activity, overdue precedence and distinct display rank. Multiple repayments on multiple charges produce collected11.35 and remaining8.000/due19.350 without multiplication, preserving signed corrections and source precision. Relevant null components propagate null; non-today/null repayment dates do not contribute. Null paid date is allowed. Candidate unknown/missing/nonfinite/out-of-public-range dates fail before eligibility, including otherwise-future charges. Unrelated/orphan source rows do not leak into scoped detail.

Stable28-row board and28-charge pages traverse without omitted/duplicate IDs across ties. The reader remains repeatable-read/read-only; wrong owner and ambiguous Partner mapping deny before business SQL. Reader writes are actually denied. Deterministic clock injection replaces only the clock query with PostgreSQL evaluation of the same Bangkok expression:16:59:59UTC stays7Oct;17:00:00UTC becomes8Oct and prior-day cursor returns409 without records. This tests timezone semantics rather than waiting for real midnight.

Unit tests separately cover canonical cursor resource/parent binding, impossible dates/year0000/ranks/extra fields/version substitutions, strict bounded limits/query allowlist, denied/revoked HTTP access before store calls, forbidden method and safe DTO projection. Existing real verifier owner/UID/project/revocation tests remain passing.

## Browser behavior

Synthetic27-borrower/27-charge pages cover status groups, fully paid zero, null and negative display, long Loan Key wrapping, no raw IDs/THB, scoped page/end feedback, no loan-history requests,503 child error retaining summary while clearing charges,409 clearing all Collection state, mismatched response business day rejection, route switch and logout rejecting late responses. Browser timezone America/Los_Angeles cannot override server Bangkok day. Existing SDK persistent identity/clear/reopen tests passed unchanged. No receiving/receipt/upcoming action is provided.

Four MOCKED screenshots here show desktop/mobile EN/Thai charge detail. C visually inspected desktop EN/mobile Thai: neutral hierarchy, branded header, readable labels and wrapped keys; no horizontal document overflow. This is Chromium emulation and synthetic source behavior, not a new live AppSheet parity claim or actual owner record validation.

## Findings resolved before freeze

C identified a missing payment_status in the child SQL projection; B added it. C identified PostgreSQL nonfinite charge dates escaping the guard; B now rejects nonfinite/out-of0001..9999 dates. A identified year0000 cursor handling, now rejected. Child ordinary-error preservation and exact approved Thai status labels were reconciled. Final SQL/unit/browser runs above include these corrections.

C files frozen: tests/unit/collection-read.test.mjs, tests/integration/collection-postgres.test.mjs, tests/integration/Run-Collection.ps1, tests/e2e/collection-read.spec.ts and this folder's synthetic screenshots/report. Regression regenerated historical r052-loan-read PNGs incidentally; D should restore those prior evidence images. Actual SQL runner is currently a local Windows disposable check, separate from existing npm CI; passing local evidence is not relabelled as CI execution. No unrelated infrastructure suite was run. Owner review and deployed unsigned smoke remain pending.

## Deployed unsigned verification

Exact source168e3a2b3f6a7c4ec138734742d23769afd3ae53 CI passed https://github.com/welct0407/MW-Credit-App/actions/runs/37641674603 . D reported Ready API revision00006-kl5 and Hosting1fc4f23a66f185b8. C verified health200; unsigned Collection board/charge detail401; invalid synthetic token401; POST405; wrong-origin403; exact-origin preflight204. All responses no-store. Fresh signed-out1440×900 and390×844 EN/Thai UI passed with zero records/API requests/overflow. See live-api.json, live-hosting.json and four live signed-out screenshots. D's separate37-column privilege audit/operatorEXPLAIN evidence is not relabelled as authenticated application data verification. No actual owner login or business records were accessed. Final evidence frozen for D publication; owner Collection visual validation remains pending.
