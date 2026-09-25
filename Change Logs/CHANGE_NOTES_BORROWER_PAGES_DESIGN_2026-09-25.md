# Borrower pages design — 25 September 2026

## Purpose and scope

Owner requested a summary plus detailed implementation handover for Borrower Portfolio and Borrower Detail after creation of Borrower Health Review. This is design/documentation only. AppSheet changes require owner approval if any become necessary; none are proposed. Live implementation/publication is not authorized by this design request.

## Changed files

- [Implementation handover](../outputs/borrower-pages-design-20260925/HANDOVER.md): page layouts, metric/date/population contracts, current sources and legacy gaps, navigation, migration plan, approval boundaries, rollback and acceptance tests.
- [Documentation map](../Documents/README.md): discoverable link explicitly labeled proposed design.
- This log is the coherent task record; no product release allocated or frozen.

## Baseline and rollback

Starting Git commit `a6f4fd8fe418d5dc242c3bd589816bc182ff203c`. Pre-existing untracked risks redesign log/output and R026 payment-health output remain untouched. File-only rollback is a normal revert of this task's intended documentation commit, preserving later work. No live dashboard/DB/app writes occurred and no live backup was required for these read-only inspections.

## Checks and findings

Read Solution Design, relevant dictionary/source definitions and R027/R028/R034 delivery evidence. Read-only API inspection verified dashboard 3 tabs 6/10, existing filters/questions, models 69–72, current health query definitions and the expected reporting database/user/proxy target. No borrower records or credentials exported. Found legacy health measures, name-only grouping in model 72 and differing rolling-date conventions; handover explicitly addresses each without modifying shared providers.

Validated document links, scoped Git diff, and required approval/identity/date/health contracts. Implementation tests are specified, not executed. No app/model definition changed, so no dictionary/live inventory update applies.

## Status

Design handover complete for owner review. Publication of this documentation follows standing repository authorization. Live implementation, database/report deployment, visual/financial verification and owner design acceptance remain future work; any AppSheet change must be approved first.
