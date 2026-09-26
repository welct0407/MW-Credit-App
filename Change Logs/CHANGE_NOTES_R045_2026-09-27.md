# R045 — Forecast & Planning — 27 September 2026

Owner instruction: “ok. create a new tab based on these design. if need app change, let me review.” This authorizes additive reporting implementation/publication of the accepted forecast design. No AppSheet change is needed or performed. No operational table/column, financial write, notification or schedule change.

Starting commit `be62b5354b6ff8b8da9a8bb2dc553b3be5411b15`. Unrelated untracked risk-design and R026 files remain untouched and excluded from publication. R045 was the sole Open release; no successor is reserved during development.

## Implementation

- Immutable V48 adds forecast input/event/actual/loan/context views and read-only schedule/scenario functions. Existing operational objects unchanged.
- `ForecastPlanning.mjs` owns the additive native Metabase page, four thin models, 21 visual questions, scenario/type filters and optional funding inputs. Existing 12 tabs/247 placements are guarded against changes.
- `Backup-Forecast.py`, `ForecastAudit.py`, `ForecastSchemaCheck.py`, `Rehearse-Forecast.py`, `Verify-ForecastQueries.py` and `Test-Forecast.sql` provide recovery, source checks and focused verification.
- Actual-to-projection and cash bridges use the design's native labelled-table fallback. Native parameter controls appear at the top of the tab, with separate funding instructions and status in the funding section.

## Verification and recovery

Synthetic cases and the 48-migration rebuild passed. Required database CI passed. DEV migrated/validated V48; 63 generated report queries passed. Private DEV/PROD backups restored with 26 table fingerprints matching. Isolated production-restore rehearsal of V48 changed no source-table fingerprints and reported no incomplete forecasts. Existing schema parity passed after normalizing line endings in three pre-existing snapshot function definitions; no semantic drift was found.

Read-only current source inspection confirms target instance/host/database. Dashboard baseline is privately captured; API source 2 remains PROD Loan Reporting using the restricted reader. Recovery is scoped removal of new placements/questions, preserving compatible V48 providers. Browser profile Wel / welct0407@gmail.com was confirmed by the owner after browser policy blocked Chrome settings inspection. Service account and final page remain to be checked in GUI.

## Status

DEV complete; scoped production/report promotion, saved-state checks and documentation closure pending. See [release evidence](../outputs/r045-forecast-planning/README.md). No completion claim or release tag yet.
