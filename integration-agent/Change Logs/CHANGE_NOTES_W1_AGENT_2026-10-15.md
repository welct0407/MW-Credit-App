# W1 agent — recovery and fixes — 2026-10-15

## Purpose

Fix the Wave 1 findings of [the independent review](CHANGE_NOTES_REVIEW_AGENT_2026-10-15.md) and bring `main` back in line with the installed production tree. Starting commit `a029880` (main); branch `claude/review-w1-agent`. No deployment, no Debian host write, no migration, no grant.

## Changes

Each behaviour change has a focused test that failed on the old code and passes now. The test is named on each line.

- **AGT-DEPLOY-01** (commit `58929d7`): restored byte-for-byte from the host's R058 install (`a8cf949`, read over `mw-debian-ssh`): `instagram.py`, `partner_conversation.py`, `partner_notice.py`, `statement_delivery.py`, `statement_run.py`. `appsheet.py` is installed only, imported by nothing and retired by R057; not restored. The R058 tests were unavailable, so the unit tests were rewritten to the deployed behaviour: no local 24 h window gate, email fallback only after an explicit window-expiry rejection, definite 4xx is `REJECTED`, UNKNOWN never falls back, long replies are held `REVIEW`. A stale `check_window` import had hidden all 10 `test_cash_statement` tests (353 to 344). Tests: `test_partner_notice`, `test_review_cycle`, `test_cash_statement`, `test_email_fallback`, `test_instagram_transport`. Docs: `docs/CASH_STATEMENT.md`.
- **AGT-WEBHOOK-01** (`webhook.py`, `journal.py`, `server.py`): `is_deleted` events are skipped and counted. A changed retry of a known message no longer fails the POST with 503; its `PENDING` work row becomes `REVIEW`, consumed rows are untouched and the receiver answers 200. Tests: `test_instagram_transport.test_deleted_messages_are_skipped_and_counted`; lab `test_postgres_state.test_atomic_ingress_duplicate_and_changed_message`.
- **AGT-WEBHOOK-02** (`journal.py`, `webhook.py`): late (over 24 h) and future-dated messages get a quarantine reason. PostgreSQL stores them as `ingress_work.state='REVIEW'`; SQLite counts them only. The `ingress_accepted` audit payload carries `inserted/quarantined/content_mismatch/deleted/late/future`. Tests: `test_instagram_transport.test_late_and_future_messages_are_quarantined_not_dropped`; lab `test_postgres_state.test_late_and_future_messages_are_quarantined_with_counts`.
- **AGT-WEBHOOK-04** (`server.py`): receiver handler `timeout = 15`. Test: `test_instagram_transport.test_receiver_handler_has_socket_timeout`.
- **AGT-SEND-01** (`instagram.py`, `partner_notice.py`): new `InstagramRejected` for HTTP 4xx. Detail codes are `IG_WINDOW_EXPIRED`, `IG_REJECTED_<code>`, `IG_UNKNOWN_HTTP<status>` and `IG_UNKNOWN_<ExceptionClass>`. Status vocabulary is unchanged. Tests: `test_partner_notice.test_instagram_failures_record_detail_codes`, `test_instagram_transport.test_definite_rejection_is_4xx_only_and_oversized_bodies_keep_status`.
- **AGT-SEND-02** (`partner_notice.py`): the email UNKNOWN branch records `EMAIL_UNKNOWN_<ExceptionClass>`. The statement email path already stored the reason and is unchanged. Test: `test_partner_notice.test_unknown_email_does_not_retry`.
- **AGT-SEND-04** (`graph_email.py`, four email-capable units): `backup_credential` writes `outlook-email-oauth.json.bak` (0600, fsync) before the in-place rewrite. A failure is reported, not fatal. The units list the `.bak` path in `ReadWritePaths` with the `-` prefix. Tests: `test_email_fallback.test_refresh_token_rotation_backs_up_previous_credential_first`, `test_systemd_units`.
- **AGT-HOST-04** (six worker units): `Wants=` plus `After=` the proxy instead of `Requires=`. Test: `test_systemd_units.test_workers_want_but_do_not_require_the_proxy`.
- **AGT-PRIV-01** (`docs/OPERATIONS.md`): journald note on aggregate timer output, content-printing manual commands and retention. Documentation only; no test.
- **Owner decisions (16 October 2026)**: (1) count open REVIEW ingress rows in health reporting, no alert rule yet; (2) a changed retry of an already-consumed (DONE) message stays counted in the audit event only, no quarantine, no code change; (3) messages up to 60 s ahead of the receiver clock are accepted, beyond that REVIEW as before.
- **Owner decisions implemented** (`receipt_health.py`, `webhook.py`): `receipt_health.inspect` adds the integer field `ingress_review_open`, a read-only count of `ingress_work` rows in state `REVIEW` whose message is dated on or after `state_cutover_at` (late, future and changed-content holds; pre-cutover migration quarantine excluded; 0 on SQLite, which has no work table). It does not change `status`. The existing collector `project/scripts/monitoring/debian-health.py` exports every integer field of that snapshot as `custom.googleapis.com/mw_resource_monitoring/receipt_pipeline{field="ingress_review_open"}` without a collector change, so the metric reaches GCP Monitoring/Grafana once the agent package is deployed to the host; a dashboard card and any alert on it belong to the owner's Grafana revamp. `webhook.FUTURE_TOLERANCE_SECONDS = 60` is the clock-skew tolerance. Tests: `test_receipt_health.test_ingress_review_count_is_reported_without_degrading_status`, `test_instagram_transport.test_future_clock_tolerance_boundary` (60 s accepted, 61 s `FUTURE`, 24 h + 1 s `LATE` unchanged), collector `project/scripts/monitoring/test_debian_health.py` (`test_extra_integer_fields_such_as_ingress_review_open_are_exported`); lab `test_postgres_state.test_health_counts_open_review_ingress_rows_since_cutover`.

## Checks

Independent run by Agent C (Testing).

| Check | Command or setup | Result |
| --- | --- | --- |
| Unit suite | `python -m unittest discover -s tests -v` (integration-agent) | `Ran 370 tests`, `OK (skipped=43)` (18 isolated PostgreSQL 18 lab, 14 disposable PostgreSQL fixture, 6 private PostgreSQL lab, 3 isolated lab, 2 Debian Thai renderer) |
| PostgreSQL lab suites (7 modules) | Disposable UTF8 PostgreSQL 18 cluster (127.0.0.1:15511, root containing `agent-state-lab-`); `bootstrap.sql`; Flyway 13.6.0 migrate of `loan_manager_prod` to V92 after `Test-AppRolePrerequisites.sql`; `state_migration.migrate()` (V1–V4, then `[]`); `configure-reviewer-dml`; `business-grants.sql`; `mw_dml_test_ci`; `python -m unittest -v tests.test_postgres_state tests.test_postgres_dml_audit tests.test_conversation_dml tests.test_notice_acknowledgement tests.test_operator_audit_postgres tests.test_operator_execution_postgres tests.test_receipt_audit_postgres` | `Ran 49 tests`, `FAILED (errors=1)`: 48 pass. The one error is the pre-existing AGT-TEST-02 (`test_missing_marker_and_reviewer_schema_identity_changes_denied`, `ReadOnlySqlTransaction`), not in this wave. Cluster removed afterwards |
| Recovered modules equal host | `git show 58929d7:<path> \| cmp - <host copy>` for the 5 modules | identical |

Owner-decision follow-up (16 October 2026, Agent B): unit suite `Ran 373 tests`, `OK (skipped=44)`; `project/scripts/monitoring/test_debian_health.py` OK; `tests.test_postgres_state` on a fresh disposable UTF8 PostgreSQL 18 cluster (127.0.0.1:15510, `bootstrap.sql`, `state_migration.migrate()` V1–V4, roles `LOGIN`): `Ran 16 tests`, `OK`, cluster removed afterwards. The other lab suites were not rerun; the SQL change is limited to one read-only `SELECT count(*)` over `ingress_work` and `ingress_messages`.

Lab recipe deviations: `Test-AgentAuditPrerequisites.sql` was skipped because `bootstrap.sql` creates `mw_business_audit_owner`. V87/V88 needed roles created by hand (see Remaining work).

## Not run

| Item | Reason |
| --- | --- |
| Debian Thai renderer tests (2) | Host fonts are not in the test environment |
| Live Instagram, Graph and systemd behaviour | No host deploy in this wave (authorized scope) |
| Debian deploy | Not authorized in this wave |

## Recovery

Git baseline `a029880`; revert the wave commits. The host is unchanged, so production still runs the installed R058 tree. That tree equals the five modules of `58929d7` plus the unrestored dead `appsheet.py`. Unit-file changes take effect only after an authorized deployment and `systemctl daemon-reload`.

## Remaining work

- Deploy in Wave 2 with the R063 receiver fix. The units need `daemon-reload`. Create the `.bak` file once before the first rotation: the `-` prefix in `ReadWritePaths` binds only if the file exists, otherwise the first backup fails non-fatally (see [OPERATIONS](../docs/OPERATIONS.md)).
- After this branch merges, record in `project/Documents/Environment_Inventory.md` the `main` commit equal to the installed tree.
- Grafana revamp (owner): a Payment-dashboard card for `receipt_pipeline{field="ingress_review_open"}` and any alert on it. REVIEW rows have no automatic exit; an operator decision per held message is still manual.
- The SQLite journal counts late and future messages but does not store them. This matters only if PostgreSQL state is disabled.
- Owner awareness: R058 (deployed, recovered here) turns a transient Graph error during recipient preflight into a REVIEW `IG_PREFLIGHT_FAILED` with no email fallback. Pre-R058 code marked it UNAVAILABLE and fell back to email. Not changed in this wave.
- AGT-TEST-02 and AGT-TEST-04 (lab prerequisites: V87/V88 roles `mw_app_prod`, `mw_app_prod_journal_owner` and five `mw_notify_*_prod`/`mw_jobs_*_prod` roles were created by hand) go to Wave 3.
