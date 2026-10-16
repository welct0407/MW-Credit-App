# W3 agent — quality, state, send safety and host preparation — 2026-10-16

## Purpose

Fix the R063 Wave 3 agent findings in code and tests, bring the agent documents up to date, and prepare (not apply) the Debian host and tunnel changes for a later owner go. Branch `claude/review-w3-agent`, based on `main` 3678eb6. Nothing here was deployed.

## Changes

- **AGT-QUALITY-01** (`http.py` new, `business_time.py` new, `config.py`, `receipt_api.py`, `graph_email.py`, `statement_delivery.py`, `instagram.py`, `conversation_api.py`, `receipt_storage.py`, `cash_statement.py`, `receipt_rules.py`, `receipt_audit.py`): one `NoRedirect` handler, one metadata token helper, one UUID-from-SHA-256 builder, one Bangkok time module and one cutoff helper (`aware_cutoff`, `cutoff_ts`, `load_controls`) replace the copies. The Instagram opener now refuses redirects, so the bearer header cannot follow one. Request-id salts are unchanged.
- **AGT-QUALITY-02** (`pyproject.toml`, `requirements.lock` new, `scripts/install-instagram-runtime.sh`, `scripts/install-layout.sh`): Python floor 3.13, hash-pinned `requirements.lock` (uv) used by the install scripts, ruff config (E4, E9, F, B, UP; B905 ignored). `ruff check integration-agent` is clean.
- **AGT-QUALITY-03** (`scripts/backup-agent-database.py`, `scripts/configure-reviewer-dml.py`): no workstation path or fixed IP; the secret path comes only from `--secret-file`; `--environment dev|prod` picks the database and role.
- **AGT-QUALITY-04** (`cash_statement.py`, `review_cycle.py`): `read_query` binds psql variables (`-v`, `:'name'`) instead of building a quoted literal.
- **AGT-QUALITY-05** (21 scripts deleted; `scripts/deploy-runtime.py` keeps the one deploy helper with `deploy-shared-receipt-api.py` as its engine; `tests/test_deploy_native_conversations.py` deleted): the one-off activation, cutover, provision and verify scripts are gone. Docs that named them were updated: `docs/CASH_STATEMENT.md`, `CONVERSATION_POLL.md`, `PARTNER_REVIEW.md`, `POSTGRESQL_OPERATIONS.md`, `RECEIPTS.md`, `RECEIPT_EVIDENCE.md`, `REVIEWER_DML.md`.
- **AGT-TEST-01** (`tests/lab/setup.sh`, `tests/lab/README.md`): one script builds the disposable PostgreSQL 18 lab for the lab suites. The workflow job is written by ops.
- **AGT-TEST-02** (`tests/test_postgres_dml_audit.py`): the privilege test opens `READ WRITE` first, so it proves the privilege and not the read-only default.
- **AGT-TEST-03** (new `tests/test_codex_conversation.py`, `test_state_migration.py`, `test_state_migration_postgres.py`, `test_statement_snapshot.py`, `test_receipt_reconsider.py`, `test_receipt_master.py`, `test_http.py`, `test_operator_scripts.py`): the previously untested modules now have tests.
- **AGT-TEST-05** (`tests/test_service_catalogue.py` new): asserts that the Markdown table and the JSON catalogue list the same services and the same enabled state.
- **AGT-STATE-01** (`state.py`; `docs/POSTGRESQL_OPERATIONS.md`): no `state_change` audit rows when the statement changed zero rows. Retention is a monthly job design only (GCS export, then delete rows older than 12 months as the owner role). It is not installed and was not run against production `mw_agent`. Export target confirmed by the owner: `gs://mw-credit-operator-private-737787224638/agent-audit-archive/`.
- **Reviewer DELETE retired** (owner decision, 16 October; `config.py`, `conversation_dml.py`, `conversation_tools.py`, `partner_conversation.py`, `scripts/configure-reviewer-dml.py`, `database/setup/business-grants.sql`; `SERVICE_CATALOGUE.md`, `docs/REVIEWER_DML.md`, `docs/POSTGRESQL_OPERATIONS.md`): `reviewer_delete_enabled` is retired and a configured `true` is refused (`reviewer DELETE is retired; reviewer_delete_enabled must be false or absent`); the plan parser refuses any DELETE step with `REVIEWER_DELETE_RETIRED` before a connection; the catalogue lists only INSERT/UPDATE; the provisioning script and grants file grant no DELETE on the eight source tables (Cash Ledger keeps DELETE for the `cash_source_changed` trigger). Tests: `test_config.test_reviewer_delete_is_retired`, `test_conversation_dml.test_delete_steps_are_refused_before_any_database_call`, `test_operator_scripts` grant list, lab `test_postgres_dml_audit.test_delete_plan_is_refused_before_any_connection_and_role_has_no_delete` (also asserts the lab role has no DELETE on the eight tables). The journaled native command-API Delete in `conversation_write.py` is a different path and keeps working as before behind its own key `native_delete_enabled` (default false; requires the PostgreSQL backend and `conversation_writes_enabled`, exactly the gate the shared switch had; refusal code `NATIVE_DELETE_DISABLED`; `cli.py check` reports `native_delete`). Tests: `test_partner_conversation.test_native_delete_has_its_own_switch`, `test_config.test_reviewer_delete_is_retired`. `service-catalogue.json` has no text fields, so only the Markdown rows changed; revision 27 is unchanged.
- **AGT-STATE-02** (`state.py`): a `readonly` journal rejects non-SELECT statements and uses `SET TRANSACTION READ ONLY`.
- **AGT-STATE-03**: no change; the owner accepted the current reply scan as is and folded the adapter change into W4.
- **AGT-STATE-04** (`state.py`): connection timeouts are 15 s statement, 3 s lock, 30 s idle-in-transaction, set from `state.parameters`.
- **AGT-SEND-03** (`receipt_api.py`, `review_cycle.py`, `audit.py`; `docs/PARTNER_REVIEW.md`): token fetch failure, HTTP 401 and HTTP 403 are "not sent". The review returns to APPROVED, `payment_id` is cleared, the same `requestId` is reused, the audit operation is FAILED and `detail` is untouched. The linked receipt job's `retry_after` holds the next attempt 15 minutes later, so a persistent 401/403 retries every 15 minutes, not every cycle. Everything later stays UNKNOWN.
- **AGT-WEBHOOK-03**: done with Variant 1 (owner decision, 16 October). `infrastructure/ecosystem-tunnels/owned.tf`: the `hooks.mw-credit.com` ingress rule has `path = "^/instagram$"`. The ops branch first re-pointed the uptime check to `/instagram` (403, `Forbidden`).
- **AGT-WEBHOOK-05** (`server.py`): a non-numeric length gives 400, a disabled receiver gives 503 per request without a journal write, a non-object body gives 400 after the signature check.
- **AGT-HOST-01** (`docs/OPERATIONS.md`): log access route recorded; host command prepared below.
- **AGT-HOST-02**: no change. The Graph refresh-token write path is narrowed when `graph_email.py` is next touched.
- **AGT-HOST-03** (`systemd/mw-cloudflared-instagram.service`, `tests/test_systemd_units.py`): duplicate `ProtectHome=true` removed; `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK` added (cloudflared needs `AF_NETLINK` for interface enumeration). The deploy helper does not install this unit.
- **ALL-ARCH-02** (`config.py`, `conversation_dml.py`, `outbox.py`, `cash_statement.py`, `config.example.json`, `scripts/configure-reviewer-dml.py`; `docs/REVIEWER_DML.md`): `database_name` is configurable and the DEV pair is `loan_manager_dev` with `mw_reviewer_dml_dev`. The DEV role is not created. The DEV target is unusable until a W4 migration relaxes the V33 `session_user` checks.
- **ALL-ARCH-03** (host side; `config.py`, `state.py`, `outbox.py`, `cash_statement.py`, `systemd/cloud-sql-auth-proxy.service.d/iam-listener.conf` new; `docs/POSTGRESQL_OPERATIONS.md`, `docs/OPERATIONS.md`): new keys `database_auth`, `agent_database_auth` (`password` or `iam`), `database_iam_user`, `iam_database_port` (5433). With `iam` each connection runs `SET ROLE`. `mw_reviewer_dml` and `mw_receipt_projector` keep password files on 5432 until W4. Defaults are `password`, so production behaviour is unchanged.
- **ALL-STD-01/03** (Python side): date and time handling goes through `business_time.py`; request-id derivation goes through `http.uuid_from_sha256` with the old salts, pinned by `tests/test_http.py`.
- **Docs**: `docs/OPERATIONS.md` (prepared host change, log access route, restore rehearsal section), `docs/POSTGRESQL_OPERATIONS.md`, `docs/PARTNER_REVIEW.md`, `docs/REVIEWER_DML.md` and the five docs named under AGT-QUALITY-05. `SERVICE_CATALOGUE.md` rows `reviewer_database_dml` and `operational_data_api` record the DELETE retirement; `service-catalogue.json` is unchanged.

## Owner decisions (16 October 2026)

- **AGT-WEBHOOK-03**: Variant 1 applied (tunnel path `^/instagram$`, uptime check re-pointed to GET `/instagram` expecting 403); see Live changes applied.
- **Reviewer DELETE retired**: ops executed the PROD `REVOKE DELETE` from `mw_reviewer_dml` on the eight source tables (Borrowers, Business Expenses, Cash Pool Contributions, Charges, Loans, Payments, Repayments, Settlements); DELETE on Cash Ledger is kept only for the `cash_source_changed` trigger; DEV has no DELETE at all. Code, catalogue and docs changed as listed above.
- **AGT-STATE-03**: accepted as is; the adapter change is W4 work.
- **ALL-ARCH-03**: `mw_reviewer_dml` and `mw_receipt_projector` keep their password files until W4 (accepted).
- **AGT-STATE-01 retention**: export bucket `mw-credit-operator-private-737787224638`, prefix `agent-audit-archive/`; the job is still to be written.

## Checks

| Check | Result |
| --- | --- |
| Unit suite (`python -m unittest discover -s tests`) | 458 tests OK, 50 skipped after the DELETE retirement (baseline 409 OK, 44 skipped) |
| Lab suites on PostgreSQL 18 via `tests/lab/setup.sh` | 63 tests OK after the DELETE retirement (grants file without the source-table DELETE) |
| `ruff check integration-agent` | clean |
| `tests.test_service_catalogue` after doc edits | 1 test OK |
| Markdown relative-link check of edited docs | 9 files, 0 broken links or anchors |
| Independent Testing agent run (Agent C) | pass: unit 454 OK / 49 skips, lab 61 OK, ruff clean, SEND-03/STATE-01/WEBHOOK-05 tests fail on the old code, lockfile installs with `--require-hashes` on Python 3.13; the 15-minute retry was added after this run and its test fails without the change |

## Not run

| Item | Reason |
| --- | --- |
| Debian deploy (`deploy-runtime.py`) | no owner go; no host writes in W3 |
| Live tunnel change (Terraform apply) | stopped on open question |
| Host commands below | prepared only |

## Live changes applied

| What | Command | Readback |
| --- | --- | --- |
| AGT-WEBHOOK-03 tunnel path, Variant 1 (16 October 2026, 08:38:45 UTC / 15:38 Bangkok) | `terraform -chdir=infrastructure/ecosystem-tunnels plan -out=…` then `apply` of that saved plan. The Cloudflare token came from Secret Manager `mw-credit-ops-cloudflare-api-token` into the command environment only and was never printed. | Plan: 0 to add, 1 to change, 0 to destroy. The only change was `config.ingress[0].path` null → `^/instagram$`; `warp-routing` was not touched. Re-plan `-detailed-exitcode` = 0. `https://hooks.mw-credit.com/instagram` 403, `/health` 404, `/ready` 404; `https://charts.mw-credit.com/` 200 (unchanged). The uptime check (now `/instagram`, 403, `Forbidden`) passes from Singapore and Oregon. |

The ALL-INFRA-04 restore-to-new-VM rehearsal ran under the ops branch (see the ops note); its procedure and result are recorded in `docs/OPERATIONS.md`.

## Prepared for a later go

Host commands run on the VM `mw-integration-agent` through `mw-debian-ssh '<command>'`. Never print secret values. Each step lists its verification and rollback.

1. **AGT-HOST-03 cloudflared unit** (install by hand; the helper does not install it):

   ```bash
   cd /opt/mw-integration-agent-src
   sudo cp -p /etc/systemd/system/mw-cloudflared-instagram.service /root/mw-cloudflared-instagram.service.pre-w3
   sudo install -o root -g root -m 0644 integration-agent/systemd/mw-cloudflared-instagram.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemd-analyze verify /etc/systemd/system/mw-cloudflared-instagram.service
   sudo systemctl restart mw-cloudflared-instagram.service
   ```

   Expect `active`, four `Registered tunnel connection` lines and no `address family not supported`. Rollback: reinstall the `.pre-w3` copy, `daemon-reload`, restart.

2. **AGT-HOST-01 journal access**: `sudo usermod -aG systemd-journal codex-cloud`, then in a new session `mw-debian-ssh 'id -nG; journalctl -u mw-instagram-webhook.service -n 1 --no-pager'`. Rollback: `sudo gpasswd -d codex-cloud systemd-journal`. Then record the journald retention in `docs/OPERATIONS.md`.

3. **ALL-ARCH-03 IAM listener**, in this order:
   1. Preconditions: ops has applied the IAM database user `mw-integration-agent@clever-oasis-508610-n7.iam` and `roles/cloudsql.instanceUser` for the VM service account (Terraform, additive); the VM scope allows `cloud-platform`; the deployed package knows the `*_auth` keys.
   2. Grants as `postgres` (instance-wide role memberships):

      ```sql
      ALTER ROLE "mw-integration-agent@clever-oasis-508610-n7.iam" NOINHERIT;
      GRANT mw_agent_worker, mw_agent_relay, mw_integration_agent
        TO "mw-integration-agent@clever-oasis-508610-n7.iam" WITH INHERIT FALSE, SET TRUE;
      GRANT CONNECT ON DATABASE mw_agent TO "mw-integration-agent@clever-oasis-508610-n7.iam";
      -- only if has_database_privilege(..., 'loan_manager_prod', 'CONNECT') is false:
      GRANT CONNECT ON DATABASE loan_manager_prod TO "mw-integration-agent@clever-oasis-508610-n7.iam";
      ```

   3. `deploy-runtime.py freeze`, then install the proxy drop-in:

      ```bash
      sudo install -d -m 0755 /etc/systemd/system/cloud-sql-auth-proxy.service.d
      sudo install -o root -g root -m 0644 integration-agent/systemd/cloud-sql-auth-proxy.service.d/iam-listener.conf /etc/systemd/system/cloud-sql-auth-proxy.service.d/
      sudo systemctl daemon-reload && sudo systemd-analyze verify /etc/systemd/system/cloud-sql-auth-proxy.service
      sudo systemctl restart cloud-sql-auth-proxy.service
      ss -ltnp | grep -E '127.0.0.1:(5432|5433)'
      ```

   4. Prove IAM login on 5433 before any config change:
      `sudo -u mwagent psql -w "host=127.0.0.1 port=5433 user=mw-integration-agent@clever-oasis-508610-n7.iam dbname=mw_agent sslmode=disable" -Atc "SET ROLE mw_agent_worker; SELECT current_user, session_user"`.
   5. Back up the config (`/root/config.json.pre-arch03`), then set `agent_database_auth=iam`, `database_auth=iam`, `database_iam_user` and `iam_database_port=5433`. Leave `database_port` and `agent_database_port` at 5432: reviewer DML and receipt projection keep their password roles on 5432. Run `mw-integration-agent check` on the new file before installing it (0640 root:mwagent).
   6. `deploy-runtime.py activate`; check `/ready` and `pg_stat_activity` shows the IAM user.
   7. After one clean cycle of every timer, including the 00:15 statement: shred the three unused password files (paths from the backed-up config), and only after a full day with no sessions run `ALTER ROLE ... NOLOGIN` for `mw_agent_worker`, `mw_agent_relay`, `mw_integration_agent` (instance-wide; confirm no other consumer first). Keep an offline copy of the files for a week.
   8. Rollback: restore the config backup and restart the receiver; remove the drop-in, `daemon-reload`, restart the proxy; before step 7 the password roles still log in.

4. **AGT-WEBHOOK-03 tunnel path**: applied on 16 October with Variant 1; see Live changes applied. Rollback: set `path = null`, plan and apply, then restore the uptime check to `/health`, 200, `mw-instagram-webhook` (ops root `infrastructure/ecosystem-debian`).

5. **DB-ACCESS-01 PROD** (reviewer DELETE): executed by ops on 16 October (REVOKE DELETE on the eight source tables, no NOLOGIN); see the ops note. With the next agent deploy, before `mw-integration-agent check`, edit `/etc/mw-integration-agent/config.json`: replace the key `reviewer_delete_enabled` with `native_delete_enabled` set to the SAME value the host has today (so native API Delete behaviour is unchanged), then run `sudo -u mwagent mw-integration-agent check --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json` and expect `"native_delete"` to show that value. The new package refuses a configured `reviewer_delete_enabled=true`.

## Recovery

`git revert` of the branch commits restores the previous code and docs. The host was not changed. Tunnel recovery: set `path = null` in `infrastructure/ecosystem-tunnels/owned.tf`, plan and apply, and restore the uptime check to `/health`. Deleted scripts remain in Git history.

## Open questions

None.

## Remaining work

- Owner go for the agent deploy, then host steps 1 to 3 and 5 above and the next package install.
- W4 migration for the `session_user` checks (DEV reviewer DML, receipt projector on IAM); `mw_reviewer_dml` and `mw_receipt_projector` keep their two password files until then.
- W4 state adapter change for AGT-STATE-03 (processed high-water mark over `partner_review_replies`/`partner_notices`).
- Write and install the audit retention job against `gs://mw-credit-operator-private-737787224638/agent-audit-archive/`.
- Narrow the Graph refresh-token write path when `graph_email.py` is next touched (AGT-HOST-02).
