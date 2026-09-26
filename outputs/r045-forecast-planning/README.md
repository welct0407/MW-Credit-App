# R045 — Forecast & Planning

Owner authorized a new tab based on the [approved design](../forecast-planning-design-20260927/HANDOVER.md), holding any AppSheet change for review. No AppSheet change is needed. Existing tabs, financial records, schedules and operational functions are preserved.

## Candidate

V48 adds five read-only reporting views and two pure calculation functions. The new Metabase page has four thin models and 21 questions with scenario/type filters and optional funding inputs. Scope is the current Bangkok month, existing loan book, posted signed actuals and recorded/simulated unpaid obligations. Manual schedules forecast recorded obligations only. The source query suppresses incomplete headline projections and keeps known detail visible.

DEV V48 verified; PROD is V47 before promotion. Synthetic schedule/percentage cases and the 48-migration chain passed; mandatory Test-CI passed. All 63 report SQL/filter cases passed in DEV. Production backup restored with 26 table fingerprints matching; V48 rehearsal leaves every source-table fingerprint unchanged. Existing DEV/PROD schema matches outside the new providers after normalizing CRLF/LF in three function definitions (no logic drift).

## Recovery

Starting Git `be62b5354b6ff8b8da9a8bb2dc553b3be5411b15`. Private backups and full dashboard baseline are outside Git under the project r045-forecast-planning folder. Both backup restore proofs are in the adjacent sanitized JSON. Dashboard baseline has 12 tabs and 247 placements. Before publication, create a recovery copy and record its actual ID in state.json. Roll back only R045-owned definitions/placements, preserving later edits; compatible additive SQL may remain. No financial-data restore is needed for report rollback.

## Status

Development verified; authorized publication pending. No AppSheet, financial data, notification, service-account or operational schedule change. Final saved-query checks, browser verification, dictionary and release closure remain pending.
