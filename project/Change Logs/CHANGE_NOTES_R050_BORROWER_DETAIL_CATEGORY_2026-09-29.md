# R050 — Borrower Detail compact category — 29 September 2026

Purpose: remove the redundant chart axis name, retire the wide Current health table from Detail, and keep its important governed BCG category in the top metric row.

Metabase dashboard3/tab105: question369 now renders its seven date labels without an axis name. Saved question295 remains available, but its Detail placement was removed. New scalar question378 shows the current matrix quadrant with a symbol and exact text beside the four current-position cards. Portfolio share is titled `Portfolio %` to fit its resized card. Later Detail rows moved up seven; unrelated tabs and parameters remain unchanged. No AppSheet, SQL or service change. R050 stays Open.

Files: maintained scripts `BorrowerDetailCategory.mjs` and `BorrowerLifetimeSummary.mjs`; scoped R050 public definitions, verification and handover; affected Metabase dictionary question/dashboard records; Solution Design, Environment Inventory, Development Changes and Release Tracker. Starting Git commit `13d891d462fc62f89937bf67d1a0d176b79f48f6`; unrelated workspace changes were preserved.

Rollback: recovery dashboard31 was copied before the first report edit, and private pre-edit card/dashboard captures were retained outside Git. Targeted restoration should account for later report edits; question295 and category question378 need not be deleted. [Exact handover](../outputs/r050-borrower-detail-category/README.md).

Checks: saved-state verification passed for layout, filters, all four BCG classes, empty borrower selection and unrelated placements. Desktop Chrome visually confirmed the top row and seven date labels without axis name. Dictionary validation passed with zero errors; both changed scripts passed Node syntax checks. Mobile width remains untested. Git publication is recorded by the resulting commit on the upstream branch.
