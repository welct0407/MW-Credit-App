# Change notes — audit relay catalogue name, 17 October 2026

## Purpose
`mw-audit-relay.timer` runs on the Debian host but has no entry in the default-deny service catalogue (review AGT-DOC-07). The owner approved teaching the validator the name on 17 October 2026 (Bangkok). This is step 1 of 2.

## Changes
- `src/mw_integration_agent/config.py`: `validate_catalogue` accepts the service name `audit_relay`. Unknown names and enabled-but-unimplemented entries still fail closed.
- `tests/test_config.py`: one test that an `audit_relay` entry validates and that `implemented: false` with `enabled: true` is rejected.
- No catalogue, config, unit or timer change. `service-catalogue.json` stays at revision 27.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements) | 529 tests, OK, 82 skipped (lab suites) |
| `ruff check --no-cache integration-agent` | All checks passed |

## Not run
| Check | Why |
| --- | --- |
| PostgreSQL lab suites | No catalogue or state change; CI `agent-tests.yml` runs them |
| Debian deploy | Needs an owner go for the exact commit |

## Recovery
Revert the commit. The live catalogue does not use the name yet, so the old and new code accept the same live catalogue.

## Open questions
None.

## Remaining work
- Step 1 deploy: a normal code-only deploy with `scripts/deploy-runtime.py` (the catalogue is unchanged, so the helper's drift check passes).
- Step 2, only after step 1 is live: add `"audit_relay": {"enabled": true, "implemented": true}` to the live and the repository catalogue together, bump both to revision 28, add the matching row to `SERVICE_CATALOGUE.md`, and run `check` and `receiver-ready`. Doing step 2 first would make the running code reject the catalogue and the deploy helper refuse the drift.
