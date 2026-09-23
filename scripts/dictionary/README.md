# Dictionary tooling

The authoritative text dictionary starts at [Documents/Data Dictionary](../../Documents/Data%20Dictionary/README.md). The Excel workbook is frozen migration evidence. Dictionary operations are local file operations; they never connect to an app or database.

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
