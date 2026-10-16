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
- **AGT-STATE-01** (`state.py`; `docs/POSTGRESQL_OPERATIONS.md`): no `state_change` audit rows when the statement changed zero rows. Retention is a monthly job design only (GCS export, then delete rows older than 12 months as the owner role). It is not installed and was not run against production `mw_agent`. The bucket is a proposal.
- **AGT-STATE-02** (`state.py`): a `readonly` journal rejects non-SELECT statements and uses `SET TRANSACTION READ ONLY`.
- **AGT-STATE-03**: skipped, see Open questions.
- **AGT-STATE-04** (`state.py`): connection timeouts are 15 s statement, 3 s lock, 30 s idle-in-transaction, set from `state.parameters`.
- **AGT-SEND-03** (`receipt_api.py`, `review_cycle.py`, `audit.py`; `docs/PARTNER_REVIEW.md`): token fetch failure, HTTP 401 and HTTP 403 are "not sent". The review returns to APPROVED, `payment_id` is cleared, the same `requestId` is reused, the audit operation is FAILED and `detail` is untouched. The linked receipt job's `retry_after` holds the next attempt 15 minutes later, so a persistent 401/403 retries every 15 minutes, not every cycle. Everything later stays UNKNOWN.
- **AGT-WEBHOOK-03**: stopped, see Open questions. Tunnel Terraform is unchanged.
- **AGT-WEBHOOK-05** (`server.py`): a non-numeric length gives 400, a disabled receiver gives 503 per request without a journal write, a non-object body gives 400 after the signature check.
- **AGT-HOST-01** (`docs/OPERATIONS.md`): log access route recorded; host command prepared below.
- **AGT-HOST-02**: no change. The Graph refresh-token write path is narrowed when `graph_email.py` is next touched.
- **AGT-HOST-03** (`systemd/mw-cloudflared-instagram.service`, `tests/test_systemd_units.py`): duplicate `ProtectHome=true` removed; `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK` added (cloudflared needs `AF_NETLINK` for interface enumeration). The deploy helper does not install this unit.
- **ALL-ARCH-02** (`config.py`, `conversation_dml.py`, `outbox.py`, `cash_statement.py`, `config.example.json`, `scripts/configure-reviewer-dml.py`; `docs/REVIEWER_DML.md`): `database_name` is configurable and the DEV pair is `loan_manager_dev` with `mw_reviewer_dml_dev`. The DEV role is not created. The DEV target is unusable until a W4 migration relaxes the V33 `session_user` checks.
- **ALL-ARCH-03** (host side; `config.py`, `state.py`, `outbox.py`, `cash_statement.py`, `systemd/cloud-sql-auth-proxy.service.d/iam-listener.conf` new; `docs/POSTGRESQL_OPERATIONS.md`, `docs/OPERATIONS.md`): new keys `database_auth`, `agent_database_auth` (`password` or `iam`), `database_iam_user`, `iam_database_port` (5433). With `iam` each connection runs `SET ROLE`. `mw_reviewer_dml` and `mw_receipt_projector` keep password files on 5432 until W4. Defaults are `password`, so production behaviour is unchanged.
- **ALL-STD-01/03** (Python side): date and time handling goes through `business_time.py`; request-id derivation goes through `http.uuid_from_sha256` with the old salts, pinned by `tests/test_http.py`.
- **Docs**: `docs/OPERATIONS.md` (prepared host change, log access route, restore rehearsal section), `docs/POSTGRESQL_OPERATIONS.md`, `docs/PARTNER_REVIEW.md`, `docs/REVIEWER_DML.md` and the five docs named under AGT-QUALITY-05. `SERVICE_CATALOGUE.md` and `service-catalogue.json` are unchanged because no service fact changed.

## Checks

| Check | Result |
| --- | --- |
| Unit suite (`python -m unittest discover -s tests`) | 455 tests OK, 49 skipped (baseline 409 OK, 44 skipped) |
| Lab suites on PostgreSQL 18 via `tests/lab/setup.sh` | 61 tests OK |
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

None on this branch. The ALL-INFRA-04 restore-to-new-VM rehearsal ran under the ops branch (see the ops note); its procedure and result are recorded in `docs/OPERATIONS.md`.

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

4. **AGT-WEBHOOK-03 tunnel path** (owner picks a variant; Terraform root `infrastructure/ecosystem-tunnels`, `owned.tf`, `hooks.mw-credit.com` entry, `path = null` today). The GCP uptime check `mw-webhook-external-health-ySLl0784KgI` calls `GET /health` and expects 200 and the text `mw-instagram-webhook`.
   - **Variant 1**: `path = "^/instagram$"`. First re-point the uptime check to `GET /instagram`, status 403, content `Forbidden` (Terraform if ops has imported it, otherwise `gcloud monitoring uptime update mw-webhook-external-health-ySLl0784KgI --project clever-oasis-508610-n7 --path=/instagram --status-codes=403 --matcher-content=Forbidden --matcher-type=contains-string`). Or retire the check with `gcloud monitoring uptime delete` and update `Resource_Monitoring.md` and Grafana card 51. Re-pointing is recommended.
   - **Variant 2**: `path = "^/(instagram|health)$"`. No monitoring change; `/health` stays public.
   - Plan and apply: `terraform fmt -check && terraform init -lockfile=readonly && terraform validate`, then `terraform plan -out=...`. Expect 0 add, 1 change, 0 destroy, only `config.ingress[0].path`. Confirm `warp-routing` is not touched. Apply, then read back `/ready` gives 404, `/instagram` gives 403, `/health` gives 404 (variant 1) or 200 (variant 2), and `terraform plan -detailed-exitcode` gives 0. The token comes from Secret Manager and is never printed.
   - Rollback: set `path = null`, plan and apply; for variant 1 also restore the uptime check.

5. **DB-ACCESS-01 PROD** (reviewer DELETE): the PROD REVOKE and NOLOGIN statements are prepared in the ops note and wait for a separate go; see Open questions.

## Recovery

`git revert` of the branch commits restores the previous code and docs. The host and the tunnel were not changed, so no host recovery is needed. Deleted scripts remain in Git history.

## Open questions

1. **AGT-WEBHOOK-03 variant.** `^/instagram$` would make the public `/health` uptime check fail. Choose Variant 1 (re-point or retire the check) or Variant 2 (also allow `/health`).
2. **AGT-STATE-03.** A bounded reply scan would make hold replies older than the window unreachable, and a 7-day window is not authorized. A safe variant (a processed high-water mark) needs the state adapter to expose `partner_review_replies` and `partner_notices` to the ingress journal. That is a W4 adapter change.
3. **Reviewer DELETE in PROD.** DB-ACCESS-01 revokes DELETE for `mw_reviewer_dml`. Decide before the PROD go whether to retire `reviewer_delete_enabled` and the DELETE catalogue entries.
4. **ALL-ARCH-03 password roles.** `mw_reviewer_dml` and `mw_receipt_projector` keep password files and port 5432 until a W4 migration relaxes the V33/V49/V50 `session_user` checks. The host therefore keeps two password files after the change.
5. **Audit retention bucket.** The GCS bucket for the monthly export is a proposal; the owner confirms it before the job is written.

## Remaining work

- Owner go for the agent deploy, then host steps 1 to 3 above and the next package install.
- Owner choice of the tunnel variant, then the plan and apply.
- W4 migration for the `session_user` checks (DEV reviewer DML, receipt projector on IAM).
- State adapter change for AGT-STATE-03.
- Write and install the audit retention job after the bucket is confirmed.
- Narrow the Graph refresh-token write path when `graph_email.py` is next touched (AGT-HOST-02).
