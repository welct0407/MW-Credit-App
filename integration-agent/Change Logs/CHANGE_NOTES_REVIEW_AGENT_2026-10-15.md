# Independent review — Debian integration agent — 15 October 2026

Baseline 0995868. Scope: `integration-agent/` (source, scripts, systemd, database, tests), `.github/workflows/agent-tests.yml`, the Debian host `vm-mw-credit-agent` (read-only), the tunnel rule in `infrastructure/ecosystem-tunnels/owned.tf` and the host monitor source `project/scripts/monitoring/debian-health.py`. Checklist items 1–8 and 10 of the approved plan. Item 9 (documentation drift) belongs to the documentation worker and is not in this note.

Method: read `server.py`, `webhook.py`, `journal.py`, `state.py`, `state_migration.py`, `config.py`, `cli.py`, `audit.py`, `instagram.py`, `partner_notice.py`, `statement_delivery.py`, `graph_email.py`, `receipt_api.py`, `review_cycle.py` end to end, plus the relevant parts of `statement_run.py` and `receipt_run.py`. Read every deploy/activation/verify script that names the host checkout, all repository unit files, the CI workflow and the lab test fixtures. Ran the unit suite once. Built a disposable UTF8 PostgreSQL 18 cluster and ran the seven PostgreSQL-dependent suites once. Read the Debian host back over `mw-debian-ssh` with the commands listed below only. Compared installed module hashes with the baseline source and with every commit of the imported agent history.

Orchestrator: Claude Fable 5.1, medium effort (owner setting). An earlier Opus review of this group was re-verified, not copied.

Read-only. No source, DEV, Debian or PROD change. No host service was started, stopped or restarted. No secret value was read. No borrower data appears here. Tool limitation: the exact model ids in `Model_Work_Mapping.md` are not selectable in this session.

## Checks executed

| Check | Command | Result |
| --- | --- | --- |
| Agent unit suite | `cd integration-agent && <agent-venv>/bin/python -m unittest discover -s tests -v` | `Ran 353 tests in 2.672s`, `OK (skipped=42)`. 311 passed, 0 failed. |
| Skipped suites | same run, grouped | `test_conversation_dml` 14 (`disposable PostgreSQL fixture required`, env `MW_DML_TEST_DSN`); `test_postgres_state` 11 and `test_postgres_dml_audit` 6 (`isolated PostgreSQL 18 lab required`); `test_notice_acknowledgement` 6 (`private PostgreSQL lab required`); `test_operator_audit_postgres` 1, `test_operator_execution_postgres` 1, `test_receipt_audit_postgres` 1 (`isolated lab required`); all seven read env `MW_AGENT_LAB_MANIFEST` or `MW_DML_TEST_DSN`. `test_statement_image` 2 (`Debian Thai renderer required`). |
| Disposable lab build | as `postgres`: `initdb -D /tmp/mwpg-agent-state-lab-2/data --encoding=UTF8 --locale=C`, `pg_ctl … -o "-h 127.0.0.1 -p 15503" start`; `psql -f database/setup/bootstrap.sql` with `PGOPTIONS=-c mw_design.execution_approved=agent-postgresql-20260922-v1`; `state_migration.migrate()`; `ALTER ROLE mw_agent_{worker,relay,auditor} LOGIN`; `loan_manager_prod` created from a `pg_dump --schema-only` of the prepared scratch cluster (`localhost:15501`, V92, `agent_audit` present); `configure-reviewer-dml.configure()`; `business-grants.sql`; `CREATE DATABASE mw_dml_test_ci`; manifest `{"host":"127.0.0.1","port":15503,"root":"/tmp/mwpg-agent-state-lab-2"}` | `migrate()` first run applied `V1..V4`; second run applied `[]` (idempotent). 31 tables in `audit`/`runtime`/`migration`. `bootstrap.sql` and `business-grants.sql` ran without error. |
| PostgreSQL suites on the lab | `MW_AGENT_LAB_MANIFEST=… MW_DML_TEST_DSN="host=127.0.0.1 port=15503 user=postgres dbname=mw_dml_test_ci" python -m unittest -v tests.test_postgres_state tests.test_postgres_dml_audit tests.test_conversation_dml tests.test_notice_acknowledgement tests.test_operator_audit_postgres tests.test_operator_execution_postgres tests.test_receipt_audit_postgres` | `Ran 48 tests in 1.945s`, `FAILED (errors=1)`. 47 passed (40 previously skipped DB tests + 8 local tests in those files, 1 error). The error is `test_postgres_dml_audit…test_missing_marker_and_reviewer_schema_identity_changes_denied`: `psycopg.errors.ReadOnlySqlTransaction: cannot execute CREATE TABLE in a read-only transaction` (see AGT-TEST-02). Cluster stopped (`pg_ctl -m fast stop`) and its directory removed. |
| Effective session timeouts | lab, `psycopg.connect(user='mw_agent_worker', options='-c statement_timeout=30000 -c lock_timeout=5000')` then `SHOW` | `['30s', '5s', '30s']`; without `options`: `['15s', '3s']` (see AGT-STATE-04). |
| Vacuous path check | `Path('/nonexistent/src/mw_integration_agent').rglob('*.py')` then `all(...)` | `files [] all() True` |
| Catalogue Markdown vs JSON | small Python compare of `SERVICE_CATALOGUE.md` table rows vs `service-catalogue.json` keys | revision 27; `md-only []`, `json-only []` (aligned today, no test enforces it). |
| Untested modules | `grep -l` over `tests/*.py` for imports of `server`, `codex_conversation`, `state_migration`, `statement_snapshot`, `receipt_reconsider`, `receipt_master` | no test file imports any of the six. |
| Stale checkout paths | `grep -n mw-integration-agent-src integration-agent/scripts/*` and per-file `$repo` / `repo/` usage lines | 14 scripts affected (list in AGT-DEPLOY-02). |
| Host units | `systemctl list-units --all 'mw-*' 'cloud-sql-auth-proxy*'`; `systemctl list-timers --all`; `systemctl list-unit-files 'mw-*'` | proxy, `mw-instagram-webhook`, `mw-cloudflared-instagram`, `mw-report-charts` running; 7 `mw-*` timers active including `mw-audit-relay.timer` (30 s) and `mw-resource-health.timer` (2 min). |
| Host receiver | `systemctl cat mw-instagram-webhook.service`; `systemctl show … -p ActiveEnterTimestamp -p NRestarts -p MainPID` | unit text identical to `integration-agent/systemd/mw-instagram-webhook.service`; `ActiveEnterTimestamp=Wed 2026-10-14 18:43:32 +07`, `NRestarts=0`. |
| Host health | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/health` (port from `config.example.json` and `debian-health.py:275`) | `200` |
| Host checkout | `ls -l /opt/mw-integration-agent-src`; `git -C … -c safe.directory='*' rev-parse HEAD`; `log -1`; `status --porcelain`; `rev-parse --is-shallow-repository` | monorepo root (`apps/`, `services/`, `integration-agent/`, `package.json`; no `pyproject.toml`, `src/`, `systemd/` or `service-catalogue.json` at top level). HEAD `9f4e5b37bb4b9ca6ce660efc15dcf29496c0c308`, `Thu Oct 15 21:28:15 2026 +0700 Merge pull request #12`. Clean. Shallow `true`. |
| Host venv | `ls -l /opt/mw-integration-agent`; `.venv/bin/python --version`; `.venv/bin/pip list` | Python 3.13.5; `mw-integration-agent 0.1.0`, `pillow 11.3.0`, `psycopg 3.2.10`, `psycopg-binary 3.2.10`, `typing_extensions 4.16.0`, `tzdata 2025.2` — match `pyproject.toml` pins. |
| Deployed code vs source | `sha256sum` of installed `site-packages/mw_integration_agent/*.py` (host) vs `sha256sum src/mw_integration_agent/*.py` (baseline) | 56 installed vs 55 source files. Differ: `instagram.py`, `partner_conversation.py`, `partner_notice.py`, `statement_delivery.py`, `statement_run.py`. Installed only: `appsheet.py`. The other 50 match. |
| Installed code in Git history | for every commit in `git rev-list 4fb7462` (the imported agent lineage, 60 commits, 22 Sep–15 Oct 2026) hash `partner_notice.py` at both the old root path and `integration-agent/…`; `git cat-file -t a8cf949…`; `git log --all` | no commit matches the installed hash; `a8cf949` is `Not a valid object name` in all refs; the container clone is shallow (`.git/shallow` has 6 boundaries, none at `4fb7462`). |
| Disk | `df -h /` | `9.7G size, 6.0G used, 3.2G avail, 66%` |
| Tunnel rule | read `infrastructure/ecosystem-tunnels/owned.tf:19-24` | `hooks.mw-credit.com`, `path = null`, `service = "http://127.0.0.1:8000"` |

## Checks not run

| Check | Reason |
| --- | --- |
| `journalctl -p err --since -7d` | permission denied for `codex-cloud`: output is only `Hint: You are currently not seeing messages from other users and the system … Users in groups 'adm', 'systemd-journal' can see all messages.` No unit log was visible. `sudo` is outside the read-only brief. |
| `ls -l /etc/mw-integration-agent`, `/var/lib/mw-integration-agent` | `Permission denied` for both. Secret names/modes and rollback-directory retention were not verified. |
| Host copy of `debian-health.py` (`/opt/mw-resource-monitoring`) | outside the host commands allowed for this review. The earlier review reported the host copy differs from the repository; not re-verified, so no finding is recorded for it. |
| `test_statement_image` (2 tests) | needs `fonts-thai-tlwg`/libraqm; not installed in this container. |
| `mw_agent` audit row counts | `mw_agent` is the production agent database; the brief allows only `loan_manager_dev`. AGT-STATE-01 is estimated from code. |
| Public GET of `https://hooks.mw-credit.com/health` | production ingress; no PROD access. AGT-WEBHOOK-03 rests on the Terraform rule. |
| Recovery of the deployed commit `a8cf949` | absent from this repository and (shallow) host clone; the archived MW-Integration-Agent repository is not reachable from this session. |

## Findings

### R063

**AGT-R063-01 — Current deploy helpers never reload the webhook receiver (R063 root cause)**
- Type: bug. Severity: S2. Confidence: confirmed (gap and timeline). The exact exception the stale receiver raised on 14 October cannot be recovered (AGT-R063-04).
- Evidence: `scripts/deploy-shared-receipt-api.py:21-23` ("These oneshot workers can import the replaced package; ingress/proxy stay running") and `UNITS` lists only the six oneshot workers; `activate` writes config/catalogue at `:192` and starts timers at `:197-198` with no `systemctl restart mw-instagram-webhook.service` in between. `deploy-native-conversations.py:7-9,58-60` and `deploy-appsheet-retirement.py:4-5,18-21` reuse that `main()`. `update-reviewed-runtime.sh:26-29` stops five timers and never touches the receiver. The older `deploy-receipt-summary.sh:37,44,62` did stop and start it, so the R053 helper regressed. The receiver re-reads `config.json` per request but runs the modules loaded at start (`server.py:35-36,60-61`); `validate_config` imports `conversation_api`/`receipt_api` lazily (`config.py:37-40`). Host: receiver `ActiveEnterTimestamp=Wed 2026-10-14 18:43:32 +07`, `NRestarts=0`; inventory records R058 verified at 14:53 and "webhook receiver reloaded at 18:43 Bangkok to repair inbound commands" (`project/Documents/Environment_Inventory.md:30`). `Release_Tracker.md:17` carries exactly this tooling under R063.
- Impact: after a package/config deployment, signed inbound messages can fail for hours while every health signal stays green. That is the 14:53–18:43 window on 14 October.
- Recommendation: implement "R063 minimal design" below (readiness endpoint, unit gate, restart-and-wait in the helper before timers resume).
- Effort: M. Needs: none (the tunnel path change in AGT-WEBHOOK-03 is a separate infra change).

**AGT-R063-02 — `/health` is a constant and the only monitor compares that constant; a stale or broken receiver is undetectable**
- Type: risk. Severity: S2. Confidence: confirmed.
- Evidence: `server.py:26-30` returns `200 "mw-instagram-webhook"` before any config, secret or database access. `project/scripts/monitoring/debian-health.py:275-276` sets `webhook_local=1` when the body equals that string. Alerting is one Grafana rule group (`scripts/grafana/manage.py:112`, `grafana_rule_group.performance`). The tunnel check (`debian-health.py:277-282`) reads `cloudflared_tunnel_ha_connections` only, not origin 5xx. Host: `/health` → `200` today.
- Impact: answer to "would an alert have fired for R063?" is no. Every POST can return 503 while `webhook_local=1` and the tunnel shows connected.
- Recommendation: point `webhook_local` at `/ready` and require `"ready": true` (design step D). Install the monitor on the host from the repository copy so its behaviour is reviewable.
- Effort: S. Needs: none.

**AGT-R063-03 — Receiver unit lacks proxy ordering, umask and a readiness gate**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `systemd/mw-instagram-webhook.service:3-4` has only `After=/Wants=network-online.target`; no `After=cloud-sql-auth-proxy.service`, no `UMask=`, no `Environment=HOME=`, no `ExecStartPost`. Every worker unit has `After=… cloud-sql-auth-proxy.service` and `UMask=0077` (for example `mw-receipt-summary.service:3,5,11`). Host `systemctl cat` text is identical to the repository file.
- Impact: at boot the receiver can accept traffic before the proxy is up and answer 503 until it is; systemd reports "active" whether or not it can serve.
- Recommendation: design step B.
- Effort: S. Needs: none.

**AGT-R063-04 — Every receiver exception becomes an unlogged 503**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `server.py:17-18` suppresses `log_message`; `server.py:47-48` and `:75-76` catch `Exception` and respond `503 "Unavailable"` with no output. Nothing else on the request path prints.
- Impact: the cause of the R063 outage cannot be reconstructed; any future ingress fault (bad config, fence off, pool busy, content mismatch) is invisible in journald.
- Recommendation: in both handlers print one JSON line to stderr: `{"event":"ingress_error","method":"POST","error":"<exception class>","code":"<ConfigurationError text or empty>"}`. Never log payloads or headers.
- Effort: S. Needs: none.

**AGT-R063-05 — Lazy imports make a long-lived receiver a mixed-version process**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `config.py:37-40` (`conversation_api`, `receipt_api`), `journal.py:61-63` (`audit`, `ConfigurationError`), `state.py:58,197,202` (`psycopg`, `audit`) import on first use. A `pip install` that replaces site-packages before the first such call leaves old `server.py`/`config.py` running with new `receipt_api.py`.
- Impact: undefined behaviour after a deploy until restart; one plausible R063 mechanism.
- Recommendation: import those modules eagerly in `serve()` before `serve_forever()`; the restart in the design makes this belt-and-braces.
- Effort: S. Needs: none.

#### R063 minimal design (for the implementation worker)

A. Receiver (`src/mw_integration_agent/server.py`, `cli.py`)
1. `serve(config_path, catalogue_path)`: before `serve_forever()` import `conversation_api`, `receipt_api`, `audit`, `state`, `receipt_storage` eagerly. Record `STARTUP = {pid, started_at (UTC ISO), code_version: config.get('code_version'), package_sha256}` where `package_sha256` is SHA-256 over the sorted `(name, sha256(bytes))` pairs of the package's `*.py` files.
2. `cli.py:154-161`: pass `args.catalogue` into `serve()` and `handler()`.
3. Keep `GET /health` unchanged (liveness; existing monitors keep working).
4. Add `GET /ready` with a 3-second budget and named checks in this order:
   - `config`: `load_json` + `validate_config`; `receiver_enabled is True`.
   - `catalogue`: `load_json` + `validate_catalogue`; `services.signed_webhook_ingress.enabled is True`.
   - `secrets`: `load_secret(config, 'meta_app_secret_file')` and `'webhook_verify_token_file'` are non-empty (values never returned).
   - `state`: when `state_backend == 'postgres'`: `with state.transaction(config) as c: c.execute('SELECT 1')`. This proves proxy, credential, pool and the generation fence (`state.py:93-96`).
   - `current`: `config['code_version'] == STARTUP.code_version` and the on-disk package hash equals `STARTUP.package_sha256`.
   - Response: JSON `{"ready": bool, "code_version": …, "started_at": …, "failed": [names]}`; HTTP 200 when ready, else 503. No secrets, paths or exception text.
5. Add CLI `receiver-ready --config … [--wait SECONDS]`: reads `listen_host`/`listen_port`, polls `/ready` once per second until ready or timeout, prints the JSON, exits 0/1.
6. Add the stderr error line from AGT-R063-04.

B. Unit (`systemd/mw-instagram-webhook.service`)
- `After=network-online.target cloud-sql-auth-proxy.service`; `Wants=network-online.target cloud-sql-auth-proxy.service` (Wants, not Requires: a proxy restart must not stop the receiver; while the DB is down it answers 503 and Meta retries).
- `UMask=0077`, `Environment=HOME=/var/lib/mw-integration-agent`.
- `ExecStartPost=/opt/mw-integration-agent/.venv/bin/mw-integration-agent receiver-ready --config /etc/mw-integration-agent/config.json --wait 30`.
- `TimeoutStartSec=45s`; keep `Restart=on-failure`; add `StartLimitIntervalSec=300`, `StartLimitBurst=5`.
- No watchdog (needs sd_notify) and no `OnFailure` (no notification unit exists); step D covers detection.

C. Deploy helper (`scripts/deploy-shared-receipt-api.py`; derivatives inherit)
1. Paths: `CHECKOUT = Path('/opt/mw-integration-agent-src')` for `git rev-parse/status`; `REPO = CHECKOUT / 'integration-agent'` for `pip install`, `src/mw_integration_agent`, `service-catalogue.json`, `tests`. In `checkout()` add `require((REPO / 'pyproject.toml').is_file(), …)`. In `verify_install()` require the source tree to be non-empty and the source/installed `.py` name sets to match (fixes AGT-DEPLOY-03 and the hybrid-install risk in AGT-DEPLOY-05).
2. `freeze`: also store `systemctl show mw-instagram-webhook.service -p InvocationID --value` in `deployment.json`.
3. `activate`, after the config/catalogue writes (`:192-193`) and before `:197-198`: (a) `systemctl restart mw-instagram-webhook.service`; (b) `sudo -u mwagent mw-integration-agent receiver-ready --config … --wait 30`, require exit 0, `ready`, and `code_version == args.commit`; (c) require the receiver `InvocationID` differs from the frozen one; (d) record `receiver_ready_at` in `deployment.json`; (e) only then `systemctl start` the saved `resume_timers`. On any failure leave the timers stopped, print the backup path and rollback steps, exit non-zero.
4. Add a `rollback` phase: copy `backup/package` over the installed package, restore `config.json`/`service-catalogue.json`, restart the receiver, run `receiver-ready`, then resume timers.
5. `update-reviewed-runtime.sh`: retire it in favour of the helper (preferred, owner decision) or apply the same restart-and-wait and the fixes in AGT-DEPLOY-04.

D. Monitoring: `debian-health.py:275` → fetch `/ready`, parse JSON, `1 if ready else 0`; install the repository copy on the host in the same deploy.

E. Tunnel: set `path = "^/instagram$"` on the `hooks.mw-credit.com` rule (`infrastructure/ecosystem-tunnels/owned.tf:19-24`) before `/ready` exists, so `/health` and `/ready` stay loopback-only (AGT-WEBHOOK-03).

F. Tests: new `tests/test_server.py` starts the handler on an ephemeral loopback port with a temporary SQLite-backend config and asserts `/health` 200; `/ready` 200; `/ready` 503 with `current` after rewriting `code_version` in the config file; POST without signature 403; `Transfer-Encoding` and oversize 413; a forced exception gives 503 plus one stderr JSON line. A unit-file parse asserts `After`/`Wants` proxy, `UMask=0077` and `ExecStartPost … receiver-ready`. Extend `tests/test_deploy_shared_receipt_api.py` to assert `REPO / 'pyproject.toml'` and the restart-before-resume order.

### DEPLOY

**AGT-DEPLOY-01 — The deployed production runtime (R058 `a8cf949`) is not in the repository; redeploying `main` would silently revert R058**
- Type: bug. Severity: S2. Confidence: confirmed.
- Evidence: host hashes show 5 installed modules differ from baseline source (`instagram.py`, `partner_conversation.py`, `partner_notice.py`, `statement_delivery.py`, `statement_run.py`) plus an installed `appsheet.py` that R057 removed from source. The imported agent lineage (`git rev-list 4fb7462`, 60 commits, 22 Sep–15 Oct 2026) has no commit whose `partner_notice.py` matches the installed hash, at either path. `a8cf949` is not an object in any ref. R058 is described as "attempts authorized Instagram sends without a local window gate" (`project/Documents/Development_Changes.md:233`), but `main` still gates locally: `partner_notice.py:109` and `statement_run.py:153,170,175` call `check_window` (`statement_delivery.py:92-101`, 24 h minus 60 s). The repository-merge note itself says "later source commits remain undeployed as before" (`Change Logs/CHANGE_NOTES_REPOSITORY_MERGE_2026-10-15.md:32`).
- Impact: the next deployment from `main` (including R063) reinstates the local 24-hour gate and other pre-R058 behaviour without anyone noticing. The released code cannot be reviewed or rebuilt from Git.
- Recommendation: before any R063 deploy, recover `a8cf949` (archived MW-Integration-Agent repository, or the host's installed package plus its rollback copy), diff it against `main`, land it on `main` as one commit, and record in the inventory the `main` commit that equals the installed tree. Add the name-set guard from design step C1 so an install that would drop or add modules fails unless listed explicitly.
- Effort: M. Needs: owner decision (which code is authoritative).

**AGT-DEPLOY-02 — Fourteen deploy/verify scripts still assume the agent at the checkout root**
- Type: bug. Severity: S2. Confidence: confirmed.
- Evidence: host checkout is the monorepo root with no `pyproject.toml`, `service-catalogue.json`, `systemd/` or `src/` at top level. Broken uses, by script and line:
  - `activate-conversation-poll.sh:16` (`/opt/mw-integration-agent-src/systemd/…`)
  - `activate-partner-conversations.sh:7` (used `:9-10`)
  - `deploy-cash-statement.sh:4` (used `:15-17`)
  - `deploy-operator-audit.py:21` (used `:65,:68,:75`)
  - `deploy-receipt-audit-repair.py:19` (used `:53`)
  - `deploy-receipt-evidence.py:14` (used `:55`)
  - `deploy-receipt-summary.sh:5` (used `:45-48,:50`)
  - `deploy-shared-receipt-api.py:15` (used `:122,:181,:189`); inherited by `deploy-native-conversations.py:7` and `deploy-appsheet-retirement.py:4`
  - `install-cash-statement-schedule.sh:4` (used `:17-18,:32`)
  - `install-postgresql-config.py:20,:29`
  - `update-reviewed-runtime.sh:5` (used `:46-47`)
  - `verify-receipt-evidence.py:26`
  Still correct at the checkout root: `update-from-github.sh:9`, `freeze-postgresql-cutover.py:19` (git only); `generate-vm-connectivity-architecture.py:302` is label text.
- Impact: `pip install /opt/mw-integration-agent-src` fails. In `deploy-shared-receipt-api.py` that happens in `install`, after `freeze` has stopped all six worker timers (`:160`), so a deploy attempt leaves receipts, conversations, relay and statements paused until an operator intervenes.
- Recommendation: fix the two general helpers (`deploy-shared-receipt-api.py`, `update-reviewed-runtime.sh`) with `CHECKOUT`/`REPO` as in design step C1. Delete the one-off activation scripts for services already active (AGT-QUALITY-05) instead of fixing them.
- Effort: S. Needs: none.

**AGT-DEPLOY-03 — Two "installed equals source" checks pass vacuously when the source path is wrong**
- Type: bug. Severity: S3. Confidence: confirmed.
- Evidence: `deploy-shared-receipt-api.py:122-124` builds `tree(REPO / 'src/mw_integration_agent')` and checks `all(...)` over it; `verify-receipt-evidence.py:26-28` does the same with `rglob`. Executed: `rglob` on a missing path → `[]`, `all([])` → `True`.
- Impact: with today's paths both proofs report success while comparing nothing.
- Recommendation: require the source set to be non-empty and equal in names to the installed set (design step C1).
- Effort: S. Needs: none.

**AGT-DEPLOY-04 — `update-reviewed-runtime.sh` is stale beyond its path**
- Type: bug. Severity: S3. Confidence: confirmed.
- Evidence: `:26` pauses five timers but not `mw-audit-relay.timer` (the relay keeps importing the package during `pip install`). `:29` installs an `EXIT` trap that restarts the timers even when the script fails after `pip install` has replaced the package. `:33-42` backs up `/var/lib/mw-integration-agent/state/*.db` SQLite journals, which no longer hold state since the PostgreSQL cutover. `:46-48` runs `pip install "$repo"` and `unittest discover -s tests` from the checkout root; at the monorepo root the tests step gives `NO TESTS RAN`. No receiver restart (AGT-R063-01).
- Impact: with the path fixed alone, the script would still update under a running relay, back up the wrong state, and resume timers on a half-finished install.
- Recommendation: retire it in favour of the Python helper (owner decision), or add the relay timer, drop the SQLite backup when `state_backend == 'postgres'`, run tests from `REPO`, make the trap conditional on success, and add the receiver restart-and-wait.
- Effort: S. Needs: owner decision.

**AGT-DEPLOY-05 — Per-file copy into site-packages creates hybrid installs**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `deploy-operator-audit.py:64-67` copies `outbox.py` and `operator_audit.py` into the installed package as root. Host readback shows `appsheet.py` still installed although R057 removed it from source; whether it survives from a per-file install or from `a8cf949` itself cannot be told without that commit.
- Impact: the installed tree is not any single commit, so hash verification and rollback reason about a tree nobody built.
- Recommendation: install only with `pip install --no-deps <REPO>` and verify the full installed `.py` name set against the source set (extra files fail).
- Effort: S. Needs: none.

**AGT-DEPLOY-06 — Package version never changes**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `pyproject.toml` `version = "0.1.0"`; host `pip list` shows `mw-integration-agent 0.1.0`.
- Impact: package metadata cannot identify the deployed commit; only `config.code_version` does.
- Recommendation: rely on `code_version` reported by `/ready` (design A4); optionally write the commit into the wheel at build time.
- Effort: S. Needs: none.

**AGT-DEPLOY-07 — Both clones are shallow, so provenance checks cannot be done on the host**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `git rev-parse --is-shallow-repository` → `true` on the host checkout and in this container. The merge note step says "full clone" (`Change Logs/CHANGE_NOTES_REPOSITORY_MERGE_2026-10-15.md:23`).
- Impact: "is the deployed commit an ancestor of main?" cannot be answered on the host; it helped AGT-DEPLOY-01 go unnoticed.
- Recommendation: `git fetch --unshallow` once on the host as root (owner-authorized host change), then have the deploy helper record `git merge-base --is-ancestor <installed> HEAD`.
- Effort: S. Needs: owner decision.

### WEBHOOK

**AGT-WEBHOOK-01 — A deleted (unsent) Instagram message makes the whole delivery fail with 503 on every retry**
- Type: bug. Severity: S2. Confidence: likely (Meta's `is_deleted` event shape is from Meta's documentation; there is no fixture for it in this repository).
- Evidence: `webhook.py:23-24` accepts any `message` with a `mid` that is not an echo and does not skip `is_deleted`. A deletion event carries the same `mid`, a new `timestamp` and no text. `journal.py:77-83` compares `(message_id, sender_id, event_timestamp, text, reply_to)` with the stored row and raises `INGRESS_DUPLICATE_CONTENT_MISMATCH`; `server.py:75-76` turns it into 503. All messages of one POST are inserted in one transaction (`journal.py:66-90`), so other messages in that POST roll back too. `grep -rn "is_deleted\|message_edit" src tests docs` → no match.
- Impact: when a borrower or partner unsends a message, Meta retries the same payload and every retry fails; messages batched with it are delayed or lost when Meta gives up; sustained 5xx can get the subscription disabled (hypothesis).
- Recommendation: in `extract_messages` skip `message.get('is_deleted')` and count it in the `ingress_accepted` audit payload. Keep the mismatch guard for genuine content changes but record it as `ingress_work.state='REVIEW'` and return 200 instead of 503 forever.
- Effort: S. Needs: none.

**AGT-WEBHOOK-02 — Messages older than 24 hours (or timestamped in the future) are dropped with 200 and no record**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `webhook.py:34-35` skips events outside `0 <= now - timestamp <= 86400`; the receipt row is still inserted with the reduced `event_count` and the request returns `200 EVENT_RECEIVED` (`server.py:68-74`).
- Impact: after an outage longer than a day (R063 lasted about four hours), Meta's later retries are acknowledged and the messages are lost silently.
- Recommendation: capture late messages with `ingress_work.state='REVIEW'` (the existing quarantine path at `journal.py:85-86`) or at least record the dropped count in the `ingress_accepted` event.
- Effort: S. Needs: none.

**AGT-WEBHOOK-03 — The tunnel publishes every receiver path, including `/health`**
- Type: risk. Severity: S3. Confidence: likely (Terraform rule; public GET not run).
- Evidence: `infrastructure/ecosystem-tunnels/owned.tf:19-24` routes `hooks.mw-credit.com` with `path = null` to `http://127.0.0.1:8000`. `integration-agent/AGENTS.md:14`: "Never expose the worker, Codex, debugging, or health endpoints directly to the internet."
- Impact: low today (fixed string); a richer `/ready` would become public.
- Recommendation: `path = "^/instagram$"` on that rule (design step E), applied before `/ready` ships.
- Effort: S. Needs: infra change.

**AGT-WEBHOOK-04 — No socket timeout, unbounded threads, one DB connection**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `server.py:59` `self.rfile.read(length)` with no handler `timeout`; `ThreadingHTTPServer` (`server.py:85`) spawns a thread per connection. `state.py:52` pool limit 1; `state.py:59-65` waits 5 s then raises `STATE_POOL_BUSY` → 503. No rate limiting.
- Impact: a slow or stuck client holds a thread forever; concurrent Meta deliveries serialize on one connection and can 503. Volume is small, so this is hardening.
- Recommendation: set `timeout = 15` on the handler class; keep the 5 s pool wait (Meta retries 503).
- Effort: S. Needs: none.

**AGT-WEBHOOK-05 — Kill switches are read at different times; malformed requests give 503 instead of 400**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: the catalogue's `signed_webhook_ingress.enabled` is checked only at start (`cli.py:159-160`), while `receiver_enabled` is re-read per request (`server.py:60-63`). A non-numeric `Content-Length` raises `ValueError` at `server.py:55`; a JSON body that is not an object raises at `webhook.py:16` (`payload.get`); both become 503.
- Impact: disabling ingress in the catalogue has no effect until restart; malformed requests look like server faults and trigger Meta retries.
- Recommendation: check both switches per request (design A4 `catalogue` check); return 400 for unparsable `Content-Length` or a non-object body.
- Effort: S. Needs: none.

### SEND

Verified safe on `main`: intent is committed before every network send (`partner_notice.py:116,131`; `statement_delivery.py:168-172`; `review_cycle.py:203-205`); UNKNOWN Instagram, email and payment outcomes are never resent; email retries only on `EmailRejected`, at most three attempts with 300 s spacing (`partner_notice.py:131-142`); a Graph 429 is a definite rejection and is retried as the same notice row, not a new send (`graph_email.py:132-134`); delivery is capped at two notices per cycle (`review_cycle.py:252`); every worker has a `job()` single-owner row (`audit.py:155-164`, `V3__job_ownership.sql`) and a per-process `flock` (`receipt_run.py:159`, `statement_run.py:104`, `partner_conversation.py:203`, `conversation_poll.py:175`); timers use `OnUnitInactiveSec`, so a run cannot overlap its own next run.

**AGT-SEND-01 — Instagram failures are all "unknown", and the reason is discarded**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `instagram.py:34-38` wraps every exception, including definite 4xx and 429 responses, as `ConfigurationError("Instagram API request failed")`. `partner_notice.py:116-123` has already set `ig_status='UNKNOWN'` and swallows the exception with `pass`, writing no `detail`.
- Impact: a definite Instagram rejection is recorded as uncertain, email fallback then sends a second copy when Instagram may have delivered, and nobody can tell why. (The deployed R058 `instagram.py` differs from `main`; see AGT-DEPLOY-01.)
- Recommendation: after AGT-DEPLOY-01 is resolved, raise a distinct `InstagramRejected` for HTTP 4xx carrying the Graph error code and store `detail='IG_REJECTED_<code>'` or `'IG_UNKNOWN_<ExceptionClass>'`.
- Effort: S. Needs: none.

**AGT-SEND-02 — Email UNKNOWN outcomes are swallowed without a reason**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `partner_notice.py:143-144` `except Exception: pass` after the claim at `:131-133`; the row stays `email_status='UNKNOWN'` with no `detail`.
- Impact: a notice can stay UNKNOWN forever and the owner gets no clue whether Graph, the network or the code failed.
- Recommendation: `UPDATE … SET detail='EMAIL_UNKNOWN_'+type(exc).__name__` in that branch.
- Effort: S. Needs: none.

**AGT-SEND-03 — A payment POST that never left the host still becomes UNKNOWN forever**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `receipt_api.call` fetches the metadata identity token before the POST and outside the `try` (`receipt_api.py:87-92`); a `URLError` there, an invalid token, or any non-422 HTTP status (`:99-101`, including 401/403/429) raises. `review_cycle.py:208-210` swallows it, `:213` tries a status GET (which fetches the token again), and `:216` stores `UNKNOWN`. Later cycles only GET status (`:131-141`) every 20 s, which returns `unresolved` for a request the API never received.
- Impact: a transient metadata or auth fault turns an approved automatic payment into a manual reconciliation item, although the command API is idempotent by `requestId`; the status poll then repeats indefinitely.
- Recommendation: owner decision between (a) classifying failures before the POST is written (token fetch, 401/403) as "not sent" and returning the review to `APPROVED`, or (b) allowing one resubmit of the identical, already-durable command when status is `unresolved`, relying on server-side request-ID idempotency.
- Effort: S. Needs: owner decision.

**AGT-SEND-04 — The Graph refresh token is rewritten in place**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `graph_email.py:84-85` opens the only credential file with `r+`, seeks, dumps, truncates, fsyncs. Four units can write it (`ReadWritePaths=… outlook-email-oauth.json` in `mw-receipt-summary.service`, `mw-cash-statement.service`, `mw-cash-statement-email-retry.service`, `mw-partner-conversation.service`).
- Impact: a crash or full disk between truncate and write leaves an empty or partial file; every email fallback then fails until someone re-consents.
- Recommendation: write a `.bak` copy first (smallest change within the current `ReadWritePaths`); or write to a temporary file in the same directory and `os.replace`, which needs the secrets directory writable for those units.
- Effort: S. Needs: none.

### STATE

**AGT-STATE-01 — Audit rows grow without bound, including for no-op statements**
- Type: risk. Severity: S3. Confidence: likely (estimate from code; `mw_agent` not queried).
- Evidence: every non-SELECT journal statement writes one `audit.operations` and one `audit.events` row even when it changes 0 rows (`state.py:199-203`, `audit.py:80-84`). The receipt cycle runs an EXPIRED sweep on every run (`review_cycle.py:49`). Every job adds 1 operation, 2 events and 1 `job_runs` row (`audit.py:162-174`). Timers run every 15 s, 20 s and 30 s (host `list-timers`), about 13,000 job runs a day, so on the order of 15,000–25,000 operations a day. Audit tables are append-only by trigger (`V1__audit_and_control.sql`); `docs/POSTGRESQL_OPERATIONS.md:15` states "Retention/purge is not automated".
- Impact: steady growth on the shared Cloud SQL disk, and slower audit queries over time.
- Recommendation: skip `state_change` when `rowcount == 0` (smallest change, removes most noise). Then let the owner decide a retention rule (for example, monthly export to GCS and delete rows older than 12 months as the owner role).
- Effort: S (skip) / M (retention). Needs: owner decision for retention.

**AGT-STATE-02 — `readonly=True` is ignored on the PostgreSQL backend**
- Type: risk. Severity: S4. Confidence: confirmed (code trace).
- Evidence: `state.py:228-230` returns a read-write `PostgresJournal` whatever `readonly` is. Callers that ask for read-only: `statement_delivery.py:96`, `review_cycle.py:88,175`, `receipt_run.py:164`, `partner_conversation.py:211`, `receipt_health.py:73-74`.
- Impact: the read-only intent is not enforced; those callers currently run SELECTs only.
- Recommendation: carry `readonly` into `PostgresJournal` and run `SET TRANSACTION READ ONLY` in `transaction()` when set.
- Effort: S. Needs: none.

**AGT-STATE-03 — The reply scan re-reads every reply since the review cutoff every 20 seconds**
- Type: risk. Severity: S4. Confidence: likely.
- Evidence: `review_cycle.py:91` selects all messages with `captured_at >= partner_review_cutoff AND (reply_to <> '' OR recent)`; each row costs at least one more lookup (`:98,:105,:121`).
- Impact: cost grows linearly with history; small today.
- Recommendation: add `AND captured_at >= now - 2 days` for replies, or exclude message IDs already in `partner_review_replies` in SQL.
- Effort: S. Needs: none.

**AGT-STATE-04 — Documented role timeouts are overridden by the connection string**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `database/setup/bootstrap.sql:30-35` sets `statement_timeout='15s'` and `lock_timeout='3s'` per role in `mw_agent`; `state.py:46` connects with `options='-c statement_timeout=30000 -c lock_timeout=5000'`. Lab: `SHOW` with those options → `30s`, `5s`; without → `15s`, `3s`. Startup-packet options take precedence over `ALTER ROLE … IN DATABASE … SET`.
- Impact: the operations document and the live limits disagree; the effective limits are twice the documented ones.
- Recommendation: pick one place. Simplest: delete the two `-c` options from `state.py:46` so the role settings govern, or document the 30 s/5 s values and drop them from `bootstrap.sql` for future labs.
- Effort: S. Needs: none.

### TEST

**AGT-TEST-01 — 40 PostgreSQL tests never run in CI, though they run in minutes on a disposable cluster**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `.github/workflows/agent-tests.yml` runs only `python -m unittest discover -s tests -v` and states "Private PostgreSQL lab and renderer prerequisites retain their existing unittest skips". Executed here: 47 of 48 tests in the seven lab files pass on a disposable cluster (Checks executed); the suites themselves take 2 s.
- Impact: state adapter, ingress dedup, DML audit, relay and notice acknowledgement — the safety-critical paths — are unproven on every PR.
- Recommendation: add one CI job with a `postgres:18` service and a small `tests/lab/setup.sh` that does the steps used here: UTF8 cluster on a non-5432 port under a root containing `agent-state-lab-`; `bootstrap.sql` with `mw_design.execution_approved`; `state_migration.migrate`; `ALTER ROLE mw_agent_{worker,relay,auditor} LOGIN`; business schema into `loan_manager_prod` from root `database/migrations` (Flyway) with the role fixtures from `scripts/database/Test-AppRolePrerequisites.sql` and `Test-AgentAuditPrerequisites.sql`; `configure-reviewer-dml.configure`; `business-grants.sql`; `CREATE DATABASE mw_dml_test_ci`; export `MW_AGENT_LAB_MANIFEST` and `MW_DML_TEST_DSN`.
- Effort: M. Needs: none.

**AGT-TEST-02 — One DML audit test expects the wrong error for the real role**
- Type: bug. Severity: S3. Confidence: confirmed.
- Evidence: `tests/test_postgres_dml_audit.py:119-120` expects `psycopg.errors.InsufficientPrivilege` for `CREATE TABLE` as `mw_reviewer_dml`. With the role exactly as `scripts/configure-reviewer-dml.py:20` creates it (`default_transaction_read_only=on`), PostgreSQL raises `ReadOnlySqlTransaction: cannot execute CREATE TABLE in a read-only transaction` first. Lab run: `Ran 48 tests … FAILED (errors=1)` on exactly this test.
- Impact: the test passes only on a lab whose role differs from production, so the lab does not model production.
- Recommendation: assert `psycopg.Error` (either denial proves the property) or open `BEGIN READ WRITE` first so the privilege check is reached.
- Effort: S. Needs: none.

**AGT-TEST-03 — The receiver and five other modules have no tests**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: no test file imports `server`, `codex_conversation`, `state_migration`, `statement_snapshot`, `receipt_reconsider` or `receipt_master` (grep over `tests/*.py`). `state_migration` is exercised only by the operator script `scripts/verify-state-migration.py`.
- Impact: the R063 component has zero automated coverage.
- Recommendation: `tests/test_server.py` per design step F first; add `migrate()` checksum/order tests to the lab job.
- Effort: M. Needs: none.

**AGT-TEST-04 — The lab has undocumented prerequisites**
- Type: doc. Severity: S4. Confidence: confirmed.
- Evidence: the seven lab suites need, beyond `mw_agent`: LOGIN on the three NOLOGIN roles from `bootstrap.sql`; a `loan_manager_prod` with the business schema including `agent_audit` and `public."Borrowers"` in the same cluster (`test_postgres_dml_audit.py:27-28,41-42`, `test_operator_execution_postgres.py:23`); the `mw_reviewer_dml` role and `business-grants.sql`; a separate `mw_dml_test*` database for `MW_DML_TEST_DSN` (`test_conversation_dml.py:69-72`); a manifest root containing `agent-state-lab-` whose `data` directory equals `SHOW data_directory`. No script in the repository builds this; `verify-state-migration.py:24-26` only consumes a manifest, and `provision-agent-database.py` targets the production instance.
- Impact: every worker re-derives the lab; setup mistakes look like code bugs.
- Recommendation: the setup script from AGT-TEST-01, stating `--encoding=UTF8`.
- Effort: S. Needs: none.

**AGT-TEST-05 — No test keeps the Markdown and JSON catalogues aligned**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `integration-agent/AGENTS.md:23` requires alignment; no test reads `SERVICE_CATALOGUE.md`. Aligned today (Checks executed).
- Recommendation: a ten-line test comparing table service names with `service-catalogue.json` keys.
- Effort: S. Needs: none.

### HOST

**AGT-HOST-01 — The documented read-only route cannot read logs**
- Type: risk. Severity: S4. Confidence: confirmed.
- Evidence: `journalctl` as `codex-cloud` prints only the "not seeing messages from other users and the system" hint; the hint names groups `adm` and `systemd-journal`.
- Impact: read-only diagnosis (as for R063) needs root.
- Recommendation: add the review identity to `systemd-journal` only (owner decision); keep sudo for admin work.
- Effort: S. Needs: owner decision.

**AGT-HOST-02 — Credentials are plaintext files; the Graph refresh token is writable by four units**
- Type: risk. Severity: S4. Confidence: likely (directory modes not readable without sudo).
- Evidence: `config.py:206-215` reads secrets from files under `secrets_directory`; the four `ReadWritePaths` lines in AGT-SEND-04; `cloud-sql-auth-proxy.service:11` hard-codes the instance (intended). `integration-agent/AGENTS.md:12` prefers Secret Manager.
- Impact: accepted design for a two-user system; disk snapshots carry the secrets.
- Recommendation: no change now. If touched, narrow the token write path to the units that refresh it.
- Effort: S. Needs: owner decision.

**AGT-HOST-03 — Cloudflared unit duplicates `ProtectHome` and lacks address-family restriction**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `systemd/mw-cloudflared-instagram.service:16-17` has `ProtectHome=true` twice and no `RestrictAddressFamilies`, unlike the receiver and proxy units.
- Recommendation: remove the duplicate; add `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`.
- Effort: S. Needs: none.

**AGT-HOST-04 — `Requires=cloud-sql-auth-proxy.service` stops workers mid-run when the proxy restarts**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `Requires=` in `mw-receipt-summary.service:5`, `mw-audit-relay.service:4`, `mw-cash-statement.service:5`, `mw-cash-statement-email-retry.service:5`, `mw-partner-conversation.service:5`, `mw-conversation-poll.service:4`. systemd propagates stop/restart of a required unit to its dependents.
- Impact: a proxy restart (upgrade, crash loop) kills a worker between "claimed" and "sent", producing UNKNOWN outcomes that need manual reconciliation.
- Recommendation: use `Wants=` plus `After=` for workers too; a missing proxy then fails the DB connect cleanly at the start of a run.
- Effort: S. Needs: none.

### PRIV

**AGT-PRIV-01 — Scheduled output is aggregate; only operator commands print content**
- Type: doc. Severity: S4. Confidence: likely (journal not readable).
- Evidence: timer outputs use hashed partner keys and counts (`statement_run.py:143`; `review_cycle.py:28,220`; `cli.py:122-124`). Content is printed only by the manual commands `messages --include-text` (`cli.py:173-176`) and `instagram-probe` (`cli.py:183`, account username). The four `ensure_ascii=False` sites (`cli.py:130,134,176,183`) are those commands and the statement summaries. The survey premise that timers print borrower JSON did not hold.
- Impact: low; journald retention is unknown.
- Recommendation: no code change. Record journald retention in `docs/OPERATIONS.md` once someone with journal access reads `journald.conf`.
- Effort: S. Needs: none.

### QUALITY

**AGT-QUALITY-01 — Duplicated helpers and broad excepts**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `NoRedirect` three times, one divergent (`graph_email.py:26-28` and `statement_delivery.py:104-106` return `None`; `receipt_api.py:70-72` raises); `instagram.py:35` uses the default opener, which follows redirects with the bearer header. Metadata-token fetch in `conversation_api.py`, `receipt_api.py`, `receipt_storage.py`. UUIDv4-from-hash in `conversation_api.py:22` and `receipt_api.py:42-43`. `controls()` in `partner_conversation.py:109` and `receipt_run.py:19`. `BANGKOK` in `cash_statement.py:14` and `receipt_rules.py:13`. 28 `except Exception` across 18 modules.
- Recommendation: one `http.py` (NoRedirect that raises, metadata token, deterministic UUID) used everywhere, including Instagram.
- Effort: M. Needs: none.

**AGT-QUALITY-02 — No lint/type step; Python floor out of date**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `agent-tests.yml` has no ruff/mypy step; `pyproject.toml` `requires-python = ">=3.11"` while CI, host (3.13.5) and `AGENTS.md:24` use 3.13; 22 of 319 `def`s carry annotations.
- Recommendation: `requires-python = ">=3.13"`; add `ruff check --select E9,F` (syntax and undefined names only) to the workflow.
- Effort: S. Needs: none.

**AGT-QUALITY-03 — Hard-coded workstation paths and public IP in operator scripts**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `C:/Users/ideaadmin/Documents/ChatGPT` and `34.21.174.215` in `backup-agent-database.py:12,18`, `provision-agent-database.py:16,18`, `configure-reviewer-dml.py:49,52`, `verify-reviewer-dml-restored.ps1:5-6`.
- Impact: these only run on one Windows profile; root `AGENTS.md` says to use the current user's private location, not an assumed profile path.
- Recommendation: take the private directory from an argument or environment variable and keep the identity check on instance name only.
- Effort: S. Needs: none.

**AGT-QUALITY-04 — SQL built by string concatenation**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `review_cycle.py:191-192` builds `WHERE "Row ID"='<escaped>'` by hand for `read_query`.
- Impact: escaping is correct today; it is the only place in the payment path not using parameters.
- Recommendation: give `read_query` a params argument.
- Effort: S. Needs: none.

**AGT-QUALITY-05 — One-off activation scripts outlive their purpose**
- Type: std. Severity: S4. Confidence: likely.
- Evidence: `activate-conversation-poll.sh`, `activate-partner-conversations.sh`, `activate-partner-review.sh`, `activate-reviewer-dml.sh`, `activate-receipt-*.py`, `deploy-receipt-summary.sh`, `deploy-cash-statement.sh`, `install-cash-statement-schedule.sh`, `install-postgresql-config.py`, `freeze-postgresql-cutover.py` target services the catalogue already lists as enabled (`SERVICE_CATALOGUE.md:27-46`); most carry the stale paths in AGT-DEPLOY-02.
- Recommendation: delete them (Git keeps history) rather than fix paths; keep one current deploy helper.
- Effort: S. Needs: owner decision.

### DOC (documentation)

Merged by the orchestrator from Agent D — Delivery and Documentation (documentation focus-group orchestrator, Claude Fable 5.1, medium effort), who verified each claim at the cited line on commit 0995868.

Link check for `integration-agent/*.md` and `integration-agent/docs/*.md`: 17 files, 0 broken paths, 0 broken anchors.

#### AGT-DOC-01 Catalogue "current production" pin is stale and matches neither the inventory nor the host
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/SERVICE_CATALOGUE.md:5` "**Current production, 12 October 2026:** revision27/source `e9fd149914a3fa49f036c1eec75a8d4dc8a07c00` is installed and active". `project/Documents/Environment_Inventory.md:30` and `Release_Tracker.md:30` pin Debian to `a8cf94999aee33e9762614241b31904a967b7cac` (14 October). Host `.git/HEAD` of `/opt/mw-integration-agent-src` → `9f4e5b37bb4b9ca6ce660efc15dcf29496c0c308` (monorepo `main`, 15 October 21:28). `e9fd149` also appears in `docs/SHARED_RECEIPT_PAYMENT_API.md:3` and `docs/PARTNER_CONVERSATIONS.md`.
- **Impact**: Three documents, three different answers to "what runs on Debian". The catalogue should describe capabilities, not pins.
- **Recommendation**: Remove SHAs from the catalogue and the two docs; say "see Environment Inventory". See AGT-DOC-10 for the inventory itself.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-02 Monitoring rollback paragraph points at a Windows path in an archived repository
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/docs/OPERATIONS.md:108` "Maintained source, tests, GCP uptime check definition and Grafana definitions belong to `C:\GitHub\AppSheet-Loan-Project\scripts\monitoring`"; `:112` "See the linked monitoring change record in the AppSheet repository for dashboard/uptime-check rollback". The files are at `project/scripts/monitoring/` (`Build-Dashboards.ps1` etc.) and `project/Documents/Resource_Monitoring.md`.
- **Impact**: A rollback reader is sent to a path that does not exist on Debian or in the clone. Downgraded from the earlier S3: it wastes time but cannot trigger a wrong action, because the rollback steps themselves (`:112`, stop only `mw-resource-health.timer`) are correct.
- **Recommendation**: Replace both references with `project/scripts/monitoring/` and `project/Documents/Resource_Monitoring.md`. Keep the instance name at `:71`.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-03 Collector description still lists AppSheet probes as live
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/docs/OPERATIONS.md:110` "read-only database connectivity, existing bounded AppSheet probes and local Codex login readiness". `OPERATIONS.md:5` and `SERVICE_CATALOGUE.md:3` state R057 removed the AppSheet probe and that configuration rejects `appsheet_enabled=true`. Eight AppSheet mentions in `OPERATIONS.md`; lines 71 and 104 are compatibility identifiers or correct negatives.
- **Impact**: One document contradicts itself five lines apart.
- **Recommendation**: Reword `:110` to the native probes; keep identifier mentions.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-04 `POSTGRESQL_OPERATIONS.md` governance says AppSheet is the preferred API
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/docs/POSTGRESQL_OPERATIONS.md:7` "AppSheet is the preferred operational API for Find/Add/Edit/Delete"; `:11` "AppSheet Delete is routed to SQL when…"; `:38` "business R015 V33 in AppSheet-Loan-Project". Root `AGENTS.md` (Environments) and `Development_Workflow.md:90` say AppSheet APIs are retired, not fallback.
- **Impact**: The governance text for reviewer operations names a retired transport as primary. The runtime rejects it, so no wrong action results, but the rule text is inverted.
- **Recommendation**: Rewrite the Governance paragraph around the native API with SQL fallback; fix `:38` to `database/migrations/V33__agent_transaction_audit.sql`.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-05 `MIGRATION_PLAN.md` is a completed plan with one stage that contradicts current rules
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/docs/MIGRATION_PLAN.md:3` "The source Windows agent was fully stopped on 19 September 2026"; `:10` stage 4 "GUI compatibility: replace the Windows/Edge saved session with Linux Chromium … before any GUI write test"; `:8,20,27` bounded AppSheet reads and AppSheet credentials. `integration-agent/AGENTS.md` bans browser automation for Instagram; AppSheet GUI work is retired. Linked from `integration-agent/README.md:64`.
- **Impact**: A reader can take stage 4 as open work.
- **Recommendation**: Delete the file and the link at `README.md:64`; Git keeps it.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-06 `config.example.json` has no PostgreSQL state keys
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/config.example.json` keys (56) include `database_*`, `database_dml_*`, `receipt_*`, `reviewer_dml_*` but no `state_backend` or `agent_database_*`. The loader validates them: `src/mw_integration_agent/config.py:68` (`state_backend` ∈ sqlite/postgres), `:70-77` (`agent_database_host/port/name`, two password-file paths), `:86` (reviewer delete requires `state_backend == 'postgres'`).
- **Impact**: Copying the example yields the SQLite default; `reviewer_delete_enabled` would be rejected until the undocumented keys are added.
- **Recommendation**: Add the five keys with placeholder paths (no values).
- **Effort**: S
- **Needs**: none

#### AGT-DOC-07 `mw-audit-relay.timer` runs on the host but is in neither catalogue file
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/systemd/mw-audit-relay.service:12` ExecStart `… audit-relay --config … --catalogue …`; `.timer:6` `OnUnitInactiveSec=30s`. Host `systemctl list-timers "mw-*"` shows `mw-audit-relay.timer` firing every 30 s. `grep -i "audit-relay\|audit_relay"` in `SERVICE_CATALOGUE.md` and `service-catalogue.json` returns nothing; the JSON `services` map has 18 ids, none for the relay. Only `docs/POSTGRESQL_OPERATIONS.md:41` and `RECEIPT_EVIDENCE.md:39` mention a relay.
- **Impact**: Default-deny catalogue with one active timer outside it.
- **Recommendation**: Add one service entry (purpose, cadence, flag, failure mode) to both files.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-08 README says the PostgreSQL design is "not deployed"; it is running
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `integration-agent/README.md:9` "Proposed next architecture: [PostgreSQL state … handover] … it is **not deployed** and does not change the current service catalogue" (text present on this commit, settling the disputed claim). `docs/design/agent-postgresql-20260922/HANDOVER.md:3` "Not implemented or deployed." Against that: `docs/POSTGRESQL_OPERATIONS.md:3` "The owner-approved R015 implementation uses `mw_agent`"; `SERVICE_CATALOGUE.md:17` "the Debian agent uses the separate Cloud SQL `mw_agent` database"; `Change Logs/CHANGE_NOTES_AGENT_POSTGRESQL_IMPLEMENTATION_2026-09-22.md:3`; host runs `mw-audit-relay.timer`, which exists only for that design. Config value itself not readable (`/etc/mw-integration-agent/config.json` permission denied, as intended).
- **Impact**: The README's second paragraph states the opposite of the runtime.
- **Recommendation**: Replace the paragraph with one line pointing at `docs/POSTGRESQL_OPERATIONS.md`; mark the design folder "implemented 22 Sep 2026, historical" or delete it.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-09 Windows paths and old-repository names remain in agent docs
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `grep -rn 'C:\\GitHub' --include=*.md` outside change logs and outputs: `integration-agent/AGENTS.md:10` (`C:\GitHub\MW-Partner-Operations`), `docs/OPERATIONS.md:108`, `docs/design/agent-postgresql-20260922/HANDOVER.md:15,23,25` (`C:\GitHub\MW-Integration-Agent`, `C:\GitHub\AppSheet-Loan-Project`), `project/Documents/Rules/VM01_Local_Storage.md:9`, `project/SERVICE_CATALOGUE.md:3`. `SERVICE_CATALOGUE.md` is 2,625 words with 10 AppSheet mentions and six dated "owner request" sections (`:54-80`).
- **Impact**: Paths resolve nowhere on Debian or in the clone; the catalogue mixes enabled capabilities with release narrative.
- **Recommendation**: Replace paths with repository-relative ones. Reduce the catalogue to a table (service, timer, flag, cutoff, owner); the narratives already exist in change notes.
- **Effort**: S
- **Needs**: none

#### AGT-DOC-10 Inventory Debian pin does not match the host checkout after the monorepo cutover
- **Type**: doc
- **Severity**: S3
- **Confidence**: likely
- **Evidence**: `project/Documents/Environment_Inventory.md:30` "R058 deployed `a8cf94999aee33e9762614241b31904a967b7cac`, catalogue 27, verified 14 October 2026 at 14:53". Host read-back: `/opt/mw-integration-agent-src/.git/HEAD` → `refs/heads/main` = `9f4e5b37bb4b9ca6ce660efc15dcf29496c0c308` (a monorepo merge commit of 15 October 21:28). `git cat-file -t a8cf949…` fails in this clone, but the clone is shallow (304 commits), so whether the old-repository SHA exists in full history is unconfirmed. The installed package version in the venv was not read. The only record of the 14 October verification is the tracker/inventory sentence (ALL-DOC-02).
- **Impact**: A rollback that follows the inventory would try to check out a commit from the archived repository while the host now tracks monorepo `main`; which code the venv actually runs is not recorded anywhere current.
- **Recommendation**: Record on the inventory row the installed package version (`pip show` in the venv) and the monorepo commit and subdirectory the venv was built from; drop the old-repository SHA or label it "archived repo".
- **Effort**: S
- **Needs**: none

## Summary

| Severity | Count |
| --- | --- |
| S1 | 0 |
| S2 | 5 |
| S3 | 20 |
| S4 | 25 |
| Total | 50 |

S2: AGT-R063-01, AGT-R063-02, AGT-DEPLOY-01, AGT-DEPLOY-02, AGT-WEBHOOK-01.
S3: AGT-R063-03, -04, -05; AGT-DEPLOY-03, -04, -05, -07; AGT-WEBHOOK-02, -03, -04; AGT-SEND-01, -02, -03, -04; AGT-STATE-01; AGT-TEST-01, -02, -03; AGT-HOST-04.
S4: AGT-DEPLOY-06; AGT-WEBHOOK-05; AGT-STATE-02, -03, -04; AGT-TEST-04, -05; AGT-HOST-01, -02, -03; AGT-PRIV-01; AGT-QUALITY-01 to -05.

Changes against the earlier Opus review of this group: AGT-MON-01 dropped (host monitor hash not re-read under this review's host-command limit; its recommendation is carried in AGT-R063-02); AGT-STATE-04 added (effective timeouts differ from `bootstrap.sql`, confirmed in the lab); AGT-TEST-04 evidence replaced with the prerequisites actually needed here (the SQL_ASCII failure was not reproduced); AGT-DEPLOY-01 evidence strengthened with the full-lineage hash search; AGT-DEPLOY-04 adds the EXIT-trap resume; AGT-WEBHOOK-05 adds the non-object JSON case. All other codes and severities are unchanged after re-verification.

Top 5 for the owner:
1. AGT-DEPLOY-01: production runs R058 code that exists in no commit of this repository; deploying `main` (even for R063) would quietly undo R058. Recover `a8cf949` first.
2. AGT-R063-01: the deploy helpers never restart the webhook receiver; implement the readiness design (`/ready`, unit gate, restart-and-wait before timers resume).
3. AGT-R063-02: no alert could have caught R063; switch the Debian monitor from the fixed `/health` string to `/ready`.
4. AGT-DEPLOY-02: fourteen deploy scripts break on the monorepo checkout, and the main helper fails after pausing all six workers; fix the two general helpers, delete the one-off ones.
5. AGT-WEBHOOK-01: an unsent Instagram message makes Meta's delivery fail on every retry; skip `is_deleted` events and quarantine mismatches instead of answering 503.
