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
- The VM deploy ran after this note was written; see Deploy record.

## Recovery
The freeze copy from `deploy-runtime.py` (a dated 0700 directory under `/var/lib/mw-integration-agent/rollback/`) holds the configuration with the three keys and the previous code. Rolling back to it restores both. In Git, revert this batch's commit.

## Open questions
None.

## Remaining work
The VM deploy and its readback (done, see Deploy record): done: configuration 80 keys instead of 83, catalogue revision 32 with 16 services.

## Deploy record
VM `vm-mw-credit-agent`, 24 October 2026 (UTC), by `deploy-runtime.py`; pins are in the [Environment inventory](../../project/Documents/Environment_Inventory.md).
| Step | Evidence |
| --- | --- |
| Checkout | `1d673a90` to `2032bc3d` |
| Freeze | 10:57:51Z, rollback directory `runtime-20261024T105751879717Z` (metadata sha256 `86e71c76…ef01`; its configuration has 83 keys) |
| Install and activate | install 10:57:52Z to 10:57:57Z; activate 10:58:09Z to 10:58:13Z, probe `618c6759-b835-43a9-81d1-4f94eb0c7987` |
| Readback | configuration 80 keys, none of the three retired keys; `code_version` `2032bc3d`; catalogue revision 32 with 16 services; `/ready` true; `check` ok |
Deviation: the deploy engine needed an `mw_agent` operator connection file that was absent on the VM; a temporary root-only file was created (password on stdin, never printed) and deleted afterwards. Observed, not caused by R094: `mw-receipt-summary` failed once at 11:06:42Z with `IndeterminateDatatype` (exit 2; the same failure once on 23 October at 11:46Z on the old package), clean since 11:07:40Z; a stale `integration-agent/build/` directory on the VM probably makes `pip` copy the 16 removed conversation modules back. Both are R095 candidates, the owner's call.
