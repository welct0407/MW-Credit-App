# Ecosystem data dictionary migration — 23 September 2026

## Scope and authorization

Owner approved migration from `Documents/AppSheet_Data_Dictionary.xlsx` to an extensible text dictionary, including future ecosystem apps such as Metabase and Grafana. Owner explicitly excluded reconciliation with live AppSheet apps and will perform it later. This is documentation/tooling work and needs no product release number.

## Changes

- Added [Documents/Data Dictionary](../Documents/Data%20Dictionary/README.md): YAML definitions, common format, registered system namespaces, generated navigation index, preserved source supplements, unresolved register and future development conventions.
- Migrated all 14 sheets / 16,496 nonempty data rows into 185 object/evidence files. AppSheet table rules and relationships are grouped by table; slice membership remains ordered. SQL records and Metabase models have separate namespaces. Grafana is explicitly planned, with no invented inventory.
- Preserved original labels, property paths, values, nested JSON strings and historical scopes. Seven incomplete source rows remain unplaced; one Excel formula preserves formula text and cached value. No conflict resolution, field normalization, precedence selection, automatic DEV overlays or live checks occurred.
- Added [scripts/dictionary](../scripts/dictionary/README.md): one-time converter, independent XML verifier, selective find/read, guarded per-object update, strict YAML/structure validation, index builder and synthetic safety tests. Pinned PyYAML 6.0.2 is installed in the private project tools directory outside Git and the shared runtime.
- Updated AGENTS, documentation map/model references and script guides to route future updates to the text dictionary. The original workbook remains byte-identical frozen evidence at its existing path. The legacy release dictionary helper now rejects that frozen workbook before reading or writing.
- Added scoped `.gitattributes` rules for stable LF text and reproducible migration hashes on Windows.

## Rollback

Starting Git commit: `d2c8ed41cac3ce86441ad76c18acdcb594f2bc42`; no pre-existing working-tree changes. Frozen workbook SHA-256: `1b33aebd71f79ef16023d510ceb8276942444b4665045611f12acce5f247b377`.

A normal revert of the migration commit restores former documentation/tool routing. Preserve any subsequent text edits before reverting. No app, database or reporting configuration changed; no live backup/restore was required.

## Verification

- Independent workbook XML extraction reconstructed every source row from saved YAML: 86,590 typed values matched, zero missing rows and zero duplicated source/target rows. Source workbook hash unchanged. [Verification](../outputs/dictionary-migration-20260923/verification.json).
- Structural/index validation passes. Strict parser and disposable-fixture helper tests cover multiline/Unicode values, scalar distinctions, duplicates/aliases/tags, preview/apply behavior, stale guards, additions/removals, overlapping targets, ordered lists, path confinement, concurrent writer lock, extension registration and selective reads.
- Frozen Excel helper guard, targeted read smoke checks, changed-document links and Git whitespace checks are recorded in [checks](../outputs/dictionary-migration-20260923/checks.json).
- [Source manifest and row map](../outputs/dictionary-migration-20260923/README.md) provide complete migration accounting. Generated text contains documentation/configuration records only; dependency binaries and caches are excluded from publication.

## Status and remaining work

Migration and documentation/tooling verification complete. The containing Git commit is the publication record; upstream publication is verified before reporting completion to the owner. Reconciliation and live verification are deferred by owner instruction and explicitly labeled in the dictionary. No manual app tests are required for this migration. Broader Metabase/Grafana inventories can be added in future scoped tasks using the shared structure.

## Refinement — obsolete records and migration-status clarity, 23 September 2026

Owner authorized removal of `olap-removed-2026-09-16` and asked to resolve migration-only uncertainties. Starting commit `faa51d22bfe73a9b79a1bf4569dac6efa23fc6bc`; working tree was clean. No live reconciliation was authorized or performed.

- Deleted the obsolete Calendar file (12 recorded columns) and its index entry. Git and the frozen workbook retain history.
- Deleted the two unplaced files: five rows contained only `v1.100081`, and two contained only ordinals 1 and 2. These were source residue, not missing imported objects.
- Normalized the single Excel constant `="ADDS_AND_UPDATES"` to the text `ADDS_AND_UPDATES`, using an exact old-value/file-hash guard. The literal and cached value agree. The object's imported-unreconciled status remains; its live configuration was not verified.
- Closed UNPLACED and EXCEL-FORMULA, classified COVERAGE as informational, and retained four deferred reconciliation topics (baseline currency, release supplements, DEV history and label/identity alignment). The validator now counts those categories separately instead of presenting all seven as outstanding limitations.
- Updated current guides and the index. Original migration manifests/maps/check reports are unchanged and describe commit `faa51d2`. Current state has 182 object/evidence documents.

[Cleanup decisions](../outputs/dictionary-migration-20260923/cleanup.json) and [verification](../outputs/dictionary-migration-20260923/cleanup-checks.json) cover the exact deletions, unchanged remaining imports, constant normalization, validation and helper tests. Rollback is a normal revert of this refinement commit, preserving later edits; no live rollback is needed. Publication follows the standing normal commit/push rule.
