# Preserved workbook evidence

These files retain source rows whose meaning depends on their original dated labels or later reconciliation. They are searchable text evidence and remain part of the complete dictionary migration.

- `guide/`: original workbook guidance, including dated baseline claims. Current repository instructions take precedence.
- `dev-differences/`: every nonempty Dev Differences row, grouped by its exact App label. Closed, historical and potentially active entries remain as recorded.
- `r008-production/`: every R008 Production row, grouped by its exact App label. Unique definitions and verification/adjudication text are preserved; none were applied to base definitions.

The former unplaced files were removed during owner-authorized cleanup: five rows contained only a version string, and two contained only list positions. They defined no table, slice or column. Their original bytes remain in the frozen workbook and migration commit `faa51d2`.

`row-NNNNN` is the original worksheet row number, scoped by the file's sheet. It is an evidence locator, not a live object key. Names and strings containing JSON are retained verbatim. `find` and `read` surface possible name matches; they do not establish semantic equivalence or precedence.

Use the [source-row map](../../../../outputs/dictionary-migration-20260923/row-map.jsonl) for exact provenance. The [frozen workbook](../../../AppSheet_Data_Dictionary.xlsx) remains the byte-preserved historical source. Reconciliation is deferred at the owner's request.
