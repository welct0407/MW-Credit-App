# Change notes — R094 retired configuration keys, 24 October 2026

## Purpose
R091 left three inert keys of the retired Instagram Partner conversation in the VM configuration (`conversation_schema_file`, `conversation_schema_sha256`, `partner_conversation_backup`). R094 retires them, and the code-only runtime deploy removes them from the live file. The owner asked to proceed with R094 until it is in production.

## Changes
- `src/mw_integration_agent/config.py`: `RETIRED_KEYS` gains the three keys. `validate_config()` refuses a configuration that still carries one, as for the other retired keys. The comment says that the deploy drops every retired key.
- `scripts/deploy-runtime.py`: `R091_KEYS` gains the same three keys (a unit test pins it equal to `RETIRED_KEYS`). `prepare()` now drops every retired key in every mode. Previously it refused a retired key outside the R091 catalogue change (31 to 32). Every other key, the catalogue and its revision stay as they are; only `code_version` follows the pinned commit. The module docstring says so.
- `tests/test_deploy_runtime.py`: the refusal case is replaced by `test_retired_keys_are_dropped_outside_the_r091_change`. On an unchanged catalogue it drops the three keys plus another retired key, keeps everything else, and leaves its inputs untouched. The package validator finds no retired key in the result. `tests/test_config.py` already checks every name in `RETIRED_KEYS`, so it now covers the three keys.
- No catalogue change: `service-catalogue.json` stays at revision 32.

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache .` (ruff 0.16.9, in `integration-agent/`) | All checks passed |
| `PYTHONPATH=src python -B -m unittest discover -s tests` with the hash-pinned `requirements.lock` in a scratch venv (in `integration-agent/`) | 575 tests OK, 68 skipped (the PostgreSQL lab suites) |

## Not run
- The agent PostgreSQL lab (`tests/lab/setup.sh`): this change touches no agent migration or state code.
- The VM deploy (`deploy-runtime.py` dry-run, freeze, install and activate on `vm-mw-credit-agent`) and its readback. These are for the orchestrator.

## Recovery
The freeze copy from `deploy-runtime.py` (a dated 0700 directory under `/var/lib/mw-integration-agent/rollback/`) holds the configuration with the three keys and the previous code. Rolling back to it restores both. In Git, revert this batch's commit.

## Open questions
None.

## Remaining work
The VM deploy and its readback, for the orchestrator: configuration 81 keys instead of 84, catalogue revision 32 with 16 services.
