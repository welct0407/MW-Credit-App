# Review wave 1 — agent runtime recovery and fixes — 2026-10-15

Findings from [the independent review](CHANGE_NOTES_REVIEW_AGENT_2026-10-15.md). Starting commit `a029880` (main); branch `claude/review-w1-agent`. No deployment, no Debian host write, no migration, no grant.

## Scope

| Finding | Change | Test |
| --- | --- | --- |
| AGT-DEPLOY-01 | The five modules that differ between `main` and the installed production package (R058, `a8cf949`) are restored byte-for-byte from the host's site-packages (read-only over `mw-debian-ssh`): `instagram.py`, `partner_conversation.py`, `partner_notice.py`, `statement_delivery.py`, `statement_run.py`. `appsheet.py` is installed-only, imported by nothing and retired by R057; not restored. `a8cf949`'s own tests were unavailable (archived repository unreachable), so the unit tests were rewritten to the deployed behaviour: no local 24 h window gate, email fallback only after an explicit provider window-expiry rejection, definite 4xx is `REJECTED`, UNKNOWN never falls back, long conversation replies are held `REVIEW`. The old `check_window` import had hidden all 10 `test_cash_statement` tests (353 → 344). | `test_partner_notice`, `test_review_cycle`, `test_cash_statement`, `test_email_fallback`, `test_instagram_transport`, lab `test_postgres_state` deferral test |
| AGT-WEBHOOK-01 | `is_deleted` events are skipped and counted. A changed retry of a known message id no longer fails the POST with 503: its still-`PENDING` `ingress_work` row is set to `REVIEW`, consumed rows are left alone, the other messages commit, the receiver answers 200. | `test_instagram_transport.test_deleted_messages_are_skipped_and_counted`; lab `test_postgres_state.test_atomic_ingress_duplicate_and_changed_message` |
| AGT-WEBHOOK-02 | Late (> 24 h) and future-dated messages are returned with a `quarantine` reason; PostgreSQL stores them as `ingress_work.state='REVIEW'` through the existing cutoff quarantine (no schema change), SQLite (no work table) counts them. The `ingress_accepted` audit payload carries `inserted/quarantined/content_mismatch/deleted/late/future`. | `test_instagram_transport.test_late_and_future_messages_are_quarantined_not_dropped`; lab `test_postgres_state.test_late_and_future_messages_are_quarantined_with_counts` |
| AGT-WEBHOOK-04 | Receiver handler `timeout = 15`. | `test_instagram_transport.test_receiver_handler_has_socket_timeout` |
| AGT-SEND-01 | `InstagramRejected(InstagramAPIError)` for HTTP 4xx (Graph code retained; window-expiry classification unchanged). `detail_code` gives `IG_WINDOW_EXPIRED`, `IG_REJECTED_<code>` or `IG_UNKNOWN_HTTP<status>`; the generic failure branch records `IG_UNKNOWN_<ExceptionClass>`. Status vocabulary unchanged (R058 already records definite 4xx as terminal `REJECTED`). | `test_partner_notice.test_instagram_failures_record_detail_codes`, `test_instagram_transport.test_definite_rejection_is_4xx_only_and_oversized_bodies_keep_status` |
| AGT-SEND-02 | Email UNKNOWN branch records `EMAIL_UNKNOWN_<ExceptionClass>`. The statement email path already stores `detail=str(exc)` for both outcomes; not changed. | `test_partner_notice.test_unknown_email_does_not_retry` |
| AGT-SEND-04 | `graph_email.backup_credential` writes `outlook-email-oauth.json.bak` (0600, fsync) before the in-place rewrite; failure is reported, not fatal. The four email-capable units list the `.bak` path in `ReadWritePaths` with the `-` prefix; the operator creates the file once (command in [OPERATIONS](../docs/OPERATIONS.md)). | `test_email_fallback.test_refresh_token_rotation_backs_up_previous_credential_first`, `test_systemd_units` |
| AGT-HOST-04 | Six worker units use `Wants=` + `After=` the proxy instead of `Requires=`. | `test_systemd_units.test_workers_want_but_do_not_require_the_proxy` |
| AGT-PRIV-01 | Journald note in [OPERATIONS](../docs/OPERATIONS.md): aggregate timer output, content-printing manual commands, retention still to be read by a journal-capable identity. | none (documentation) |

## Checks

- Unit suite: `python -m unittest discover -s tests -v` → `Ran 370 tests`, `OK (skipped=43)` (one new lab test adds a skip).
- Disposable PostgreSQL 18 lab (UTF8 cluster on 127.0.0.1:15509, `bootstrap.sql`, `state_migration.migrate`, roles `LOGIN`): `tests.test_postgres_state` → 15 tests OK, including the two new ingress tests. Cluster stopped and removed afterwards. The other lab suites were not run here.
- Byte equality of the five recovered modules with the host copy verified with `cmp` after commit.

## Rollback

Git revert of the wave commits. Unit-file changes take effect only after an authorized deployment (`systemctl daemon-reload`); the `.bak` file is optional until created.

## Remaining work

- Deploy: new unit files, `.bak` file creation, receiver restart (R063 helper work is separate).
- Environment inventory should record the `main` commit equal to the installed tree once this wave merges.
- Lab suites other than `test_postgres_state` to be run by the testing worker.
