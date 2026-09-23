# Dictionary migration evidence — 23 September 2026

Status: migration implemented and verified. Owner requested migration only and explicitly deferred AppSheet reconciliation. No live apps, databases, reports, financial records or notifications were accessed or changed.

## Result

The [ecosystem dictionary](../../Documents/Data%20Dictionary/README.md) is now maintained as YAML objects with Markdown guidance and a generated navigation index. It includes AppSheet, PostgreSQL and the existing Metabase model inventory, plus a planned Grafana namespace and conventions for adding other systems. The old workbook remains frozen at its original path for historical links.

All 14 worksheets and 16,496 nonempty data rows are accounted for in 185 object/evidence documents. The independent verifier compared 86,590 typed cell values, including complete expression strings, Unicode, nulls, source order, and the exceptional Excel formula with its cached value. No source rows were missing or mapped twice. Base definitions and dated supplements remain separate; no current-state precedence was inferred.

| Evidence | Purpose |
| --- | --- |
| [Source manifest](source-manifest.json) | Frozen source hash, headers, row positions, workbook features and hashes of imported object files |
| [Row map](row-map.jsonl) | Exact source worksheet/row to target file/property mapping; values are not duplicated |
| [Migration verification](verification.json) | Independent workbook XML extraction compared against reconstructed rows from saved YAML |
| [Tool and documentation checks](checks.json) | Structural validation, helper tests, frozen-source guard, selective-read smoke checks and local links |

The converter used bundled `openpyxl` only to read the workbook. The verifier uses an independent standard-library XML/ZIP extraction path. YAML parsing uses pinned PyYAML 6.0.2, installed outside the repository and bundled runtime. `.gitattributes` preserves LF in the new text files so recorded hashes survive Windows Git checkouts.

## Preserved limitations

- Every imported object is `imported-unreconciled`; source labels do not certify current deployed values.
- R008 supplements and Dev Differences retain all original labels and values. They are searchable evidence, not automatically applied overrides.
- Seven nonempty rows with incomplete identity remain explicitly unplaced. One Excel formula retains both exact formula and cached value. No guesses were used to fill gaps.
- Environment label variants, removed-object labels, unknown instance/database identities, different property spellings and strings containing nested JSON remain as recorded.
- Grafana has no imported definitions. Other systems' coverage is exactly the workbook's recorded coverage.

See the maintained [unresolved register](../../Documents/Data%20Dictionary/unresolved.yaml). Semantic reconciliation and live verification belong to the owner's later task; they are not unfinished migration steps.

## Recovery and future checks

Starting commit: `d2c8ed41cac3ce86441ad76c18acdcb594f2bc42`; the working tree was clean. Source SHA-256: `1b33aebd71f79ef16023d510ceb8276942444b4665045611f12acce5f247b377`.

The original workbook bytes are unchanged. A normal Git revert of the migration commit restores the former documentation/tool routing if needed; coordinate any subsequent dictionary edits first. No live rollback is needed for this file-only change. Historical workbook writers remain historical; the maintained legacy helper rejects the frozen workbook as input.

`verify_migration.py` is a dated equality check against the imported state. Legitimate later dictionary edits will change imported hashes/values; use `dictionary.py validate` for ongoing maintenance. Keep this evidence as the original migration proof.

The authoritative change record is [CHANGE_NOTES_DATA_DICTIONARY_MIGRATION_2026-09-23.md](../../Change%20Logs/CHANGE_NOTES_DATA_DICTIONARY_MIGRATION_2026-09-23.md).

## Subsequent cleanup — 23 September 2026

At owner request, the obsolete 12-column OLAP Calendar inventory was deleted. The seven unplaced rows were identified as version/ordinal-only workbook residue and deleted. App Settings D121 was normalized from a constant Excel formula/cached-value pair to the matching text `ADDS_AND_UPDATES`. Four reconciliation topics remain deferred; future ecosystem coverage is informational. No live access or semantic reconciliation occurred.

[Cleanup decisions](cleanup.json) and [cleanup verification](cleanup-checks.json) record the refinement. The original source manifest, row map and verification report remain unchanged and correspond to commit `faa51d2`; use that commit to reproduce initial import equality. The maintained dictionary now contains 182 documents.
