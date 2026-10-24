# Change notes — R094 follow-ups from R091 and R093, 24 October 2026

## Purpose
Close the three items left open by R091 and R093: the chat image still carries the old schema digest, three dead configuration keys remain on the VM, and the integration agent still holds SELECT on five notification, push and jobs tables. Owner instruction of 24 October 2026: "Proceed with R094 till it's in production". Designed by Archie (A); Byte (B) implements, Forge (F) deploys, Chase (C) checks, Dewey (D) records. Echo (E) is not applicable: no UI change.

## Changes
- **Chat redeploy** (chat service only, DEV then PROD, from the R094 `main` commit): the image carries the schema digest asset at migration head 109 (after V109). The prompt digest changes, so each thread starts one new history epoch on its next turn (designed). Method as R092: Cloud Build, Terraform plan 0/1/0, `chat_image` in DEV and `runtime_image_overrides["chat"]` in PROD.
- **Retire three VM keys** (`integration-agent/`, Byte): `conversation_schema_file`, `conversation_schema_sha256` and `partner_conversation_backup` join the agent's `RETIRED_KEYS`, and the deploy's `prepare()` drops retired keys in every mode. The standard VM deploy then leaves configuration at 80 keys (from 83); the service catalogue stays at revision 32. Details in the agent change note.
- **V109** (`database/migrations/`, Byte): revokes `mw_integration_agent` SELECT on `pwa_notification_events`, `pwa_notification_preferences`, `pwa_notification_deliveries`, `pwa_push_subscriptions` and `pwa_job_runs`, inherited from the pre-R085 PROD default privilege. Nothing depends on it: the collector reads the `SECURITY DEFINER` function `monitoring.pwa_ops_health_v1`. Revoke only (no table, column or function change); DEV is a no-op. `Test-AccessMatrix.sql` extended.
- **Schema digest** (`services/chat/assets/schema-digest.json`): rebuilt at migration 109.
- **Documents** (Dewey): `database/README.md` (V109 applied), `integration-agent/docs/POSTGRESQL_OPERATIONS.md` (the agent's SELECT revoked by V109), `integration-agent/Change Logs/CHANGE_NOTES_R094_RETIRED_CONFIG_KEYS_2026-10-24.md` (deploy record), the five `public.pwa_*` relation records of the Data Dictionary (the ACL no longer lists `mw_integration_agent`; `dictionary.py validate` reports no errors), `project/Documents/Development_Changes.md`, `project/Documents/Environment_Inventory.md` (pins), this note.
- **Open for R095, only if the owner wants it**: the likely inherited agent SELECT on `pwa_row_changes` and the PROD default privilege itself. Not in this scope.

## Checks
| Command | Result |
| --- | --- |
| Byte's unit, agent and database tests | Pass as reported by Byte before the merge (agent: `ruff` clean, 575 tests OK, 68 skipped in the agent note) |
| Pull request `Development checks` (PR #143) | Pass, run 40086627611 |
| Database migrations (PR #143) | Pass, run 40086611764 |
| `python3 project/scripts/dictionary/dictionary.py validate` | No errors (438 documents) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, closure documents) |
| Chase (review, plus a PROD-shaped lab: SET-only runner revokes all five, a missing owner membership fails the preflight, a non-owner grantor fails the self-check and rolls back) | No blocking findings |
| DEV and PROD chat smoke; V109 ACL before and after; VM `/ready` | Pass, see the Promotion record and the Environment inventory |

## Not run
The agent PostgreSQL lab suite (no agent migration or state change). The `pwa_row_changes` and default-privilege questions (out of scope).

## Recovery
Git baseline `1154d7c1`. Chat: restore the previous chat image (DEV `chat_image`, PROD `runtime_image_overrides["chat"]`; previous revisions in the inventory). V109: re-grant the five SELECTs to `mw_integration_agent` from the before-ACL snapshot (additive), or restore the PROD promotion backup `prod-promotion-c5249edb3d49489ca2156abe00d1b3a7` at V108. VM: `deploy-runtime.py rollback` to the freeze directory `runtime-20261024T105751879717Z`; the three keys were inert, so rolling back changes nothing functional.

## Open questions
None for R094. The R095 items above need an owner decision only if wanted.

## Remaining work
None for R094. R095 candidates, the owner's call: the inherited agent SELECT on `pwa_row_changes` and the PROD default privilege itself; `mw-receipt-summary` failed once at 11:06:42Z with `IndeterminateDatatype` (once before on 23 October, clean since); a stale `integration-agent/build/` directory on the VM probably makes `pip` copy the 16 removed conversation modules back.

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md), revision 14 October 2026. Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md).

### Continue here
- Outcome/scope and affected components: R094 is Released to DEV, the VM and PROD (24 October 2026): the chat service redeployed at the schema digest of migration 109, the three dead VM keys retired, and V109 (revoke of the agent's leftover SELECT on five tables). No Hosting, reader, command, notify or jobs change.
- State and next action or actual blocker: applied and verified. Tag `R094` on `2032bc3d`; next: the R095 candidates in Remaining work.
- Source/artifact/configuration pins; runner manifest link: source `2032bc3d` (PR #143; baseline R093 `1154d7c1`). PROD manifest `release-r094-prod.json`, backup, images, plans and ACL snapshots are in the Environment inventory.
- Existing owner authority and any explicit hands-on checkpoint: the owner's instruction of 24 October 2026, "Proceed with R094 till it's in production". It covers the PROD V109 with its backup and standard owner windows, the chat deploys and the VM deploy. No forced notification, job or financial write.
- Previous deployed baseline and recovery: PROD at V108, chat on `80f3ebdc…`, VM at `1d673a90` with 83 configuration keys; rollback in Recovery above.
- Scope freeze/next-number handoff: R094 Frozen and R095 opened with the counter at R096 in the [tracker](../project/Documents/Release_Tracker.md); R094 is now Released there.
- Checks: PR #143 `Development checks` run 40086627611 and `Database migrations` run 40086611764, both green; the rest in Checks above.

### Promotion
| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | Owner instruction above; targets verified by Forge; previous revisions, VM freeze directory and ACL snapshot captured |
| Required affected checks passed or explicit owner deferral recorded | CI runs above; no deferral |
| Tested package captured; tracker freeze/handoff published | `2032bc3d` merged to `main`; DEV and PROD chat images built from it; PROD manifest sha256 `d271d997…3d77` |
| Changed components deployed in dependency order | DEV V109 10:45:26Z; DEV chat 10:54:04Z to 10:54:41Z (plan 0/1/0); VM 10:57:51Z to 10:58:13Z; PROD backup and V109 11:02:19Z to 11:03:34Z; PROD chat 11:12:35Z to 11:13:13Z (plan 0/1/0); re-plans no changes |
| Version/environment and affected PROD smoke verified once | V109 readback 109 rows and ACL after: only the five agent entries gone; VM `/ready` true, 80 keys, `code_version` `2032bc3d`; chat `/health` and 401 in DEV and PROD; collector pwa_notify and pwa_jobs normal, all 19 components 1 at 11:09Z to 11:13Z |
| Actual outcome/changed owning facts recorded; intended publication and final tag verified | Inventory, tracker, Development Changes, `database/README.md`, Data Dictionary ACLs and this note; tag `R094` on `2032bc3d` (Release tag workflow, 24 October 2026) |

SQL: V109 was the only pending migration from V108, applied under the release manifest by the guarded runner. Infrastructure: two reviewed 0/1/0 plans with actual applies. Notification and jobs: unchanged; nothing forced.

### Deviations and limitations
1. DEV V109 needed an owner window on the chat, notify, jobs, changes and journal owners for the post-migrate reconcile, although V109 revokes nothing on DEV.
2. The VM deploy engine needed an `mw_agent` operator connection file that was absent on the VM; a temporary root-only file was created (password on stdin, never printed) and deleted afterwards.
3. The configuration key count: the agent note first said 84 to 81; the VM held 83 and ended at 80. All records say 83 to 80.
4. Observed, not caused by R094: the receipt summary failure and two transient collector blips (`audit_relay` 11:04:42Z, receipts 11:06:50Z), all components healthy afterwards; the stale `build/` directory.

### Close
- Outcome: applied and verified in DEV, on the VM and in PROD.
- Recovery reference: Continue here and the Recovery section above.
- Changed documents, if any: Environment inventory, Release Tracker, Development Changes, `database/README.md`, Data Dictionary (five ACLs), the agent change note, and links repointed for the pruning below.
- Published evidence/tag: tag `R094` on `2032bc3d` (Release tag workflow, 24 October 2026).
- Outstanding owner action, if any: the R095 candidates, only if wanted.

### Closure pruning (release workflow, 24 October 2026)
- Inbound links repointed first to the commit permalink of `2032bc3d` (the last commit where the target exists): `project/Documents/Development_Changes.md`, `Release_Tracker.md`, `Environment_Inventory.md`, `Solution_Design.md` and the agent's R091 change note.
- Change note deleted (R091 left the retention window of R094, R093 and R092): `Change Logs/CHANGE_NOTES_R091_IG_CONVERSATION_DECOMMISSION_2026-10-23.md`. The agent-side R091 note stays (agent change notes are not pruned).
- Development Changes: the R094, R093 and R091 follow-up rows are replaced by one R094 follow-up row.
- Evidence deleted: none (`npm run check:docs` reports no uncited evidence).
