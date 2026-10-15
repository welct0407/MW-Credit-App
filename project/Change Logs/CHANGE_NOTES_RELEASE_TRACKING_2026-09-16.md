# Project release tracking — 16 September 2026

Status: implemented. Owner requested release numbers for Codex chat names, a tracker and a summary of each release.

Introduced `Documents/Release_Tracker.md` with a project-wide Rnnn sequence. R001 retrospectively records the existing production baseline through business expenses (recorded OLTP 3.000118, OLAP 1.100098, Flyway V16; repository checkpoint 4dec281). R002 is the next available number, with no scope reserved. Older releases remain under their original dated change logs; no historical numbering was fabricated.

Updated AGENTS.md so future sessions reserve numbers, maintain summaries/status/evidence, distinguish technical version numbers and retain approval requirements. Added the documentation-index link. No app, database, dashboard, scheduler or chat name was changed. No data-model change occurred, so the overview/dictionary require no update.

Rollback point: repository HEAD 4dec281 before this documentation change. Revert this task's documentation commit if required; preserve release reservations made subsequently. Checks: reviewed current deployment records and existing Flyway release-manifest workflow, checked local links and numbering consistency, and checked the intended Git diff. No live functional testing is needed. Owner can label the next feature chat `R002 — <feature name>` and its implementing session must reserve R002 before work.

Documentation-only governance setup does not consume the next product release number. Commit and normal upstream push provide repository recovery; they do not authorize deployment.
