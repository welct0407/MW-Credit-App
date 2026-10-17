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

| CI on `main` `5b4e50d`: Agent tests (unit and PostgreSQL lab), Development checks | Success |
| Debian `deploy-runtime.py` dry-run, freeze, install, activate (owner go 18 October 2026, Bangkok: "go for point 1") | Activated 17:27:06Z, 17 October 2026; backup `runtime-20261017T172649242280Z`; no unit or file change besides the package |
| Host after activation | Checkout HEAD `5b4e50d`; `/ready` 200 with that `code_version`; 8 `mw-*` timers; installed validator accepts `audit_relay`; first six minutes: no `mw-*` journal errors, every worker run exit 0, host monitor run normal |

## Not run
| Check | Why |
| --- | --- |
| Live catalogue change | Step 2, separate owner go |

## Recovery
`deploy-runtime.py rollback --commit 5b4e50dfa9be919321ac30160a4e0c1bfef548a8` restores `1feb6cd` from `runtime-20261017T172649242280Z`. The live catalogue does not use the name yet, so the old and new code accept the same live catalogue.

## Open questions
None.

## Remaining work
- Step 2, only after step 1 is live: add `"audit_relay": {"enabled": true, "implemented": true}` to the live and the repository catalogue together, bump both to revision 28, add the matching row to `SERVICE_CATALOGUE.md`, and run `check` and `receiver-ready`. Doing step 2 first would make the running code reject the catalogue and the deploy helper refuse the drift.
