# Independent review — Debian integration agent — 15 October 2026

Baseline 0995868. Scope: `integration-agent/` (source, scripts, systemd, database, tests), `.github/workflows/agent-tests.yml`, the Debian host `vm-mw-credit-agent`, the tunnel rule in `infrastructure/ecosystem-tunnels/owned.tf` and the host monitor `project/scripts/monitoring/debian-health.py`. Checklist items 1–8 and 10 of the approved plan; item 9 (documentation drift) belongs to the documentation worker.

Method: read `server.py`, `webhook.py`, `journal.py`, `state.py`, `state_migration.py`, `partner_notice.py`, `statement_delivery.py`, `graph_email.py`, `receipt_api.py`, `review_cycle.py`, `cli.py`, `config.py` and the relevant parts of `audit.py`, `instagram.py`, `statement_run.py`. Read every deploy/activation script that names the source checkout and all repository unit files. Ran the unit suite once, then ran the 40 skipped PostgreSQL tests against a disposable local cluster. Read the Debian host back over `mw-debian-ssh`.

Read-only. No source, DEV, Debian or PROD change. No host service was started, stopped or restarted. No secret was read. No borrower data appears here.

Disclosure: besides the listed host commands I ran a few more read-only ones: `systemctl show`/`list-unit-files`, `sha256sum` of the installed package modules and of `/opt/mw-resource-monitoring/debian-health.py`, `git -c safe.directory=… status/rev-parse --is-shallow-repository/cat-file` on the host checkout, `pip show`, `id`, and a GET of `/ready` (404). Tool limitation: this worker runs on the Claude Opus family at the effort set by the orchestrator; the exact model ids in `Model_Work_Mapping.md` are not selectable.

## Checks executed

| Check | Command | Result |
| --- | --- | --- |
| Agent unit suite | `cd integration-agent && <scratch venv>/bin/python -m unittest discover -s tests -v` | `Ran 353 tests in 14.762s` / `OK (skipped=42)`. 311 passed, 0 failed. |
| Skipped suites (reason) | same run, `grep skipped` | `test_conversation_dml` 14 (`disposable PostgreSQL fixture required`, env `MW_DML_TEST_DSN`); `test_postgres_state` 11, `test_postgres_dml_audit` 6 (`isolated PostgreSQL 18 lab required`); `test_notice_acknowledgement` 6 (`private PostgreSQL lab required`); `test_operator_audit_postgres` 1, `test_operator_execution_postgres` 1, `test_receipt_audit_postgres` 1 (`isolated lab required`, env `MW_AGENT_LAB_MANIFEST`); `test_statement_image` 2 (`Debian Thai renderer required`). |
| PostgreSQL suites on a disposable lab | PG 18.6 cluster as `postgres` on 127.0.0.1:15502 (root `/tmp/mwpg-agent-state-lab-review`, UTF8), `bootstrap.sql` with `PGOPTIONS=-c mw_design.execution_approved=agent-postgresql-20260922-v1`, `state_migration.migrate()`, business schema copied from the synthetic V1..V92 scratch cluster into `loan_manager_prod`, `configure-reviewer-dml.configure()`, `business-grants.sql`, then the seven suites | 39 of 40 previously skipped DB tests pass. 1 fails (see AGT-TEST-02). `migrate()` applied V1..V4 and was a no-op on re-run. First attempt on a default (SQL_ASCII) cluster failed 14 DML tests with `DML_SCHEMA_MISMATCH` because psycopg returned `name` columns as bytes. Cluster stopped (`pg_ctl -m fast stop`) and its directory removed. |
| Vacuous path check | `python -c "Path('/nonexistent/src/mw_integration_agent').rglob('*.py') …"` | `files [] all() True` (Python 3.13.16) |
| Tests from monorepo root | `cd /home/user/MW-Credit-App && python -m unittest discover -s tests -q; echo $?` | `NO TESTS RAN`, `exit=5` |
| Catalogue Markdown vs JSON | small Python compare of `SERVICE_CATALOGUE.md` table rows vs `service-catalogue.json` | aligned today (no missing/extra service; revision 27). No test enforces it. |
| Host units | `systemctl list-units --all 'mw-*' 'cloud-sql-auth-proxy*'` | proxy, webhook, cloudflared, `mw-report-charts` running; 7 timers active/waiting incl. `mw-audit-relay.timer` and `mw-resource-health.timer`. |
| Host receiver | `systemctl cat mw-instagram-webhook.service`; `systemctl show … -p ActiveEnterTimestamp -p NRestarts` | Unit identical to `integration-agent/systemd/mw-instagram-webhook.service`. `ActiveEnterTimestamp=Wed 2026-10-14 18:43:32 +07`, `NRestarts=0`. |
| Host health | `curl … http://127.0.0.1:8000/health` / `/ready` | `200` / `404` (port 8000 from `config.example.json:35` and `debian-health.py:275`). |
| Host checkout | `ls -l /opt/mw-integration-agent-src`; `git -c safe.directory=… rev-parse HEAD`; `log -1`; `status --porcelain`; `rev-parse --is-shallow-repository` | Monorepo root (`apps/`, `services/`, `integration-agent/`, `package.json`, no `pyproject.toml`). HEAD `9f4e5b37bb4b…`, `Thu Oct 15 21:28:15 2026 +0700 Merge pull request #12`. Clean. Shallow `true`. Plain `git -C … rev-parse` fails: `detected dubious ownership`. |
| Deployed code vs source | `sha256sum` of installed `site-packages/mw_integration_agent/*.py` vs baseline `integration-agent/src` | 56 installed vs 55 source files. Differ: `instagram.py`, `partner_conversation.py`, `partner_notice.py`, `statement_delivery.py`, `statement_run.py`. Installed only: `appsheet.py`. Installed `server.py` mtime 14 Oct 07:51 UTC. |
| Deployed pin | `git cat-file -t a8cf949…` locally and on the host clone | `fatal: Not a valid object name` / `could not get object info`. Both clones are shallow. |
| Venv | `python --version`; `pip list` | Python 3.13.5. `mw-integration-agent 0.1.0`, `pillow 11.3.0`, `psycopg 3.2.10`, `psycopg-binary 3.2.10`, `tzdata 2025.2`, `typing_extensions 4.16.0` — match `pyproject.toml` pins. |
| Disk | `df -h /` | `9.7G size, 6.0G used, 3.2G avail, 66%`. |
| Monitor drift | `sha256sum /opt/mw-resource-monitoring/debian-health.py` vs repo | host `6d9caffc…`, repo `b80a40f4…` — different. |
| Tunnel rule | read `infrastructure/ecosystem-tunnels/owned.tf:20-23` | `hooks.mw-credit.com` → `http://127.0.0.1:8000`, `path = null` (all paths). |
| Identity | `id` on host | `codex-cloud … groups=…,1000(google-sudoers)`. |

## Checks not run

| Check | Reason |
| --- | --- |
| `journalctl -p err/-p warning --since -7d` | `codex-cloud` is not in `adm`/`systemd-journal`. Output: `Hint: You are currently not seeing messages from other users and the system.` The error count `1` is that hint line only. No system or unit log was visible. Using `sudo` is outside the read-only brief. |
| `ls -l /etc/mw-integration-agent /etc/mw-integration-agent/secrets` | `Permission denied` (`/etc/mw-integration-agent` is `drwxr-x--- root mwagent`). Secret names and modes not verified. |
| `ls -l /var/lib/mw-integration-agent /…/rollback` | `Permission denied` (`drwxr-x--- mwagent mwagent`). Rollback retention not verified. |
| `test_statement_image` (2 tests) | Needs `fonts-thai-tlwg` and libraqm; not installed in this container. |
| `mw_agent` row counts / audit growth | `mw_agent` is the production agent database; the brief allows only `loan_manager_dev`. Growth in AGT-STATE-01 is estimated from code. |
| Public GET of `https://hooks.mw-credit.com/health` | Production ingress; no PROD access. AGT-WEBHOOK-03 rests on the Terraform rule. |
| Recovery of the deployed R058 commit `a8cf949` | Not in this repository or the host clone (both shallow); the archived MW-Integration-Agent repository is not reachable from this session. |

## Findings

### R063

**AGT-R063-01 — Webhook receiver is never reloaded by the current deploy helpers (R063 root cause)**
- Type: bug. Severity: S2. Confidence: confirmed (gap and timeline); the exact exception the stale receiver raised is unrecoverable (see AGT-R063-04).
- Evidence: `scripts/deploy-shared-receipt-api.py:21-23` comment "These oneshot workers can import the replaced package; ingress/proxy stay running" and `UNITS` lists only the six oneshot workers. The derivatives `deploy-native-conversations.py:7-9,58-60` and `deploy-appsheet-retirement.py:4,18-21` reuse that `main()`. `update-reviewed-runtime.sh:26-29` also stops only timers and never restarts the receiver. The older `deploy-receipt-summary.sh:37,44,62` did stop and start it, so this is a regression in the R053-era helper. The receiver re-reads and re-validates the live `config.json` on every request with the code it loaded at start (`server.py:35-36,60-61`). `config.validate_config` imports `conversation_api` and `receipt_api` lazily (`config.py:37-40`), so a long-lived process can mix old and new modules. Host readback: receiver `ActiveEnterTimestamp=Wed 2026-10-14 18:43:32 +07`, `NRestarts=0`. Inventory records R058 verified at 14:53 and "webhook receiver reloaded at 18:43 Bangkok to repair inbound commands" (`project/Documents/Environment_Inventory.md:30`). The R058 deployment record the inventory links to (`CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-promotion-status`) has no R058 section in this repository (one heading, 26 lines); handed to the documentation worker.
- Impact: after every package/config deployment, signed inbound messages (review commands, receipts) can fail with silent 503s for hours, while every health signal stays green. That is what happened between 14:53 and 18:43 on 14 October.
- Recommendation: implement the design under "R063 minimal design" below: `/ready`, unit ordering plus `ExecStartPost` readiness gate, and a deploy-helper restart-and-wait step before timers resume.
- Effort: M. Needs: none (the tunnel path restriction in AGT-WEBHOOK-03 needs an infra change).

**AGT-R063-02 — `/health` is a constant and the only monitor compares that constant; a stale or broken receiver is undetectable**
- Type: risk. Severity: S2. Confidence: confirmed.
- Evidence: `server.py:28-30` returns `200 "mw-instagram-webhook"` without touching config, secrets or the database. `project/scripts/monitoring/debian-health.py:275` marks `webhook_local` healthy when the body equals that string. Alerting is one Grafana rule group (`scripts/grafana/manage.py:112`, `grafana_rule_group.performance`). The tunnel check (`debian-health.py:277-282`) reads only `cloudflared_tunnel_ha_connections`, not origin 5xx. Host readback: `/health` → `200`.
- Impact: "Would an alert have fired for R063?" No. Every POST could return 503 while `webhook_local=1` and the tunnel shows connected.
- Recommendation: point `webhook_local` at `/ready` and require `"ready": true` (design step D). Deploy the monitor from the repository (see AGT-MON-01).
- Effort: S. Needs: none.

**AGT-R063-03 — Receiver unit lacks database ordering, umask and a readiness gate**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `systemd/mw-instagram-webhook.service:2-4` has only `After=/Wants=network-online.target`. No `After=cloud-sql-auth-proxy.service`, no `UMask=`, no `Environment=HOME=`, no `ExecStartPost`/watchdog, no `OnFailure`. All workers have `After=…cloud-sql-auth-proxy.service` and `UMask=0077` (e.g. `mw-receipt-summary.service:3,5,11`). Host `systemctl cat` output is identical to the repository file.
- Impact: at boot the receiver can accept traffic before the proxy is up (503s until it is). Files it creates use the default umask. systemd reports "active" whether or not it can serve.
- Recommendation: design step B.
- Effort: S. Needs: none.

**AGT-R063-04 — Every receiver exception becomes an unlogged 503**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `server.py:17-18` suppresses `log_message`; `server.py:47-48` and `:75-76` catch `Exception` and respond `503 "Unavailable"` with no output. Nothing else in the request path writes to stdout/stderr.
- Impact: the cause of the R063 outage cannot be reconstructed, and any future ingress fault (bad config, fence off, pool busy, content mismatch) is invisible in journald.
- Recommendation: in both handlers, print one JSON line to stderr: `{"event":"ingress_error","method":"POST","error":"<exception class>","code":"<ConfigurationError text or empty>"}`. ConfigurationError texts are fixed codes; never log payloads or headers.
- Effort: S. Needs: none.

**AGT-R063-05 — Lazy imports make a long-lived receiver a mixed-version process**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `config.py:37-40` (`conversation_api`, `receipt_api`), `journal.py:61-63` (`datetime`, `audit`, `config.ConfigurationError`) and `state.py:58,197,202` (`psycopg`, `audit`) import on first use. A deploy that replaces site-packages before the first such call leaves the receiver running old `server.py`/`config.py` with new `receipt_api.py`.
- Impact: undefined behaviour after a deploy until restart; one plausible R063 mechanism.
- Recommendation: import these modules eagerly in `serve()` before `serve_forever()`; the restart in the design makes this a belt-and-braces change.
- Effort: S. Needs: none.

#### R063 minimal design (for the implementation worker)

A. Receiver (`src/mw_integration_agent/server.py`, `cli.py`)
1. In `serve(config_path, catalogue_path)`, before `serve_forever()`: eagerly import `conversation_api`, `receipt_api`, `audit`, `state`, `receipt_storage`. Record `STARTUP = {pid, started_at (UTC ISO), code_version: config.get('code_version'), package_sha256}`. `package_sha256` = SHA-256 over sorted `(name, sha256(bytes))` of the package's `*.py` files.
2. Pass `catalogue_path` from `cli.py:154-161` into `serve()` and `handler()`.
3. Keep `GET /health` exactly as is (liveness; old monitors keep working).
4. Add `GET /ready`, 3-second budget, checks in order, each named:
   - `config`: `load_json` + `validate_config`; `receiver_enabled is True`.
   - `catalogue`: `validate_catalogue`; `services.signed_webhook_ingress.enabled is True`.
   - `secrets`: `load_secret(config,'meta_app_secret_file')` and `'webhook_verify_token_file'` are non-empty (never return values).
   - `state`: when `state_backend=='postgres'`: `with state.transaction(config) as c: c.execute('SELECT 1')`. This proves proxy, credential, pool and the generation fence/`processing_enabled`.
   - `current`: `config['code_version'] == STARTUP.code_version` and the on-disk package hash equals `STARTUP.package_sha256`.
   - Response: JSON `{"ready": bool, "code_version": STARTUP.code_version, "started_at": …, "failed": [names]}`; HTTP 200 when ready, else 503. No secrets, paths or exception text.
5. Add CLI `receiver-ready --config … [--wait SECONDS]`: reads `listen_host/listen_port`, polls `/ready` every second until ready or timeout, prints the JSON, exits 0/1.
6. Add the stderr error line from AGT-R063-04.

B. Unit (`systemd/mw-instagram-webhook.service`)
- `After=network-online.target cloud-sql-auth-proxy.service`
- `Wants=network-online.target cloud-sql-auth-proxy.service` (Wants, not Requires: a proxy restart must not stop the receiver; while the DB is down it answers 503 and Meta retries).
- `UMask=0077`, `Environment=HOME=/var/lib/mw-integration-agent`.
- `ExecStartPost=/opt/mw-integration-agent/.venv/bin/mw-integration-agent receiver-ready --config /etc/mw-integration-agent/config.json --wait 30`
- `TimeoutStartSec=45s`, keep `Restart=on-failure`, add `StartLimitIntervalSec=300`, `StartLimitBurst=5`.
- No watchdog (needs sd_notify) and no `OnFailure` (no notification unit exists); monitoring step D covers detection.

C. Deploy helper (`scripts/deploy-shared-receipt-api.py`; derivatives inherit it)
1. Paths: `CHECKOUT = Path('/opt/mw-integration-agent-src')` for `git rev-parse/status`; `REPO = CHECKOUT/'integration-agent'` for `pip install`, `src/mw_integration_agent`, `service-catalogue.json`, `tests`. Add `require((REPO/'pyproject.toml').is_file())` in `checkout()`. In `verify_install()`, require the source tree to be non-empty (fixes AGT-DEPLOY-03).
2. `freeze`: also store `systemctl show mw-instagram-webhook.service -p InvocationID --value` in `deployment.json`.
3. `activate`, after the config/catalogue writes (`:192-196`) and before `:197-198`:
   a. `systemctl restart mw-instagram-webhook.service`;
   b. `sudo -u mwagent mw-integration-agent receiver-ready --config … --wait 30`; require exit 0, `ready`, and `code_version == args.commit`;
   c. require the receiver `InvocationID` differs from the frozen one;
   d. record `receiver_ready_at` in `deployment.json`;
   e. only then `systemctl start` the saved `resume_timers`.
   On any failure: leave timers stopped, print the backup path and the rollback steps, exit non-zero.
4. Rollback (add a `rollback` phase): copy `backup/package` back over the installed package, restore `config.json`/`service-catalogue.json`, restart the receiver, run `receiver-ready`, then resume timers.
5. `update-reviewed-runtime.sh`: either retire it in favour of the helper (preferred, owner decision) or apply the same restart-and-wait step plus the fixes in AGT-DEPLOY-04.

D. Monitoring: `debian-health.py:275` → fetch `/ready`, parse JSON, `1 if ready else 0`. Install the repository copy on the host so the monitor is reproducible.

E. Tunnel: set `path = "^/instagram$"` on the `hooks.mw-credit.com` rule (`infrastructure/ecosystem-tunnels/owned.tf:20-23`) before `/ready` exists, so `/health` and `/ready` stay loopback-only (AGT-WEBHOOK-03).

F. Tests (new `tests/test_server.py`, extend `tests/test_deploy_shared_receipt_api.py`): start the handler on an ephemeral loopback port with a temporary SQLite-backend config; assert `/health` 200; `/ready` 200; `/ready` 503 with `current` after rewriting `code_version` in the config file; POST without signature 403; `Transfer-Encoding` and oversize 413; forced exception gives 503 and one stderr JSON line; unit-file parse asserts `After`/`Wants` proxy, `UMask=0077`, `ExecStartPost receiver-ready`; helper asserts `REPO/'pyproject.toml'` and the restart-before-resume order.

### DEPLOY

**AGT-DEPLOY-01 — The deployed production runtime (R058 `a8cf949`) is not in the repository; redeploying `main` would silently revert R058**
- Type: bug. Severity: S2. Confidence: confirmed.
- Evidence: host hash readback shows 5 installed modules differ from baseline source (`instagram.py`, `partner_conversation.py`, `partner_notice.py`, `statement_delivery.py`, `statement_run.py`) and an extra installed `appsheet.py`. No commit in the imported history matches the installed `partner_notice.py` (6 commits checked). `a8cf949…` is absent locally and on the host clone. R058 is described as "attempts authorized Instagram sends without a local window gate" (`project/Documents/Development_Changes.md:233`), but `main` still gates locally: `partner_notice.py:109` and `statement_run.py:153,170,175` call `check_window` (`statement_delivery.py:92-101`, 24 h minus 60 s).
- Impact: the next deployment from `main` (including R063 itself) would reinstate the local 24-hour gate and other pre-R058 behaviour without anyone noticing. The released code cannot be reviewed or rebuilt from Git.
- Recommendation: before any R063 deploy, recover `a8cf949` (archived MW-Integration-Agent repo, or the host's installed package and its rollback copy), diff it against `main`, and land it on `main` as one commit. Record in the inventory the exact `main` commit that equals the installed tree. Add a deploy-time guard: refuse to install when the source tree's hashes do not cover the currently installed tree's modules unless an explicit `--allow-removal` lists them.
- Effort: M. Needs: owner decision (which code is authoritative).

**AGT-DEPLOY-02 — Fourteen deploy/verify scripts still assume the agent at the checkout root**
- Type: bug. Severity: S2. Confidence: confirmed.
- Evidence: host checkout is the monorepo root with no `pyproject.toml`, `service-catalogue.json`, `systemd/` or `src/` at top level (readback above). Broken uses, by script and line:
  - `activate-conversation-poll.sh:16` (`/opt/mw-integration-agent-src/systemd/…`)
  - `activate-partner-conversations.sh:7` (used `:9-10`)
  - `deploy-cash-statement.sh:4` (used `:15-17`)
  - `deploy-operator-audit.py:21` (used `:65,:75`)
  - `deploy-receipt-audit-repair.py:19` (used `:52-53`)
  - `deploy-receipt-evidence.py:14` (used `:54-55`)
  - `deploy-receipt-summary.sh:5` (used `:45-48,:50`)
  - `deploy-shared-receipt-api.py:15` (used `:122,:181,:189`), inherited by `deploy-native-conversations.py:7` and `deploy-appsheet-retirement.py:4`
  - `install-cash-statement-schedule.sh:4` (used `:17-18,:32`)
  - `install-postgresql-config.py:20,:29`
  - `update-reviewed-runtime.sh:5` (used `:46-49`)
  - `verify-receipt-evidence.py:26`
  Still correct at the checkout root: `update-from-github.sh:9` and `freeze-postgresql-cutover.py:19` (git only); `generate-vm-connectivity-architecture.py:302` is label text.
- Impact: `pip install /opt/mw-integration-agent-src` fails. For `deploy-shared-receipt-api.py install` this happens after `freeze` stopped all six worker timers, so a deploy attempt leaves receipts, conversations, relay and statements paused until an operator intervenes.
- Recommendation: fix the two general helpers (`deploy-shared-receipt-api.py`, `update-reviewed-runtime.sh`) with `CHECKOUT`/`REPO` as in design step C1. Delete the one-off activation/deploy scripts for services that are already active (see AGT-QUALITY-05) instead of fixing them.
- Effort: S. Needs: none.

**AGT-DEPLOY-03 — Two "installed equals source" checks pass vacuously when the source path is wrong**
- Type: bug. Severity: S3. Confidence: confirmed.
- Evidence: `deploy-shared-receipt-api.py:122-124` builds `tree(REPO/'src/mw_integration_agent')` and checks `all(…)` over it; `verify-receipt-evidence.py:26-28` does the same with `rglob`. Executed: `Path('/nonexistent/…').rglob('*.py')` → `[]`, `all([])` → `True`.
- Impact: with today's paths both proofs report success while comparing nothing.
- Recommendation: `require(source)` non-empty and require the source and installed `.py` name sets to match.
- Effort: S. Needs: none.

**AGT-DEPLOY-04 — `update-reviewed-runtime.sh` is stale beyond its path**
- Type: bug. Severity: S3. Confidence: confirmed.
- Evidence: `:26` pauses five timers but not `mw-audit-relay.timer` (relay keeps importing the package during `pip install`). `:33-42` backs up `/var/lib/mw-integration-agent/state/*.db` SQLite journals, which no longer hold state since the PostgreSQL cutover. `:48` runs `unittest discover -s tests` from the checkout root; executed at the monorepo root this gives `NO TESTS RAN`, `exit=5`. No receiver restart (AGT-R063-01).
- Impact: if the path were fixed alone, the script would still update under a running relay, back up the wrong state, and abort after `pip install` has already replaced the package.
- Recommendation: retire it in favour of the Python helper (owner decision), or add the relay timer, drop the SQLite backup when `state_backend=='postgres'`, run tests from `REPO`, and add the receiver restart-and-wait.
- Effort: S. Needs: owner decision.

**AGT-DEPLOY-05 — Per-file copy into site-packages creates hybrid installs**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `deploy-operator-audit.py:64-67` copies `outbox.py` and `operator_audit.py` into the installed package. Host readback shows `appsheet.py` still installed although R057 removed it from source (`a8568e3`, 13 Oct); whether it survives from a per-file install or from `a8cf949` itself cannot be told without that commit.
- Impact: the installed tree is not any single commit, so hash-based verification and rollback reason about a tree nobody built.
- Recommendation: only ever install with `pip install --no-deps <REPO>` and verify the full installed `.py` set against the source set (extra files fail).
- Effort: S. Needs: none.

**AGT-DEPLOY-06 — Package version never changes**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `pyproject.toml` `version = "0.1.0"`; host `pip list` shows `mw-integration-agent 0.1.0`.
- Impact: package metadata cannot identify the deployed commit; only `config.code_version` does.
- Recommendation: rely on `code_version` reported by `/ready` (design A4); optionally write the commit into the wheel at build time.
- Effort: S. Needs: none.

**AGT-DEPLOY-07 — Both clones are shallow, so provenance checks cannot be done**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `git rev-parse --is-shallow-repository` → `true` on the host checkout and in this container. The merge note step 2 says "full clone" (`Change Logs/CHANGE_NOTES_REPOSITORY_MERGE_2026-10-15.md:23`).
- Impact: "is the deployed commit an ancestor of main?" cannot be answered on the host; it contributed to AGT-DEPLOY-01 going unnoticed.
- Recommendation: `git fetch --unshallow` once on the host as root (owner-authorized host change), or record the deployed commit's ancestry check in the deploy helper while the checkout is complete.
- Effort: S. Needs: owner decision.

### WEBHOOK

**AGT-WEBHOOK-01 — A deleted (unsent) Instagram message makes the whole delivery fail with 503 on every retry**
- Type: bug. Severity: S2. Confidence: likely (Meta's `is_deleted` event shape is from Meta's documentation, not a fixture in this repository).
- Evidence: `webhook.py:23-25` accepts any `message` with a `mid` that is not an echo; it does not skip `is_deleted`. A deletion event carries the same `mid`, a new `timestamp` and no text. `journal.py:77-83` then compares `(message_id, sender_id, event_timestamp, text, reply_to)` with the stored row and raises `INGRESS_DUPLICATE_CONTENT_MISMATCH`. `server.py:75-76` turns it into 503. The insert runs in one transaction for all messages in the payload (`journal.py:66-90`), so other messages in the same POST are rolled back too. `grep -rn "is_deleted\|message_edit" src tests docs` → no match.
- Impact: when a borrower or partner unsends a message, Meta retries the same payload repeatedly and every retry fails; messages batched with it are delayed or lost when Meta gives up; sustained 5xx can get a webhook subscription disabled (hypothesis).
- Recommendation: in `extract_messages`, skip `message.get('is_deleted')` (and log a count in the ingress audit plan). Keep the mismatch guard for genuine changes but record the mismatch as `ingress_work` state `REVIEW` and return 200, rather than 503 forever.
- Effort: S. Needs: none.

**AGT-WEBHOOK-02 — Messages older than 24 hours are dropped with 200 and no record**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `webhook.py:34-35` skips events outside `0 <= now - timestamp <= 86400`; the receipt row is still inserted with the reduced `event_count` and the request returns `200 EVENT_RECEIVED` (`server.py:68-74`).
- Impact: after an outage longer than a day (R063 lasted about four hours), Meta's later retries are acknowledged and the messages are lost silently.
- Recommendation: capture late messages with `ingress_work.state='REVIEW'` (the existing quarantine path at `journal.py:85-86`) instead of discarding them, or at least record the dropped count in the `ingress_accepted` audit event.
- Effort: S. Needs: none.

**AGT-WEBHOOK-03 — The tunnel publishes every receiver path, including `/health`**
- Type: risk. Severity: S3. Confidence: likely (Terraform rule; public GET not run).
- Evidence: `infrastructure/ecosystem-tunnels/owned.tf:20-23` routes `hooks.mw-credit.com` with `path = null` to `http://127.0.0.1:8000`. `integration-agent/AGENTS.md` says "Never expose the worker, Codex, debugging, or health endpoints directly to the internet."
- Impact: low today (fixed string), but a richer `/ready` would become public.
- Recommendation: `path = "^/instagram$"` on that rule (design step E), applied before `/ready` ships.
- Effort: S. Needs: infra change.

**AGT-WEBHOOK-04 — No socket timeout, unbounded threads, one DB connection**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `server.py:59` `self.rfile.read(length)` with no handler `timeout`; `ThreadingHTTPServer` (`server.py:85`) spawns a thread per connection. `state.py:52` pool limit 1; `state.py:59-65` waits 5 s then raises `STATE_POOL_BUSY` → 503. No rate limiting.
- Impact: a slow or stuck client holds a thread forever; concurrent Meta deliveries serialize on one connection and can 503. Volume is small, so this is hardening.
- Recommendation: set `timeout = 15` on the handler class and keep the 5 s pool wait (Meta retries 503).
- Effort: S. Needs: none.

**AGT-WEBHOOK-05 — Kill switches are read at different times; bad Content-Length gives 503**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: the catalogue's `signed_webhook_ingress.enabled` is checked only at start (`cli.py:156-160`), while `receiver_enabled` is re-read per request (`server.py:60-63`). A non-numeric `Content-Length` raises `ValueError` at `server.py:55` and returns 503 instead of 400.
- Impact: disabling ingress in the catalogue has no effect until restart; malformed requests look like server faults.
- Recommendation: check both switches per request (design A4 `catalogue` check does this); return 400 for unparsable `Content-Length`.
- Effort: S. Needs: none.

### SEND

Verified safe on `main`: intent is committed before every network send (`partner_notice.py:116,131`, `statement_delivery.py:168-172`, `review_cycle.py:203-205`); UNKNOWN Instagram, email and payment outcomes are never resent; email retries only on `EmailRejected`, at most three attempts with 300 s spacing (`partner_notice.py:131-142`); a Graph 429 is a definite rejection and is retried as the same notice, not a new send (`graph_email.py:132-134`); delivery is capped at two notices per cycle (`review_cycle.py:252`); every worker has both a `job()` single-owner row (`audit.py:155-164`, `V3__job_ownership.sql`) and a per-process `flock`.

**AGT-SEND-01 — Instagram failures are all "unknown", and the reason is discarded**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `instagram.py:34-38` wraps every exception, including definite 4xx and 429 responses, as `ConfigurationError("Instagram API request failed")`. `partner_notice.py:116-123` has already set `ig_status='UNKNOWN'` and swallows the exception with `pass`, writing no `detail`.
- Impact: a definite Instagram rejection is recorded as uncertain, email fallback then sends a second copy when Instagram may have delivered, and nobody can tell why. (The deployed R058 `instagram.py` differs from `main`; see AGT-DEPLOY-01.)
- Recommendation: after AGT-DEPLOY-01 is resolved, raise a distinct `InstagramRejected` for HTTP 4xx with a Graph error code, store `detail='IG_REJECTED_<code>'` or `'IG_UNKNOWN_<ExceptionClass>'`.
- Effort: S. Needs: none.

**AGT-SEND-02 — Email UNKNOWN outcomes are swallowed without a reason**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `partner_notice.py:143-144` `except Exception: pass` after the claim at `:131-133`; the row stays `email_status='UNKNOWN'` with no `detail`.
- Impact: a notice can stay UNKNOWN forever and the owner gets no clue whether Graph, the network or the code failed.
- Recommendation: `UPDATE … SET detail='EMAIL_UNKNOWN_'+type(exc).__name__` in that branch.
- Effort: S. Needs: none.

**AGT-SEND-03 — A payment POST that never left the host still becomes UNKNOWN forever**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `receipt_api.call` fetches the metadata identity token before the POST (`receipt_api.py:87-92`); a `URLError` there, an invalid token, or any non-422 HTTP status (`:99-101`, including 401/403/429) leaves the review in `POSTING`. `review_cycle.py:208-217` treats every exception as uncertain and stores `UNKNOWN`; later cycles only GET status (`:131-141`), which returns "unresolved" for a request never received.
- Impact: a transient metadata or auth fault turns an approved automatic payment into a manual reconciliation item, although the command API is idempotent by `requestId`.
- Recommendation: owner decision between (a) classify failures before the POST is written (metadata/token errors) as "not sent" and return the review to `APPROVED`, or (b) allow one resubmit of the identical, already-durable command when status is "unresolved", relying on server-side request-ID idempotency.
- Effort: S. Needs: owner decision.

**AGT-SEND-04 — The Graph refresh token is rewritten in place**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `graph_email.py:84-85` opens the only credential file with `r+`, seeks, dumps, truncates, fsyncs. Four units can write it (`ReadWritePaths=…/outlook-email-oauth.json` in `mw-receipt-summary.service`, `mw-cash-statement.service`, `mw-cash-statement-email-retry.service`, `mw-partner-conversation.service`).
- Impact: a crash or full disk between truncate and write leaves an empty or partial file; every email fallback then fails until someone re-consents.
- Recommendation: keep the `flock` on a separate lock file; write the new JSON to a temporary file in the same directory, `fsync`, `os.replace`. This needs the secrets directory (not just the file) writable for those units, so the smaller alternative is to keep a `.bak` copy written first.
- Effort: S. Needs: none.

### STATE

**AGT-STATE-01 — Audit rows grow without bound, including for no-op statements**
- Type: risk. Severity: S3. Confidence: likely (estimate from code; `mw_agent` not queried).
- Evidence: every non-SELECT journal statement writes one `audit.operations` and one `audit.events` row even when it changes 0 rows (`state.py:199-203`, `audit.py:80-84`). The receipt cycle runs an EXPIRED sweep on every run (`review_cycle.py:49`). Every job adds 1 operation, 2 events and 1 `job_runs` row (`audit.py:162-174`). Timers run every 15 s, 20 s and 30 s, so at least about 25,000 operations per day. Audit tables are append-only by trigger (`V1__audit_and_control.sql:61-63`); no retention exists in code or `docs/POSTGRESQL_OPERATIONS.md`. The instance is the shared `db-f1-micro` with a 10 GB HDD (plan facts).
- Impact: steady growth on the disk shared with PROD and DEV business data, and slower audit queries over time.
- Recommendation: skip `state_change` when `rowcount == 0` (smallest change, removes most noise). Then let the owner decide a retention rule (for example, detach monthly partitions older than 12 months to a GCS export).
- Effort: S (skip) / M (retention). Needs: owner decision for retention.

**AGT-STATE-02 — `readonly=True` is ignored on the PostgreSQL backend**
- Type: risk. Severity: S4. Confidence: confirmed (code trace).
- Evidence: `state.py:228-230` returns a read-write `PostgresJournal` whatever `readonly` is. Callers that ask for read-only: `statement_delivery.py:96`, `review_cycle.py:88,175`.
- Impact: the read-only intent is not enforced; currently those callers only run SELECTs.
- Recommendation: carry `readonly` into `PostgresJournal` and run `SET TRANSACTION READ ONLY` in `transaction()` when set.
- Effort: S. Needs: none.

**AGT-STATE-03 — The reply scan re-reads every reply since the review cutoff every 20 seconds**
- Type: risk. Severity: S4. Confidence: likely.
- Evidence: `review_cycle.py:91` selects all messages with `captured_at >= partner_review_cutoff AND (reply_to <> '' OR recent)`; each row then costs at least one more lookup (`:98,:105,:121`).
- Impact: cost grows linearly with history; small today.
- Recommendation: add `AND captured_at >= now - 2 days` for replies, or skip message IDs already present in `partner_review_replies` in SQL.
- Effort: S. Needs: none.

### TEST

**AGT-TEST-01 — 40 PostgreSQL tests never run in CI, though they run in about 15 minutes of setup**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `.github/workflows/agent-tests.yml` runs only `python -m unittest discover -s tests -v` and states "Private PostgreSQL lab … retain their existing unittest skips". Executed here: 39 of 40 pass on a disposable cluster (Checks executed).
- Impact: state adapter, ingress dedup, DML audit, relay and notice acknowledgement — the safety-critical paths — are unproven on every PR.
- Recommendation: add one CI job with a `postgres:18` service and a small `tests/lab/setup.sh` that does exactly the steps used here: UTF8 cluster on a non-5432 port under a root containing `agent-state-lab-`; `bootstrap.sql` with `mw_design.execution_approved`; `state_migration.migrate`; `ALTER ROLE mw_agent_worker|relay|auditor LOGIN`; create the seven business roles; load the business schema from root `database/migrations` (Flyway) into `loan_manager_prod`; `configure-reviewer-dml.configure`; `business-grants.sql`; `CREATE DATABASE mw_dml_test_ci`; export `MW_AGENT_LAB_MANIFEST` and `MW_DML_TEST_DSN`.
- Effort: M. Needs: none.

**AGT-TEST-02 — One DML audit test expects the wrong error for the real role**
- Type: bug. Severity: S3. Confidence: confirmed.
- Evidence: `tests/test_postgres_dml_audit.py:119-120` expects `InsufficientPrivilege` for `CREATE TABLE` as `mw_reviewer_dml`. With the role exactly as `scripts/configure-reviewer-dml.py:20` creates it (`default_transaction_read_only=on`), PostgreSQL raises `psycopg.errors.ReadOnlySqlTransaction: cannot execute CREATE TABLE in a read-only transaction` first. Run result: `Ran 6 tests … FAILED (errors=1)`.
- Impact: the test passes only on a lab whose role differs from production, so the lab does not model production.
- Recommendation: assert `psycopg.Error` (either denial proves the property) or open a `READ WRITE` transaction first so the privilege check is reached.
- Effort: S. Needs: none.

**AGT-TEST-03 — The receiver and four other modules have no tests**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: no test imports `server`, `codex_conversation`, `state_migration`, `statement_snapshot`, `receipt_reconsider`, `receipt_master` (grep over `tests/*.py`). `state_migration` is exercised only by the operator script `scripts/verify-state-migration.py`.
- Impact: the R063 component has zero automated coverage.
- Recommendation: `tests/test_server.py` per design step F first; add `migrate()` checksum/order tests to the lab job.
- Effort: M. Needs: none.

**AGT-TEST-04 — The lab has undocumented prerequisites**
- Type: doc. Severity: S4. Confidence: confirmed.
- Evidence: on a default `initdb` (SQL_ASCII) 14 DML tests fail with `DML_SCHEMA_MISMATCH` because `pg_attribute.attname` comes back as bytes. The suites also need a `loan_manager_prod` business schema and reviewer grants in the same cluster (`test_postgres_dml_audit.py:27-28`, `test_operator_execution_postgres.py:23`). No script in the repository builds this lab; `verify-state-migration.py:24-26` only consumes a manifest.
- Impact: every worker re-derives the lab; failures look like code bugs.
- Recommendation: the setup script from AGT-TEST-01, with `-E UTF8` stated.
- Effort: S. Needs: none.

**AGT-TEST-05 — No test keeps the Markdown and JSON catalogues aligned**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `integration-agent/AGENTS.md` requires alignment; no test reads `SERVICE_CATALOGUE.md`. Aligned today (Checks executed).
- Recommendation: a ten-line test comparing table service names with `service-catalogue.json` keys.
- Effort: S. Needs: none.

### HOST

**AGT-HOST-01 — The documented read-only route cannot read logs**
- Type: risk. Severity: S4. Confidence: confirmed.
- Evidence: `journalctl` as `codex-cloud` shows only the "not seeing messages from other users" hint; the identity is in `google-sudoers` but not `systemd-journal`/`adm`.
- Impact: read-only diagnosis (as for R063) needs root.
- Recommendation: add the review/diagnostic identity to `systemd-journal` only (owner decision); keep sudo for admin work.
- Effort: S. Needs: owner decision.

**AGT-HOST-02 — Credentials are plaintext files; the Graph refresh token is writable by four units**
- Type: risk. Severity: S4. Confidence: likely (directory modes not readable without sudo).
- Evidence: `config.py:206-215` reads secrets from files under `secrets_directory`; the four `ReadWritePaths` lines in AGT-SEND-04; `cloud-sql-auth-proxy.service` hard-codes the instance (intended). AGENTS.md prefers Secret Manager.
- Impact: accepted design for a two-user system; disk snapshots carry the secrets.
- Recommendation: no change now. If touched, narrow the token write path to the units that refresh it.
- Effort: S. Needs: owner decision.

**AGT-HOST-03 — Cloudflared unit duplicates `ProtectHome` and lacks address-family restriction**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `systemd/mw-cloudflared-instagram.service` has `ProtectHome=true` twice and no `RestrictAddressFamilies`, unlike the other units.
- Recommendation: remove the duplicate; add `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`.
- Effort: S. Needs: none.

**AGT-HOST-04 — `Requires=cloud-sql-auth-proxy.service` stops workers mid-run when the proxy restarts**
- Type: risk. Severity: S3. Confidence: likely.
- Evidence: `Requires=` in `mw-receipt-summary.service:5`, `mw-audit-relay.service:4`, `mw-cash-statement*.service:5`, `mw-partner-conversation.service:5`, `mw-conversation-poll.service:4`. systemd propagates stop/restart of a required unit to its dependents.
- Impact: a proxy restart (upgrade, crash loop) kills a worker between "claimed" and "sent", producing UNKNOWN outcomes that need manual reconciliation.
- Recommendation: use `Wants=` plus `After=` for workers too; a missing proxy then fails the DB connect cleanly at the start of a run.
- Effort: S. Needs: none.

### MON

**AGT-MON-01 — The host monitor is not the repository copy**
- Type: risk. Severity: S3. Confidence: confirmed.
- Evidence: `/opt/mw-resource-monitoring/debian-health.py` SHA-256 `6d9caffc…` (13 Oct) vs repository `b80a40f4…`. The directory also holds three `debian-health.before-*.py` copies.
- Impact: monitor behaviour cannot be reviewed from Git; the `/ready` change (design step D) needs a reproducible install.
- Recommendation: diff the host copy into the repository once, then install from the checkout as part of the R063 deploy.
- Effort: S. Needs: none.

### PRIV

**AGT-PRIV-01 — Scheduled output is aggregate; only operator commands print content**
- Type: doc. Severity: S4. Confidence: likely (journal not readable).
- Evidence: timer outputs use hashed partner keys and counts (`statement_run.py:143,225,243`; `review_cycle.py:28,220`; `cli.py:122-124`). Content is printed only by the manual commands `messages --include-text` (`cli.py:173-176`) and `instagram-probe` (`cli.py:183`, account username). The survey premise that timers print borrower JSON did not hold.
- Impact: low; journald retention is unknown.
- Recommendation: no code change. Record journald retention in `docs/OPERATIONS.md` once someone with journal access reads `journald.conf`.
- Effort: S. Needs: none.

### QUALITY

**AGT-QUALITY-01 — Duplicated helpers and broad excepts**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `NoRedirect` three times, one divergent (`graph_email.py:26-28` and `statement_delivery.py:104-106` return None; `receipt_api.py:70-72` raises); `instagram.py:35` uses the default opener, which follows redirects with the bearer header. Metadata-token fetch in `conversation_api.py`, `receipt_api.py`, `receipt_storage.py`. UUIDv4-from-hash in `conversation_api.py:22` and `receipt_api.py:40-44`. `controls()` in `partner_conversation.py:109` and `receipt_run.py:19`. `BANGKOK` in `cash_statement.py:14` and `receipt_rules.py:13`. 28 `except Exception` across 11 modules.
- Recommendation: one `http.py` (NoRedirect that raises, metadata token, deterministic UUID) used everywhere, including Instagram.
- Effort: M. Needs: none.

**AGT-QUALITY-02 — No lint/type step; Python floor out of date**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `agent-tests.yml` has no ruff/mypy step; `pyproject.toml` `requires-python = ">=3.11"` while CI, host (3.13.5) and AGENTS.md use 3.13; 22 of 319 `def`s carry annotations.
- Recommendation: `requires-python = ">=3.13"`; add `ruff check --select E9,F` (syntax and undefined names only) to the workflow.
- Effort: S. Needs: none.

**AGT-QUALITY-03 — Hard-coded workstation paths and public IP in operator scripts**
- Type: std. Severity: S4. Confidence: confirmed.
- Evidence: `C:/Users/ideaadmin/Documents/ChatGPT` and `34.21.174.215` in `backup-agent-database.py:12,18`, `provision-agent-database.py:16,18`, `configure-reviewer-dml.py:49,52`, `verify-reviewer-dml-restored.ps1:5-6`.
- Impact: these only run on one Windows profile; root AGENTS.md says to use the current user's private location, not an assumed profile path.
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

Merged by the orchestrator from Agent D — Delivery and Documentation (Claude Sonnet 5.5, medium effort), who verified each claim at the cited line on commit 0995868.

Link check: `integration-agent/*.md` + `integration-agent/docs/*.md`: 17 files, 74 relative links, 0 broken paths, 0 broken anchors. Also 122 files in both `Change Logs/` folders, design docs, `project/scripts/*.md` and infrastructure READMEs: 86 links, 0 broken.

#### AGT-DOC-01 Catalogue source pin is two releases old
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `integration-agent/SERVICE_CATALOGUE.md:5` ("Current production, 12 October 2026: revision27/source `e9fd149914a3fa49f036c1eec75a8d4dc8a07c00` is installed and active"); `project/Documents/Environment_Inventory.md:30` and `project/Documents/Release_Tracker.md:30`: Debian runs `a8cf94999aee33e9762614241b31904a967b7cac` (R058, 14 October, catalogue 27).
- **Impact**: The catalogue says "current production" with a commit that is no longer running. The catalogue should list capabilities, not pins.
- **Recommendation**: Replace the SHA in the catalogue with "see Environment_Inventory". The SHA `e9fd149` stays valid in the dated evidence files.

#### AGT-DOC-02 Monitoring runbook points at the old repository path (rollback step)
- **Type**: doc  **Severity**: S3  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `integration-agent/docs/OPERATIONS.md:108` names `C:\GitHub\AppSheet-Loan-Project\scripts\monitoring` as the maintained source; line 112 sends the rollback of dashboards and the uptime check to "the AppSheet repository". That repository is archived and the files are at `project/scripts/monitoring/` (`ls` shows `Build-Dashboards.ps1` etc.). `project/Documents/Resource_Monitoring.md` has the same style of reference.
- **Impact**: Someone following the rollback paragraph looks in a Windows path that does not exist and in an archived repo. It is the only place a monitoring rollback is described for the Debian side.
- **Recommendation**: Replace with `project/scripts/monitoring/` and `project/Documents/Resource_Monitoring.md`. Keep the instance name at `:71` (kept by rule).

#### AGT-DOC-03 Collector description still lists AppSheet probes
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `integration-agent/docs/OPERATIONS.md:110` ("... read-only database connectivity, existing bounded AppSheet probes and local Codex login readiness"). `integration-agent/SERVICE_CATALOGUE.md:3` states R057 removed the AppSheet transport and probe; configuration rejects `appsheet_enabled=true`. `OPERATIONS.md` has 8 AppSheet mentions overall.
- **Impact**: States an AppSheet probe as live behaviour after retirement.
- **Recommendation**: Reword to "native API probes" (or whatever the collector now reads); check the remaining seven mentions and keep only compatibility-identifier ones.

#### AGT-DOC-04 `docs/POSTGRESQL_OPERATIONS.md` treats AppSheet as the live API
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: M  **Needs**: none
- **Evidence**: line 7 "AppSheet is the preferred operational API for Find/Add/Edit/Delete"; line 11 "AppSheet Delete is routed to SQL when delete triggers..."; line 38 "business R015 V33 in AppSheet-Loan-Project". Lines 19-27 are a six-step SQLite-to-PostgreSQL cutover procedure ("never switch back to stale SQLite"). R057 retired AppSheet (`project/outputs/r057-appsheet-retirement/README.md`); the cutover is done (`integration-agent/Change Logs/CHANGE_NOTES_AGENT_POSTGRESQL_IMPLEMENTATION_2026-09-22.md`; inventory line 36 lists `mw_agent`).
- **Impact**: Governance paragraph contradicts the native-API rule; the cutover section reads like a pending task.
- **Recommendation**: Rewrite the Governance paragraph for native API plus SQL fallback; move the cutover steps to the implementation change note (or delete, Git keeps them). Keep roles, connection count and recovery rules.

#### AGT-DOC-05 `docs/MIGRATION_PLAN.md` is a finished Windows-to-Debian plan
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `integration-agent/docs/MIGRATION_PLAN.md:3` ("The source Windows agent was fully stopped on 19 September 2026"), stage 1 "Foundation (this revision)", stage 4 "replace the Windows/Edge saved session with Linux Chromium ... GUI compatibility" (conflicts with `integration-agent/AGENTS.md` ban on browser automation for Instagram and the retirement of AppSheet GUI work), 3 AppSheet mentions.
- **Impact**: Stale plan with one instruction (stage 4) that contradicts current rules.
- **Recommendation**: Delete it. Root AGENTS.md says to delete superseded documentation; Git keeps the plan.

#### AGT-DOC-06 `config.example.json` lacks the PostgreSQL state keys
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `grep -n "state_backend\|agent_database" integration-agent/config.example.json` returns nothing. The loader validates them: `integration-agent/src/mw_integration_agent/config.py:68` (`state_backend` in `sqlite`/`postgres`), `:73-77` (`agent_database_host`, `_port` 5432, `_name` `mw_agent`, `_worker_password_file`, `_relay_password_file`).
- **Impact**: The example does not show how the production backend is configured; an operator copying it gets the SQLite default.
- **Recommendation**: Add the five keys with placeholder secret-file paths (no values).

#### AGT-DOC-07 `mw-audit-relay.timer` is installed in source but not in the catalogue
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `integration-agent/systemd/` contains `mw-audit-relay.service` and `mw-audit-relay.timer`. `grep -n -i "audit-relay\|audit_relay" integration-agent/SERVICE_CATALOGUE.md integration-agent/service-catalogue.json` returns nothing. `docs/POSTGRESQL_OPERATIONS.md` mentions "relay timer" in cutover step 6.
- **Impact**: The agent rule is default deny with a governed catalogue; one timer exists outside it.
- **Recommendation**: Add one catalogue row (purpose, cadence, owner, failure mode) to both the Markdown and the JSON.

#### AGT-DOC-08 README says the PostgreSQL design is not deployed
- **Type**: doc  **Severity**: S4  **Confidence**: likely  **Effort**: S  **Needs**: none
- **Evidence**: `integration-agent/README.md:9` ("Proposed next architecture: ... it is **not deployed** and does not change the current service catalogue"); `integration-agent/docs/design/agent-postgresql-20260922/HANDOVER.md:3` ("Design v1, 22 September 2026. Not implemented or deployed."). Against that: `docs/POSTGRESQL_OPERATIONS.md:3` ("The owner-approved R015 implementation uses `mw_agent`"), `integration-agent/Change Logs/CHANGE_NOTES_AGENT_POSTGRESQL_IMPLEMENTATION_2026-09-22.md`, `Environment_Inventory.md:36`. I did not read the host, so which backend production uses today is not confirmed; the documents disagree with each other.
- **Impact**: A reader cannot tell if the agent runs on PostgreSQL. See the correction note at the top.
- **Recommendation**: Update `README.md:9` to point at `docs/POSTGRESQL_OPERATIONS.md`; mark the design folder "implemented, historical" (or delete it after confirming the implementation note covers it).

#### AGT-DOC-09 Windows-path references remain in agent and project docs
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `grep -rn 'C:\\GitHub' --include=*.md` outside Change Logs/outputs finds 7 lines, including `integration-agent/AGENTS.md:10` ("Treat `C:\GitHub\MW-Partner-Operations` as a dated source reference ... Preserve the current paused state of the Windows agent"), `integration-agent/docs/OPERATIONS.md:108`, `project/SERVICE_CATALOGUE.md:3`. `SERVICE_CATALOGUE.md` has 2,625 words and 10 AppSheet mentions, with revision 21-27 narratives stacked in one file.
- **Impact**: Paths that resolve nowhere on Debian or in the repo; the catalogue mixes "what is enabled" with release history.
- **Recommendation**: Replace with repository paths. Longer term, keep the catalogue as a table of services, timers, flags and owner; move the revision paragraphs into the existing change notes.

---

## Summary

| Severity | Count |
| --- | --- |
| S1 | 0 |
| S2 | 5 |
| S3 | 21 |
| S4 | 23 |
| Total | 49 |

DOC (merged): AGT-DOC-01 to -09; see the DOC section for severities.

S2: AGT-R063-01, AGT-R063-02, AGT-DEPLOY-01, AGT-DEPLOY-02, AGT-WEBHOOK-01.
S3: AGT-R063-03, -04, -05; AGT-DEPLOY-03, -04, -05, -07; AGT-WEBHOOK-02, -03, -04; AGT-SEND-01, -02, -03, -04; AGT-STATE-01; AGT-TEST-01, -02, -03; AGT-HOST-04; AGT-MON-01.
S4: AGT-DEPLOY-06; AGT-WEBHOOK-05; AGT-STATE-02, -03; AGT-TEST-04, -05; AGT-HOST-01, -02, -03; AGT-PRIV-01; AGT-QUALITY-01 to -05.

Top 5 for the owner:
1. AGT-DEPLOY-01: production runs R058 code that is not in Git; deploying `main` (even for R063) would quietly undo R058. Recover `a8cf949` first.
2. AGT-R063-01: deploy helpers never restart the webhook receiver; implement the readiness design (receiver `/ready`, unit gate, restart-and-wait before timers resume).
3. AGT-R063-02: no alert could have caught R063; switch the Debian monitor from the fixed `/health` string to `/ready`.
4. AGT-DEPLOY-02: fourteen deploy scripts break on the monorepo checkout, and the main helper fails after pausing all workers; fix the two general helpers, delete the one-off ones.
5. AGT-WEBHOOK-01: an unsent Instagram message makes Meta's delivery fail on every retry; skip `is_deleted` events and quarantine mismatches instead of 503.
