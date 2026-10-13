# Dictionary tools

Current definitions: [Data Dictionary](../../Documents/Data%20Dictionary/README.md). Use targeted reads and guarded updates; no live audit is required for ordinary documentation.

## Runtime

Use bundled Python and the external pinned parser in `requirements.txt`. The default package directory is `$env:USERPROFILE/Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python`; override with `MW_DICTIONARY_PYTHON_PACKAGES` if needed. Do not reinstall when available.

## Commands

From the repository root, using the established Python executable:

```powershell
python scripts/dictionary/dictionary.py find Payments --system postgresql
python scripts/dictionary/dictionary.py read systems/pwa/receipts.yaml --pointer /content
python scripts/dictionary/dictionary.py index
python scripts/dictionary/dictionary.py validate
python scripts/dictionary/dictionary.py update PRIVATE_PATCH.json
python scripts/dictionary/dictionary.py update PRIVATE_PATCH.json --apply
```

All commands accept `--root` before the command for isolated fixtures. Updates preview by default; application requires exact file SHA, old-value guards, reason and evidence. JSON Pointer escaping is `~1` for slash and `~0` for tilde. Changes target `/content/`; identity/provenance changes require reviewed direct edits. Preserve null/absent/blank distinctions. Candidate validation, concurrency checks and atomic writes guard updates.

New objects follow [FORMAT](../../Documents/Data%20Dictionary/FORMAT.md). Rebuild the index and validate once after a coherent direct-edit batch. Validation checks syntax/registration/identity/index/evidence, not live SQL correctness.

## Single-file export

Double-click [Export Data Dictionary.cmd](../Export%20Data%20Dictionary.cmd), or run `python scripts/dictionary/export_markdown.py`. This generates the ignored `Documents/Data_Dictionary_ChatGPT.md` from current dictionary and named context files. It performs no network, AI, upload or Git operations. Sources are re-extracted/byte-checked and rechecked before atomic output replacement.

Run focused tool tests only when tooling changes:
`python -m unittest discover -s scripts/dictionary -p 'test_dictionary.py'` and `test_export_markdown.py`.

## Metadata capture

`capture_postgresql.py` is an explicitly invoked read-only catalog collector. Review target/access/output guards and use private output paths. It is not required for every model edit and does not authorize live mutations.