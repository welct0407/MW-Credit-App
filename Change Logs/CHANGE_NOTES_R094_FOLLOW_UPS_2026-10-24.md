# Change notes — R094 follow-ups from R091 and R093, 24 October 2026

## Purpose
Close the three items left open by R091 and R093: the chat image still carries the old schema digest, three dead configuration keys remain on the VM, and the integration agent still holds SELECT on five notification, push and jobs tables. Owner instruction of 24 October 2026: "Proceed with R094 till it's in production". Designed by Archie (A); Byte (B) implements, Forge (F) deploys, Chase (C) checks, Dewey (D) records. Echo (E) is not applicable: no UI change.

## Changes
- **Chat redeploy** (chat service only, DEV then PROD, from the R094 `main` commit): the image carries the schema digest asset at migration head 109 (after V109). The prompt digest changes, so each thread starts one new history epoch on its next turn (designed). Method as R092: Cloud Build, Terraform plan 0/1/0, `chat_image` in DEV and `runtime_image_overrides["chat"]` in PROD.
- **Retire three VM keys** (`integration-agent/`, Byte): `conversation_schema_file`, `conversation_schema_sha256` and `partner_conversation_backup` join the agent's `RETIRED_KEYS`, and the deploy's `prepare()` drops retired keys in every mode. The standard VM deploy then leaves configuration at 81 keys; the service catalogue stays at revision 32. Details in the agent change note.
- **V109** (`database/migrations/`, Byte): revokes `mw_integration_agent` SELECT on `pwa_notification_events`, `pwa_notification_preferences`, `pwa_notification_deliveries`, `pwa_push_subscriptions` and `pwa_job_runs`, inherited from the pre-R085 PROD default privilege. Nothing depends on it: the collector reads the `SECURITY DEFINER` function `monitoring.pwa_ops_health_v1`. Revoke only (no table, column or function change); DEV is a no-op. `Test-AccessMatrix.sql` extended.
- **Schema digest** (`services/chat/assets/schema-digest.json`): rebuilt at migration 109.
- **Documents** (Dewey): `database/README.md` (V109, not yet applied), `integration-agent/docs/POSTGRESQL_OPERATIONS.md` (the agent's SELECT revoked by V109), `project/Documents/Development_Changes.md` (R094 row), `project/Documents/Environment_Inventory.md` (placeholders for the DEV and PROD chat, V109 and the VM deploy; the catalogue row), this note.
- **Open for R095, only if the owner wants it**: the likely inherited agent SELECT on `pwa_row_changes` and the PROD default privilege itself. Not in this scope.

## Checks
| Command | Result |
| --- | --- |
| `ruff check` (integration-agent) | Pass |
| Agent unit tests (`unittest discover` with the locked dependencies) | 575 OK, 68 skipped (PostgreSQL lab suites) |
| `mw-db-ci -Group migrations` | Exit 0: head 109, statement batch incl. `Test-AccessMatrix.sql` (V109 end state, `pwa_row_changes` and default privileges unchanged) and `Test-MonitoringOpsHealth.sql`, concurrency suites, checksum tampering rejected |
| Chat schema digest test with a lab at head 109 | 4/4 |
| `npm test`, `npm run lint` | 871 pass, 0 fail, 1 skipped; lint exit 0 (one earlier run failed the unrelated, pre-existing timing race in `tests/unit/sw-notification-click.test.mjs`, suggested as a separate task) |
| PROD ACL read (Forge, read-only) | The agent's SELECT on the five tables is granted by each table's owner, so V109 revokes it; DEV has no such grant (V109 is a no-op there) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, documents as written) |
| Pull request `Development checks` and `Database migrations` | Pending |
| Chase (review, plus a PROD-shaped lab: SET-only runner revokes all five, a missing owner membership fails the preflight, a non-owner grantor fails the self-check and rolls back) | No blocking findings |
| DEV and PROD chat smoke; V109 readback; VM `/ready` | Pending |

## Not run
Wide browser suite (no UI change). The live steps are recorded in the promotion record.

## Recovery
Git baseline `1154d7c1`. Chat: restore the previous chat image (DEV `chat_image`, PROD `runtime_image_overrides["chat"]`). V109: re-grant the five SELECTs to `mw_integration_agent` from the before-ACL snapshot (additive), or restore the PROD promotion backup. VM: `deploy-runtime.py rollback` to the freeze directory; the three keys were inert, so rolling back changes nothing functional.

## Open questions
None for R094. The R095 items above need an owner decision only if wanted.

## Remaining work
PR CI and Chase; DEV deploys (chat, V109, VM); then PROD under the owner's instruction (chat, V109 with a verified backup and owner window, VM deploy); fill the Promotion record; close R094 (tracker, tag).
