# Dictionary tools

Current definitions: [Data Dictionary](../../Documents/Data%20Dictionary/README.md). Use targeted reads and guarded updates; no live audit is required for ordinary documentation.

## Runtime

Use bundled Python and the external pinned parser in `requirements.txt`. The default package directory is `$env:USERPROFILE/Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python`; override with `MW_DICTIONARY_PYTHON_PACKAGES` if needed. Do not reinstall when available.

## PostgreSQL capture (R103)

The capture is read-only and metadata-only, and runs on Linux and Windows through a local Cloud SQL Auth Proxy endpoint as `codex-cloud-read`; the direct public-IP connection is retired. The output stays under `MW_PRIVATE_ROOT`, outside the repository, and is never overwritten.

```bash
# Linux cloud session: opens or reuses the IAP tunnel of scripts/database/Invoke-CloudFlyway.py
python3 scripts/dictionary/capture_postgresql.py production "$MW_PRIVATE_ROOT/dictionary/production-complete.json"
# Windows: --local-port of the pinned proxy that Get-DbEnvironment started (loopback only)
py scripts\dictionary\capture_postgresql.py production <private path> --local-port 15432
# Targeted reconciliation, then apply the plan and validate
python3 project/scripts/dictionary/reconcile_captures.py plan <private dir> <output dir> --postgres-only --only relation:public.olap_portfolio_summary --only routine:<name>
python3 project/scripts/dictionary/reconcile_captures.py apply <output dir>/plan.json
python3 project/scripts/dictionary/dictionary.py index
python3 project/scripts/dictionary/dictionary.py validate
```

`--only` takes `kind:name` (repeatable or comma-separated) and needs `--postgres-only`; a named object the capture lacks is refused. Run it against `production`, because the dictionary records `loan_manager_prod` only, and after a migration is applied to PROD. Evidence for the R103 run is in `project/outputs/dictionary-r103-20261028/`.

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

New dictionary document files require explicit owner approval before creation and follow [FORMAT](../../Documents/Data%20Dictionary/FORMAT.md). Update affected existing definitions as part of development. Rebuild the index and validate once after a coherent direct-edit batch. Validation checks syntax/registration/identity/index/evidence, not live SQL correctness.

## Single-file export

Double-click [Export Data Dictionary.cmd](../Export%20Data%20Dictionary.cmd), or run `python scripts/dictionary/export_markdown.py`. This generates the ignored `Documents/Data_Dictionary_ChatGPT.md` from current dictionary and named context files. It performs no network, AI, upload or Git operations. Sources are re-extracted/byte-checked and rechecked before atomic output replacement.

Regenerate an existing snapshot when included source content changes. If the snapshot is missing or another output document is proposed, obtain explicit owner creation approval first; the export command itself grants no approval.

Run focused tool tests only when tooling changes:
`python -m unittest discover -s scripts/dictionary -p 'test_dictionary.py'` and `test_export_markdown.py`.

## Metadata capture

`capture_postgresql.py` is an explicitly invoked read-only catalog collector. Review target/access/output guards and use private output paths. It is not required for every model edit and does not authorize live mutations.
