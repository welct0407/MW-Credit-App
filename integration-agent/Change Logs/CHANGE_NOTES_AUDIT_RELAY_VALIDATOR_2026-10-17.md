# Change notes — audit relay catalogue name, 17 October 2026

## Purpose
`mw-audit-relay.timer` runs on the Debian host but has no entry in the default-deny service catalogue (review AGT-DOC-07). The owner approved teaching the validator the name on 17 October 2026 (Bangkok). Step 1 teaches the validator the name; step 2 adds the catalogue key.

## Changes
- `src/mw_integration_agent/config.py`: `validate_catalogue` accepts the service name `audit_relay`. Unknown names and enabled-but-unimplemented entries still fail closed.
- `tests/test_config.py`: one test that an `audit_relay` entry validates and that `implemented: false` with `enabled: true` is rejected.
- Step 1: no catalogue, config, unit or timer change.
- Step 2 (`8706789`, owner go 18 October 2026, Bangkok: "go for step 2"): `service-catalogue.json` revision 28 with `"audit_relay": {"enabled": true, "implemented": true}` and the matching `SERVICE_CATALOGUE.md` row. The live catalogue changed by the config-only route: backup `/root/service-catalogue.json.pre-rev28`, six worker timers stopped and idle, key added (owner and mode kept), `check` passed, receiver restarted and ready, timers started (17:39:54Z to 17:39:56Z, 17 October 2026).

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements) | 529 tests, OK, 82 skipped (lab suites) |
| `ruff check --no-cache integration-agent` | All checks passed |

| CI on `main` `5b4e50d`: Agent tests (unit and PostgreSQL lab), Development checks | Success |
| Debian `deploy-runtime.py` dry-run, freeze, install, activate (owner go 18 October 2026, Bangkok: "go for point 1") | Activated 17:27:06Z, 17 October 2026; backup `runtime-20261017T172649242280Z`; no unit or file change besides the package |
| Host after activation | Checkout HEAD `5b4e50d`; `/ready` 200 with that `code_version`; 8 `mw-*` timers; installed validator accepts `audit_relay`; first six minutes: no `mw-*` journal errors, every worker run exit 0, host monitor run normal |

| CI on `main` `8706789`: Agent tests (unit and lab), Development checks | Success |
| Live and repository catalogue after step 2 (the deploy helper's drift check) | Revision 28 both; service names and `implemented` flags equal |
| Host six minutes after step 2 | No `mw-*` journal errors; every worker run exit 0; `/ready` 200 |

## Not run
None.

## Recovery
- Step 2: copy `/root/service-catalogue.json.pre-rev28` back by the same config-only route and revert `8706789`, together.
- Step 1: `deploy-runtime.py rollback --commit 5b4e50dfa9be919321ac30160a4e0c1bfef548a8` restores `1feb6cd` from `runtime-20261017T172649242280Z`. Roll back step 2 first: the `1feb6cd` validator rejects a catalogue that contains `audit_relay`.

## Open questions
None.

## Remaining work
None.
