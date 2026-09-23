# Ecosystem data dictionary

This folder is the maintained home for exact model and configuration documentation across the loan ecosystem. Start with the relevant system and object; do not read the complete dictionary for an ordinary change.

**Migration status, 23 September 2026:** all 16,496 nonempty data rows from the 14-sheet Excel dictionary were migrated into 185 text documents. Values, labels, source order and dated evidence were preserved. All imported objects are `imported-unreconciled`: the owner explicitly deferred live AppSheet inspection and reconciliation. A path under `recorded-production` describes the source sheet's label, not freshly verified production truth. Base definitions and release supplements can disagree.

| Need | Start here |
| --- | --- |
| OLTP table, column rules and Refs | [AppSheet OLTP tables](systems/appsheet/oltp/tables/) |
| OLAP table, column rules and Refs | [AppSheet OLAP tables](systems/appsheet/olap/tables/) |
| Slice filters, permissions and ordered membership | [OLTP slices](systems/appsheet/oltp/slices/) / [OLAP slices](systems/appsheet/olap/slices/) |
| App settings grouped by their original labels | [Recorded AppSheet settings](systems/appsheet/recorded-settings/) |
| SQL columns and constraints | [PostgreSQL relations](systems/postgresql/relations/) |
| SQL logic and other database annotations | [Recorded database logic](systems/postgresql/recorded-logic/) |
| Metabase model grain, fields and metadata | [Metabase models](systems/metabase/models/) |
| Future Grafana definitions | [Grafana namespace](systems/grafana/README.md) |
| Imported release supplements and old differences | [Workbook evidence](imports/excel-20260923/README.md) |
| Later reconciled DEV changes | [Development conventions](development/README.md) |
| Known limitations and incomplete records | [Unresolved items](unresolved.yaml) |
| File contract and adding another system | [Format](FORMAT.md) / [System registry](catalog.yaml) |
| Targeted reads, guarded updates and validation | [Tool guide](../../scripts/dictionary/README.md) |

## Efficient reading

Use `scripts/dictionary/dictionary.py find <object-name>` to locate a definition, then `read <file> --pointer <property-path>` to retrieve only the relevant portion. The generated [index](index.json) contains navigation metadata and object names, not a second copy of definitions. `find` defaults to 30 files and five matching subjects per file; increase `--limit` or `--matches` only when useful.

`read` includes verification status and bounded name matches in the imported supplements. These matches are navigation aids and can be incomplete or ambiguous. Consult the relevant supplement before treating a base value as authoritative for live work. The tool never resolves precedence or computes an effective DEV configuration from old differences.

## Maintenance

- Edit the owning YAML object and its change/release record. Use exact property names and complete literal expressions. Preserve unrelated properties and other tasks' changes.
- Run a guarded update or edit directly, rebuild the index when object names/locations change, and run `validate` before publication. Direct edits receive the same structural checks.
- Keep dated evidence with the source records and change logs. Current versions and instance identities belong in [Environment Inventory](../Environment_Inventory.md); business behavior belongs in [Model Overview](../AppSheet_Data_Model_Overview.md) and [Solution Design](../Solution_Design.md).
- Do not infer defaults or turn null into false, blank, zero or absence. Source strings containing JSON remain strings until a separately authorized normalization; source formula text remains literal.
- New verified definitions can use `documented` with source evidence. Reconciliation of imported definitions requires a later explicit task. Moving a file or importing a record does not verify the live object.
- Add only metadata/configuration to this dictionary. Credentials, borrower records and financial transaction data belong in their authorized stores.

The original [Excel workbook](../AppSheet_Data_Dictionary.xlsx) is frozen historical evidence at its existing path, preserving old links. Its SHA-256 is recorded in the catalog and checked by validation. All future dictionary updates go here. Do not run old workbook writers against it.

Migration checks and the complete source-row location map are in [migration evidence](../../outputs/dictionary-migration-20260923/README.md). That evidence is a dated conversion proof; it is not a live configuration audit.
