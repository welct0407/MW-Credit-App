# Ecosystem data dictionary

R051 ordinary source CRUD is a labeled [DEV delta](DEV_R051_CRUD.md); existing exported PROD table/action definitions are not silently overwritten.

**R026 partial-state notice, 24 September:** database pg_cron retirement and export lifecycle are updated. App records from the earlier audit have not been fully reconciled after the partial OLAP upgrade and DEV Daily Analytics regeneration. Use the [owner-directed closure](../../outputs/r026-dictionary-fixes/closure.md) for actual versions, remaining locale/schema differences and verification limits; do not treat older app records as current verified truth for those affected properties.

This folder is the maintained home for exact model and configuration documentation across the loan ecosystem. Start with the relevant system and object; do not read the complete dictionary for an ordinary change.

**Original migration, 23 September 2026:** all 16,496 nonempty data rows from the 14-sheet Excel dictionary were migrated into 185 text documents. Values, labels, source order and dated evidence were preserved. Imported objects are `imported-unreconciled`: the owner explicitly deferred live AppSheet inspection and reconciliation. A path under `recorded-production` describes the source sheet's label, not freshly verified production truth. Base definitions and release supplements can disagree.

**Historical cleanup:** the original inventory was reduced to 182 documents after deleting the obsolete Calendar inventory and seven empty-identity residue rows. The single constant Excel formula was normalized to its matching literal value. There were no failed imports. Original migration evidence remains dated and unchanged.

**Current reconciliation, 24 September 2026:** the owner authorized independent live metadata inspection of PROD/DEV OLTP, PROD/DEV OLAP and both PostgreSQL databases. Current `production` objects now contain complete captured AppDoc/catalog definitions, with editor supplements for physical sources, views, settings, access and automation. Explicit DEV deltas reconstruct the independently observed DEV state. Read the [coverage, findings and validation](../../outputs/dictionary-reconciliation-20260924/README.md) for exact coverage and limitations. `documented` describes evidence-backed content, not a claim of runtime correctness, owner acceptance or deployment readiness. Personal access identities and signed image access tokens are intentionally withheld from published evidence.

**R049 production closure, 29 September:** the 12 affected OLTP objects and the V2 SQL view are documented from saved PROD AppDoc and read-only SQL metadata at OLTP3.000263/V56. Their R049 DEV overlays are closed and retained as dated evidence; environment-specific source bindings remain intentional. [Promotion evidence](../../outputs/r049-production/README.md).

| Need | Start here |
| --- | --- |
| OLTP table, column rules and Refs | [AppSheet OLTP tables](systems/appsheet/oltp/tables/) |
| OLAP table, column rules and Refs | [AppSheet OLAP tables](systems/appsheet/olap/tables/) |
| Slice filters, permissions and ordered membership | [OLTP slices](systems/appsheet/oltp/slices/) / [OLAP slices](systems/appsheet/olap/slices/) |
| Current views, actions, formatting and bots | [AppSheet coverage guide](systems/appsheet/README.md) |
| Current app settings and access | [OLTP settings](systems/appsheet/oltp/settings/) / [OLAP settings](systems/appsheet/olap/settings/) |
| App settings grouped by their original labels | [Recorded AppSheet settings](systems/appsheet/recorded-settings/) |
| SQL columns and constraints | [PostgreSQL relations](systems/postgresql/relations/) |
| Current full SQL bodies, privileges and metadata | [PostgreSQL coverage guide](systems/postgresql/README.md) |
| SQL logic and other database annotations | [Recorded database logic](systems/postgresql/recorded-logic/) |
| Metabase model grain, fields and metadata | [Metabase models](systems/metabase/models/) |
| Future Grafana definitions | [Grafana namespace](systems/grafana/README.md) |
| Imported release supplements and old differences | [Workbook evidence](imports/excel-20260923/README.md) |
| Later reconciled DEV changes | [Development conventions](development/README.md) |
| Deferred reconciliation, resolved cleanup and future coverage | [Status register](unresolved.yaml) |
| File contract and adding another system | [Format](FORMAT.md) / [System registry](catalog.yaml) |
| Targeted reads, guarded updates and validation | [Tool guide](../../scripts/dictionary/README.md) |
| One Markdown file for a ChatGPT design discussion | [Double-click exporter](../Data_Dictionary_Export.md) |

## Efficient reading

Use `scripts/dictionary/dictionary.py find <object-name>` to locate a definition, then `read <file> --pointer <property-path>` to retrieve only the relevant portion. The generated [index](index.json) contains navigation metadata and object names, not a second copy of definitions. `find` defaults to 30 files and five matching subjects per file; increase `--limit` or `--matches` only when useful.

`read` includes verification status and bounded name matches in imported supplements. These matches are navigation aids, not overrides. Current `production` scope with the 24 September evidence takes precedence as a dated observation over imported/as-recorded values for that same target/property. The tool never computes an effective DEV configuration from old differences; the reconciliation verifier explicitly reconstructs only its observed deltas.

## Maintenance

- Edit the owning YAML object and its change/release record. Use exact property names and complete literal expressions. Preserve unrelated properties and other tasks' changes.
- Run a guarded update or edit directly, rebuild the index when object names/locations change, and run `validate` before publication. Direct edits receive the same structural checks.
- Keep dated evidence with the source records and change logs. Current versions and instance identities belong in [Environment Inventory](../Environment_Inventory.md); business behavior belongs in [Model Overview](../AppSheet_Data_Model_Overview.md) and [Solution Design](../Solution_Design.md).
- Do not infer defaults or turn null into false, blank, zero or absence. Source strings containing JSON remain strings until a separately authorized normalization; source formula text remains literal.
- New verified definitions can use `documented` with source evidence. The authorized 24 September reconciliation covers only its listed targets/properties; remaining imported definitions require their own evidence. Moving or importing a file does not verify it.
- Add only metadata/configuration to this dictionary. Credentials, borrower records and financial transaction data belong in their authorized stores.

The original [Excel workbook](../AppSheet_Data_Dictionary.xlsx) is frozen historical evidence at its existing path, preserving old links. Its SHA-256 is recorded in the catalog and checked by validation. All future dictionary updates go here. Do not run old workbook writers against it.

Migration checks and the complete source-row location map are in [migration evidence](../../outputs/dictionary-migration-20260923/README.md). That evidence is a dated conversion proof; it is not a live configuration audit.
