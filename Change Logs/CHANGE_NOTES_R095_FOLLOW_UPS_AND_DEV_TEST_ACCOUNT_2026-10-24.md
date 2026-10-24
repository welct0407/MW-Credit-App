# Change notes — R095 follow-ups and the DEV test account, 24 October 2026

## Purpose
Take the four R094 candidates the owner approved ("proceed with the four candidates") and add a DEV-only test account for Claude Code. The four: the receipt summary failure with `IndeterminateDatatype` (the `partner_reviews` state update in `review_cycle.py`), the stale agent `build/` directory on the VM, the agent's inherited SELECT on `pwa_row_changes`, and the PROD default privilege that grants the agent SELECT on new tables. The test account: the owner's existing Google account `welct0407@gmail.com` (decision of 24 October 2026, replacing a new Workspace user; read-only check: it is not a Login Email of any Partner in PROD or DEV) whose refresh token sits in Secret Manager; a DEV Partner row `claude-dev-test`, role `Test`, Email NULL; Partner rights except settlements (the owner first said full rights, then "No settlement"); it must survive PROD to DEV refreshes. Designed by Archie (A); Byte (B) implements, Forge (F) deploys and owns the infrastructure, Chase (C) checks, Dewey (D) records. Echo (E) is not applicable: no UI change.

## Changes
- **Receipt cycle state update** (`integration-agent/src/mw_integration_agent/review_cycle.py`, Byte): root cause of the `mw-receipt-summary` failures, read from the Cloud SQL log (both identical, 2026-10-24 11:06:38Z and 2026-10-23 11:46:06Z on `mw_agent`): `could not determine data type of parameter $2` on the `partner_reviews` state update (`review_cycle.py:285`, `CASE WHEN ? IS NULL …` with a `None` note). Effect: the final POSTED update failed after a successful receipt submit; the next cycle (about 30 s later) settled the row to POSTED by status alone, with no resend (POSTED +1 each time, nothing left in POSTING). Byte casts that statement. The casts in `receipt_projection.py` (every parameter of `attach_payment_receipt_evidence` typed) are kept as hardening only; that was not the failing statement. Details in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R095_RECEIPT_CASTS_CLEAN_BUILD_2026-10-24.md).
- **Clean build before pip** (`integration-agent/scripts/deploy-shared-receipt-api.py`, Byte): the deploy removes `build/` and `src/*.egg-info` and refuses to continue if one remains. Same agent note.
- **V110** (`database/migrations/V110__revoke_agent_default_select.sql`, Byte): revokes `mw_integration_agent` SELECT on `pwa_row_changes` and postgres's `public` default `SELECT ON TABLES` for the agent. Existing grants stay, including the cash statement's reads (`"Partners"`, `"Cash Accounts"`, `"Borrowers"`, `cash_statement_account_effects`, `r008_cash_account_cutover`). The agent has no default privilege at all afterwards (PROD never had an EXECUTE default row for it). No-op on DEV. It must run inside a transaction (Flyway and `mw-db-ci` do). A later migration that creates a public relation the agent must read now needs an explicit grant. `Test-ProdDefaultPrivileges.sql`, `Test-MigrationsCloud.py`, `Test-AccessMatrix.sql` and `Test-StatementBatch.sql` follow the new state.
- **Schema digest** (`services/chat/assets/schema-digest.json`): rebuilt at migration 110. The chat prompt digest changes, so each thread starts one new history epoch after the next chat image redeploy.
- **Settlement guard** (`services/payment-command/store.mjs`, Byte): a Partner whose `Partner Role` is not A or B is refused every settlement operation (403). Tests: `tests/unit/settlement-partner-role.test.mjs`.
- **DEV test Partner** (`scripts/database/Ensure-DevTestPartner.sql`, `Test-DevTestPartner.sql`, Byte): idempotent, `loan_manager_dev` only, run as `postgres` with `-v login_email=welct0407@gmail.com`; the refresh runbook runs it after the compare. The `Partner Role` `Test` is also ignored by the A/B expense and settlement splits. Settlement reads stay visible to the test account (the owner asked about recording; reply pending). Self-promotion through `partner.update` to A would lock the account out, because the capability policy pins the role `Test`.
- **Token script** (`scripts/dev/claude-test-token.mjs`, Byte): exchanges the stored refresh token for a DEV ID token with the operator's credentials and prints no token. It writes a fresh 0600 file (symlinks refused), by default under `$MW_SCRATCH` or a per-run 0700 temp directory. Its check on the DEV web app protects against using the wrong web configuration; it does not make the token DEV-only. Tests: `tests/unit/claude-test-token.test.mjs`.
- **DEV secret container** (`infrastructure/dev/claude-test-session.tf`, Forge): the secret `mw-credit-app-dev-claude-test-session` (container only; versions and payload are the owner's, outside Terraform; `prevent_destroy`). - **DEV membership policy** (Forge): the DEV capability policy is the Secret Manager secret `mw-credit-app-dev-capability-policy`, version 1 pinned by the private DEV activation. R095 adds version 2 = version 1 plus the member `{partnerId claude-dev-test, loginEmail welct0407@gmail.com, partnerRole Test, capabilities read, command, receipt.read, receipt.write}`; `evidenceSha256` is unchanged (the pin is the secret version) and the activation's `capability_policy_version` goes 1 to 2. Expected DEV plan: 1 add (the session secret container), 3 change (the read, command and chat APIs move to policy v2). Order: `Ensure-DevTestPartner.sql` first, then policy v2. PROD is untouched. Rollback: the version back to 1.
- **Stored token.** The stored value is a Firebase refresh token for this app's project only: it grants no access to the Google account's mail or other Google services. PROD's identity check accepts it but PROD refuses it (no PROD policy member or Partner row); never add that email to PROD Partners or the PROD policy.
- **Shared Identity Platform project.** The user pool is shared with PROD, so the test user can sign in to PROD. PROD stays closed because there is no PROD policy member and no PROD Partner row for that user; the token script's DEV check is not what protects PROD. Never add either.
- **Documents** (Dewey): `database/README.md` (V110, the explicit-grant rule, the DEV test Partner), `project/Documents/Rules/Development_Refresh_Runbook.md` (step 7a with the one-time owner steps), `Development_Environment_Preparation.md`, `docs/Development.md` (how Claude Code gets a DEV token), `integration-agent/docs/OPERATIONS.md` (clean build), `integration-agent/docs/POSTGRESQL_OPERATIONS.md`, `project/Documents/Development_Changes.md`, `project/Documents/Environment_Inventory.md` (placeholders), the agent change note and this note.

## Checks
| Command | Result |
| --- | --- |
| `ruff check`, agent unit tests with the lock | Pass; 580 OK, 70 skipped (lab-only suites) |
| Agent PostgreSQL lab (CI suite list at V110) | 79 run, OK; the review-settlement regression reproduces the old 42P18 in all four cases and passes with the cast; the projection call passes with `None` key and `{}` |
| Disposable DB labs at V110: `Test-AccessMatrix`, `Test-MonitoringOpsHealth`, `Test-Chat`, `Test-DevTestPartner`; `test_prod_default_privileges.py` | Pass |
| `mw-db-ci -Group migrations` | Exit 0: head 110, statement batch, concurrency suites, `public-functions.sql` matches |
| Chat schema digest test at 110 | 4/4 |
| `npm test`, `npm run lint`, `npm run typecheck`; token script tests | 892 pass, 0 fail, 1 skipped; lint and typecheck exit 0; token script 14/14 |
| DEV Terraform (Forge): `fmt`, `validate`, `terraform test` | Pass, 28/28; plan 1/0/0 for the session secret container |
| Chase (security review: settlement guard covers every route, self-promotion locks out, ensure SQL refuses PROD, token never printed, V110 self-check, shared identity project) | No blocking findings; the token-file write was hardened (fresh 0600 file, symlinks refused) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, records as written) |
| Pull request `Development checks` and `Database migrations` (PR #146) | Pass: runs [40092340777](https://github.com/welct0407/MW-Credit-App/actions/runs/40092340777) and [40092323402](https://github.com/welct0407/MW-Credit-App/actions/runs/40092323402); merged as `e3d5bc2a` |
| DEV V110 (no-op), DEV images, DEV policy v2, VM readback, PROD V110 ACL before and after, PROD chat | Pass, see the Promotion record and the Environment inventory |
| Owner sign-in; token script obtains an ID token; a settlement call returns 403 | Pending (owner) |

## Not run
The owner's sign-in, the token secret version, the token-script smoke and the settlement 403 call (pending). The PROD command service was not moved: the settlement guard is a no-op there with A/B Partners only, so it stays on the R091 image.

## Recovery
Git baseline `5b43f0a3`. V110: re-grant `SELECT` on `pwa_row_changes` to `mw_integration_agent` and recreate postgres's `public` default `SELECT ON TABLES` for it from the before-ACL snapshot (additive), or restore the PROD promotion backup `prod-promotion-75f9fa13cfae44f3b9fb54a5a8b457b2` at V109. VM: `deploy-runtime.py rollback` to `runtime-20261024T121240259866Z`. DEV images: restore the previous DEV activation (revisions in the inventory). PROD chat: restore the rollback copy `production.activation.before-r095-1792840421095187.tfvars`, plan 0/1/0, apply, publish. DEV Partner row: delete `claude-dev-test` in DEV inside the ledger-owner window (DEV backup `dev-refresh-bfa0861bedf344608c9267c01f4cf0da` also exists). DEV policy: version back to 1, apply. Secret container: Terraform destroy needs `prevent_destroy` lifted; stored versions are the owner's.

## Open questions
None.

## Remaining work
The owner signs in once at https://dev-lm.mw-credit.com with `welct0407@gmail.com`, then adds the refresh token as a secret version (refresh runbook step 7a). Then the token-script smoke and a settlement call returning 403. Then the tag `R095` and the closure (tracker, pruning, final Checks).

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md), revision 14 October 2026. Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). This record stays open until the owner's sign-in and the token check are done; the tag waits for them.

### Continue here
- Outcome/scope and affected components: R095 is live in DEV, on the VM and in PROD (24 October 2026) except the owner's sign-in and the token check: the receipt cycle fix and clean build (VM), V110 (PROD revoke; DEV no-op), the chat schema digest at migration 110 (DEV and PROD chat), the settlement guard (DEV command service), the DEV test Partner, DEV policy v2 and the DEV secret container.
- State and next action or actual blocker: waiting for the owner's sign-in, the token secret version, the token-script smoke and the settlement 403 call.
- Source/artifact/configuration pins; runner manifest link: source `e3d5bc2a` (PR #146; baseline R094 `5b43f0a3`). PROD manifest `release-r095-prod.json`, backups, images, plans and ACL snapshots are in the Environment inventory.
- Existing owner authority and any explicit hands-on checkpoint: the owner's instruction of 24 October 2026, "proceed with the four candidates", and the DEV test account approval (the owner's own Google account, no settlements). PROD V110 ran under it with its backup. The sign-in is a hands-on step only the owner can do. No forced notification, job or financial write.
- Previous deployed baseline and recovery: PROD at V109, chat on `9cf477a2…`; VM at `2032bc3d`; DEV policy v1. Rollback in Recovery above.
- Scope freeze/next-number handoff: pending the tag and closure.
- Checks: see Checks above (gaps named).

### Promotion
| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | Owner instruction above; targets verified by Forge; rollback directories, backups and activation copies captured |
| Required affected checks passed or explicit owner deferral recorded | PR #146 merged; run ids to be supplied; no deferral |
| Tested package captured | `e3d5bc2a` merged; DEV and PROD chat images built from it; PROD manifest sha256 `b65ac05d…d684` |
| Changed components deployed in dependency order | VM 12:12:40Z to 12:12:49Z; DEV V110 12:14:12Z; DEV secret container 12:23:25Z; PROD backup and V110 12:25:44Z to 12:27:00Z; DEV images 12:27:47Z to 12:28:23Z (plan 0/2/0); PROD chat 12:30:02Z to 12:30:38Z (plan 0/1/0); DEV test Partner (ledger-owner window 12:36:20Z to 12:36:33Z); DEV policy v2 12:37:50Z to 12:38:27Z (plan 0/3/0) |
| Version/environment and affected smoke verified once | VM `/ready` `e3d5bc2a`, check ok, 80 keys, catalogue 32/16, collector 19 of 19 from 12:15Z, 46 clean receipt-summary runs and no 42P18 since; PROD V110 readback 110 rows and ACL before and after (two removals); DEV policy v2 smoke ok |
| Actual outcome/changed owning facts recorded; intended publication and final tag verified | Inventory, Development Changes, `database/README.md`, runbook and this note updated; tag `R095`: pending the owner's sign-in |

SQL: V110 was the only pending migration from V109 on PROD, applied under the release manifest by the guarded runner with no owner window. Infrastructure: reviewed plans per step with their actual applies. Notification and jobs: unchanged; nothing forced.

### Deviations and limitations
1. The first insert into `Partners` on DEV recalculates every Business Expense and resyncs the cash ledger (`expense_partner_changed` to `sync_cash_ledger`, ledger owner only), so `Ensure-DevTestPartner.sql` needed a `mw_ledger_owner_dev` owner window after a DEV backup `dev-refresh-bfa0861bedf344608c9267c01f4cf0da` (sha256 `766001f8…ac1d`, restore 37 tables). Before and after were identical for the expense split hash and sums, the cash ledger (428 rows, hash), four balances, daily analytics, cash account analytics and cash pool contributions; Partners 2 to 3 and `pwa_row_changes` 518 to 520. The runbook step now wraps the script in that window and verifies the amounts.
2. The PROD agent never had an EXECUTE-on-functions default privilege row; V110 left it with no default privilege at all. Earlier text saying the EXECUTE default was kept is corrected.
3. The PROD command service was not moved (the guard is a no-op with A/B Partners only).
4. The DEV test account sign-in, token and 403 check are pending the owner.

### Close
Pending the owner's sign-in and the token check; then outcome, tag `R095`, tracker release and pruning.
