# Data dictionary reconciliation execution prompt — 24 September 2026

## Scope and purpose

Owner requested a Markdown instruction for another, potentially lower-capability model to thoroughly update and validate the OLTP, OLAP and PostgreSQL data dictionaries. This task authors that prompt; it does not execute the reconciliation or inspect live systems. No product release number is required.

## Changes

- Added [the execution prompt](../Documents/Data_Dictionary_Reconciliation_Prompt.md), covering six independent DEV/PROD targets, read-only live acquisition, complete object/property accounting, small reconciliation batches, exact values, historical provenance, DEV differences, independent validation, source freshness, continuation and Git publication.
- Grounded instructions in the existing format/registry, guarded dictionary helper and database collectors. Explicitly records the collectors' coverage limits and the guarded helper's restrictions on identity/provenance changes.
- Added a documentation-map entry. No dictionary objects, frozen workbook, historical evidence, app definitions or databases changed.

## Rollback

Starting commit: `df44d62796a241467a0d0524abc4a21a88325e58`. Working tree was clean; branch `master`, upstream `origin/master`. Revert this documentation commit normally, preserving later work. No live rollback is needed.

## Verification and status

Reviewed the prompt against current dictionary format/conventions, root instructions and collector implementations. Verification passed for 19 required coverage/checkpoint terms, 23 local Markdown links across the three intended documents, balanced code fences and Git whitespace. Frozen workbook SHA-256 was checked against the existing catalog. No application tests or live inspection are applicable to prompt authoring. The prompt is ready for use; actual reconciliation remains for the next model. Publication is verified separately before reporting completion.

Concurrent Metabase/R023 work appeared during authoring and is excluded from this task's commit. Only the prompt, its change log and the documentation-map entry are intended for publication here.
