# Dictionary tooling

R051 performance: `capture_r051_performance.py` reads the ten affected V73 routines and three relations; `close_r051_performance.py --apply` updates only their guarded DEV overlays. [Evidence](../../outputs/r051-trigger-performance/README.md).

R051: `capture_r051_crud.py` reads only affected DEV V72 catalog definitions. `close_r051_crud.py` previews (or `--apply` writes) guarded selected-property DEV overlays at OLTP194/OLAP56: 27 AppSheet objects, 44 routines and 10 relations. Saved UI readbacks/checkpoints and SQL metadata are linked; unlisted properties are not claimed as a full export. Neither helper mutates live definitions. [Current delta](../../Documents/Data%20Dictionary/DEV_R051_CRUD.md).

R049: `close_r049_upcoming.py` validates the private before/after AppDoc captures, independently parses final HTML, checks the exact 12-object change set, and writes guarded DEV-only overlays plus the existing SQL overlay status (`--apply`; preview by default). `capture_r049_upcoming_production.py` reads the V2 SQL provider from PROD; `close_r049_upcoming_production.py` previews/applies guarded canonical PROD definitions and closes dated DEV overlays from the saved AppDoc and SQL metadata. These helpers do not mutate live apps or databases. [DEV evidence](../../outputs/r049-upcoming-summary/HANDOVER.md) · [PROD evidence](../../outputs/r049-production/README.md).

R048 upcoming charges: `capture_r048_upcoming.py` collects only the three affected DEV SQL view definitions using the existing verified SSL metadata collector. `close_r048_upcoming.py` defaults to preview; `--apply` writes the guarded 23-object DEV overlay and index after validating independently parsed saved AppDoc HTML/DOM metadata and targeted SQL capture. These are dated OLTP1.000140/V54 closure helpers, not live app mutators or general deployment tools. Private inputs stay outside Git; only sanitized selected definitions are published. [Record](../../outputs/r048-upcoming-charges/IMPLEMENTATION.md).

The authoritative text dictionary starts at [Documents/Data Dictionary](../../Documents/Data%20Dictionary/README.md). The Excel workbook is frozen migration evidence. Ordinary dictionary read/update/validate/export commands are local. The explicitly invoked PostgreSQL capture command below is a read-only live metadata collector.

## Single-file ChatGPT export

Double-click [Export Data Dictionary.cmd](../Export%20Data%20Dictionary.cmd). It runs `Export-DataDictionary.ps1` and `export_markdown.py`, producing `Documents/Data_Dictionary_ChatGPT.md`. See the [user instructions](../../Documents/Data_Dictionary_Export.md). The generated output is local and Git-ignored; sources and tooling remain authoritative.

The renderer discovers all YAML/YML and Markdown files under the dictionary and includes the three named architecture/development context documents. It does not depend on the generated index or an AppSheet-specific property list. Registered systems/kinds using format 1 and arbitrary nested JSON-compatible content are supported, including new systems. Strict common-envelope validation remains in force; a new envelope version requires an explicit compatibility update. Every embedded file is re-extracted and byte-checked before writing. Source membership/content and Git state are rechecked before atomic replacement, and failures preserve the previous output. No linked external/repository files are fetched automatically.

For direct invocation: `python scripts/dictionary/export_markdown.py` with the bundled Python executable below. An optional `--output` accepts another `.md` path inside the repository, outside dictionary/context source files. An existing output must carry this exporter's generated-file marker before it can be overwritten. Use `--no-pause` on the CMD launcher for automated checks. The wrapper also accepts the `MW_DICTIONARY_PYTHON` executable override.

## Runtime

Use the bundled Python executable from the [scripts guide](../README.md). The parser is pinned in [requirements.txt](requirements.txt); install it outside both the repository and the shared Codex bundle. No Node dependencies or additional node_modules directories are needed.

```powershell
$dictionaryPython = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
$dictionaryPackages = "$env:USERPROFILE/Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python"
& $dictionaryPython -m pip install --no-deps --target $dictionaryPackages -r scripts/dictionary/requirements.txt
```

The default package location above is used automatically. For another location, set `MW_DICTIONARY_PYTHON_PACKAGES`. Keep the pinned version; do not install into the shared runtime. The migration additionally uses the already bundled `openpyxl` for read-only extraction.

## Commands

Run from the repository root; paths in patch files are relative to `Documents/Data Dictionary`. All commands accept `--root` before the command for an isolated dictionary fixture.

```powershell
& $dictionaryPython scripts/dictionary/dictionary.py find Loans
& $dictionaryPython scripts/dictionary/dictionary.py read systems/appsheet/oltp/tables/loans.yaml --pointer '/content/columns/Borrower Name'
& $dictionaryPython scripts/dictionary/dictionary.py validate
& $dictionaryPython scripts/dictionary/dictionary.py index
& $dictionaryPython scripts/dictionary/dictionary.py update path/to/patch.json
& $dictionaryPython scripts/dictionary/dictionary.py update path/to/patch.json --apply
& $dictionaryPython -m unittest discover -s scripts/dictionary -p 'test_*.py'
```

`find` uses the generated index. `read` returns the selected data, identity, provenance status, file hash and related imported evidence. It does not decide which conflicting value is current or apply old DEV differences as overrides. `index` regenerates only navigation metadata. `validate` checks strict YAML, common structure, system registration, content shape, index consistency, evidence pointers and the frozen workbook hash. Imported semantic ambiguities are reported separately from structural errors.

`update` defaults to a preview. A patch targets one file, uses a hash from `read`, and supplies exact old-value guards and evidence. It can add, replace or remove a mapping entry; list edits replace the whole ordered list with an exact old-list guard. JSON Pointer uses `~1` for `/` and `~0` for `~`.

```json
{
  "file": "systems/appsheet/oltp/tables/loans.yaml",
  "expected_sha256": "hash returned by read",
  "evidence": "relative/path/to/verified-change-record.md",
  "reason": "Describe the documented change",
  "changes": [{
    "pointer": "/content/columns/Example/rules/App formula",
    "expected": {"state": "value", "value": "old expression"},
    "target": {"state": "value", "value": "new expression"}
  }]
}
```

Use `{"state":"absent"}` for a missing mapping entry. An actual null uses `{"state":"value","value":null}`. Empty string, zero, false, null, and absence remain distinct. A patch cannot change identity or mark an imported object as reconciled. Apply validates a candidate before replacing a file, rechecks the source hash, writes atomically, then refreshes the derived index. Keep multi-object work in a coherent Git change and run validation before publication.

New objects and systems use [FORMAT.md](../../Documents/Data%20Dictionary/FORMAT.md). Add an object file, register a new system if necessary, rebuild the index and validate. Schema extensions need an explicit format/tool change rather than silently inventing another layout.

## One-time migration

`migrate.py` creates a new target directory and refuses an existing one. It imports the frozen workbook without live access or reconciliation. `verify_migration.py` independently reconstructs each source row from the written files using the generated location map, compares exact typed values, verifies formula/cached-value preservation, and checks source and output hashes. Migration reports belong under `outputs/dictionary-migration-20260923/`.

After normal future dictionary edits, the original migration equality check is expected to differ; use `validate` for ongoing work. The original migration report remains dated evidence. Never rerun the migration over the maintained dictionary.

Owner-authorized cleanup removed obsolete/residue records and normalized one constant after the initial migration. To reproduce the original complete equality check, use an isolated checkout of migration commit `faa51d2`; the source manifest and row map describe that commit. Current validation reports deferred, resolved and informational register entries separately.

The former Excel helper `scripts/releases/dictionary.mjs` and dated dictionary writers are historical tooling. They are not the update path for the maintained dictionary. Existing release payloads and historical artifacts retain their original meaning.

## Reconciliation capture and verification

The [24 September run](../../outputs/dictionary-reconciliation-20260924/README.md) reconciled independently captured PROD/DEV app and database metadata. These helpers preserve exact values; they do not establish business correctness or execute workflows.

- `capture_postgresql.py <production|development> <private-output.json>` connects through `database/environments.json`, validates the expected instance/host/database tuple, requires SSL, and uses a read-only repeatable-read transaction with a 30-second statement timeout. It reads catalog/deployment/job metadata only, never business rows or application functions. It refuses an existing output or a destination outside approved private storage. Its reviewed queries target the captured PostgreSQL 18 schema. Review identity/version changes before reuse. Psycopg uses the existing external packages described in the scripts guide.
- `appdoc_capture.py <private-folder>` independently compares complete saved AppDoc HTML with DOM-extracted ordered records and source summary counts. It rejects orphan schemas, duplicate properties and unexpected legacy workflows.
- `reconcile_captures.py plan <private-folder> <new-run-folder>` creates a reviewed, hash-guarded local write plan. `apply <plan.json>` applies it with typed roundtrip and stale-file checks. Do not replay the completed run's compact, non-replayable `plan.json`, or rerun this broad planner for routine updates.
- `reconcile_editor.py <private-folder> <run-folder> --apply` adds reviewed DOM metadata (bindings, views, bots, reusable tasks, settings, theme and access). It excludes preview/test rows, redacts private app-user identities and signed logo transport signatures, and checks file hashes. Preview without `--apply` first. Use `--verify` for saved-value readback only.
- `capture_template.py <private-xlsx> <run-folder>` extracts the known export template's nonempty cells read-only and checks literal table/slice/column references. It does not render an export or evaluate template expressions.
- `verify_reconciliation.py <run-folder>` independently reconstructs every captured PROD/DEV AppDoc and catalog object from saved YAML, checks both identity sets and exact typed property values, and rejects uncovered canonical production objects.
- `validate_dependencies.py <run-folder>` checks source aliases, physical SQL columns, Refs, slice members, view/dashboard sources, action assignments/group order/references, format targets, view dependencies and trigger routine symbols.
- `review_semantics.py <run-folder>` checks selected workflow symbol links, DEV/PROD routine-body differences and view/task control parity. It is explicitly not a complete expression or procedural SQL parser.
- `finalize_evidence.py` and `close_reconciliation.py` are **dated run closure helpers**, not general future update commands. They consolidate already reviewed private captures, preserve historical pointers and write the run's coverage. Review them before use on another capture; never rerun them over later dictionary updates.

Run verifiers that write `coverage.json` sequentially. Use the bundled Python and the existing external PyYAML runtime. The regular test command above covers exact state preservation, ordering, overload identity, stale guards, private-data removal and source-ID decoding. Public observation files are sanitized metadata; raw captures and downloaded templates stay outside Git. The dictionary index is navigation only, not a source of live truth.

`validate_run.py <private-folder> <run-folder>` runs the dated run's local checks sequentially and records actual exit codes, outputs and artifact hashes. It performs no live access. Its private input is used for independent saved AppDoc parsing. Use it only with the matching complete run evidence.


R047 targeted closure helpers: `capture_r047.py` reads only affected PROD catalog objects with tuple/SSL/read-only assertions; `close_r047.py` plans exact AppDoc/catalog updates and closes the dated overlays. Review saved evidence before `--apply`. Batch callers may use `plan_update(..., validate_candidate=False)` only when they validate all candidate overrides together before any write, recheck all baseline hashes, read back saved bytes, and rebuild/validate the index. Ordinary CLI updates retain immediate validation.

R048 interest closure: `capture_r048_interest_production.py` captures only affected PROD metadata using the existing read-only collector. `close_r048_interest.py` plans targeted saved-state updates and closes 13 interest overlays with batch validation and exact hash guards; review before `--apply`. It is a dated closure helper, not a recurring migration or app-edit command. [Evidence](../../outputs/r048-loan-interest-production/README.md).

R048 upcoming production closure: `capture_r048_upcoming_production.py` reads only four PROD view definitions/columns under verified read-only SSL; `close_r048_upcoming_production.py` promotes saved PROD3.000260 metadata with independent HTML/DOM equality, guarded batch validation and closes28 dated DEV overlays. Preview before `--apply`. [Evidence](../../outputs/r048-production/README.md).
