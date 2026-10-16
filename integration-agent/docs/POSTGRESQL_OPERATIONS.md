# PostgreSQL state and audit

The owner-approved R015 implementation uses `mw_agent` on the existing Cloud SQL instance `clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914`. It contains 29 audit/runtime/migration tables plus the independent deployment history. These are internal agent records, never AppSheet data sources. Business data stays in `loan_manager_prod`; DEV stays in `loan_manager_dev`. Instance/network settings are unchanged.

## Governance

AppSheet is the preferred operational API for Find/Add/Edit/Delete. Codex chooses calls from current metadata and the current request; there are no scripts for individual business operations. Conversational mutations require the current authenticated Partner's AI Reviewer role, a current instruction quote, exact keys and fresh observations. Partner membership alone grants no editing authority. Receipt approval retains its separate existing policy.

SQL is a fallback: `api_gap:` requires a verified missing app/field/action capability; `atomic:` must explain the required transaction guarantee. SQL metadata and full canonical before-images support this fallback. Fixed reporting and authorization queries are separately authorized read-only database services. They are not model SQL tools.

Reviewer database DELETE is retired (16 October 2026): the plan parser refuses DELETE steps and the role holds DELETE only on Cash Ledger for the `cash_source_changed` trigger. A plan has at most 10 direct steps, 1,000 captured row effects and 10 MiB of captured images. Unexpected cascades roll back. Existing financial immutability, reference and cash-ledger guards continue to apply; approval does not bypass them. No DDL, arbitrary SQL, code, permissions or trigger settings are model-accessible.

`audit.operations` stores immutable intent; `audit.events` stores append-only events. Mutable status, queue ownership and journals live in `runtime`. All host/provider calls and journal mutations are recorded; sensitive image bytes, credentials and hidden reasoning are excluded. API audit coverage is observed before/after, not a claim of atomic capture of every API automation. SQL `agent_audit` triggers capture actual before/after rows and a commit marker in the business transaction. The relay copies events idempotently then acknowledges the source marker. It never uses a sequence high-water mark as a commit boundary.

Owner roles are NOLOGIN. Worker, relay and reporting/DML logins are separate, with explicit grants. Worker cannot change the generation control, schema or audit history. Relay cannot mutate business rows. Model inputs cannot select credentials or connection targets. Audit is append-only for runtime roles; the database administrator remains a trusted recovery authority. Retention/purge is not automated; see the design below.

## Cutover and recovery

1. Verify backups and restore the affected business databases privately. Apply the tested business Flyway migration in DEV, then pin the clean tested commit for PROD.
2. Provision the separate database and roles with `database/setup/bootstrap.sql` and run central immutable migrations explicitly (`state_migration`). No startup migration or automatic adoption. (The one-time provision script is retired.)
3. Freeze through `scripts/deploy-runtime.py freeze` as root on the verified VM. Stop timers, let workers finish, stop ingress, archive credentials/configuration/state/Codex sessions/package/systemd, restore privately and compare hashes. Keep the tunnel unchanged. During ingress pause, the origin is unavailable; no false successful acknowledgement is emitted.
4. Back up all six journals with `scripts/agent-state-admin.py backup --writers-stopped`, including immutable statement snapshots. Import one batch atomically and compare every source row, hidden ingress row ID, binary value, epoch, status and conversation binding. Do not import Codex-owned session/auth databases: retain their original files and private recovery copies.
5. Preserve existing service cutoffs and thread IDs. Establish a new backend generation and ingress cutover time. Newly arriving pre-cutover messages are quarantined; migration is not replay authorization. UNKNOWN, pending delivery and expiry history remain intact.
6. Install credentials as root:mwagent 0640, deploy the tested package/catalogue, verify configuration, apply business grants, then activate the generation and resume one owner for each timer/ingress. Install the relay timer. Record actual completion in the implementation log.

After PostgreSQL accepts new work, never switch back to stale SQLite. Stop affected workers, keep audit/commit evidence and repair forward or perform an explicitly reconciled recovery. A business commit with central acknowledgement failure stays UNKNOWN until the outbox marker, matching intent and final state prove it. Absence of a marker alone is not permission to retry. API UNKNOWN requires deliberate evidence-based reconciliation; no automatic resend.

The five worker timers, receiver and relay use at most eight central connections with the current process topology; each process has a one-connection pool. Connections are not held across model/provider calls. Timeouts are set at connect time from `state.parameters`, not from role settings (which do not apply after `SET ROLE`): statement 15 s, lock 3 s, idle-in-transaction 30 s. Generation fencing fails closed. A journal opened `readonly` rejects any non-SELECT before connecting and runs `SET TRANSACTION READ ONLY` (AGT-STATE-02). A statement that changes zero rows writes no `state_change` audit rows (AGT-STATE-01), so the 20 s expiry sweep no longer adds an operation and an event per cycle. Cloud SQL latency adds overhead to journal actions; measure the actual VM path at rollout. No instance resize or connection-limit change is included.

## Audit retention (design only)

Status: not installed and not run against production `mw_agent`. R063 W3 recorded the design only. The owner confirmed the export target on 16 October 2026: bucket `mw-credit-operator-private-737787224638`, prefix `agent-audit-archive/`. The job is still to be written.

A monthly job (`mw-audit-retention.timer`, to be written) would run as the owner role `mw_agent_owner` through the established admin route:

1. Export rows older than 12 months from `audit.events`, `audit.operations` and `runtime.job_runs` with `COPY (SELECT ... WHERE occurred_at < now() - interval '12 months') TO STDOUT`, gzip, upload to `gs://mw-credit-operator-private-737787224638/agent-audit-archive/<yyyy-mm>/` and verify the object SHA-256.
2. Only then, in one transaction, `ALTER TABLE ... DISABLE TRIGGER` on the append-only triggers, `DELETE` the exported rows (children first), re-enable the triggers, then `VACUUM (ANALYZE)`.
3. Write one `audit.operations` row (action `CONFIG`) with row counts and object names.

Any failure before step 2 completes leaves the data untouched. Do not run it by hand without a verified export.

## Database authentication (ALL-ARCH-03)

Config keys `database_auth` and `agent_database_auth` accept `password` (default) or `iam`; `database_iam_user` names the IAM database user and `iam_database_port` (5433) the proxy listener with `--auto-iam-authn`. With `iam`, each connection logs in as that one IAM user and runs `SET ROLE` to the agent role; no password file is read. `mw_reviewer_dml` and `mw_receipt_projector` stay on port 5432 with password files until a W4 migration relaxes the V33/V49/V50 `session_user` checks. Production uses `iam` for both keys since 16 October 2026 10:20 UTC (`300aeb5`); the IAM user `mw-integration-agent@clever-oasis-508610-n7.iam` is `NOINHERIT`, and its members `mw_agent_worker`, `mw_agent_relay` and `mw_integration_agent` have `INHERIT FALSE, SET TRUE`. Every IAM connection opens through `state.open_connection()` or `state.assume_role()`, which run `SET ROLE` as the first statement (state pool, `relay_health`, `outbox`, `acknowledge-receipt-notices.py`); `cash_statement` prefixes `SET ROLE` to its psql input. `project/scripts/monitoring/debian-health.py` follows `agent_database_auth`/`database_auth` and reads no password file under IAM. Still password-only: `scripts/inspect-cash-statement.py`, `scripts/test-postgres-access.sh` and `scripts/configure-postgres-access.sh`; they stop working when the cleanup removes the files. Steps, readbacks, rollback and the prepared cleanup (password files, `NOLOGIN`) are in the [W3 agent change note](../Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md#all-arch-03-retry-16-october-2026).

## Retrospective external-operator audit linkage

An operator-created SQL marker whose original plan is `direct_targets[0]` may use SHA-256 of PostgreSQL `jsonb::text` encoded as UTF-8 without a newline. This differs from the central canonical JSON hash. Never replace either digest or invent prior intent to make the generic relay accept it. The dedicated `operator_sql_reconciliation` contract validates both encodings independently and binds the exact source marker, transaction, operator labels and all ordered captured effects.

After explicit scoped owner approval, use `scripts/reconcile-operator-audit.py --manifest <private-file>` to plan. The private manifest must pin operation ID, original PostgreSQL and canonical hashes, marker/effect fingerprints, exact effect count and original evidence/repair authorization references. Verify a private backup and its restore/readback proof before adding `--apply --backup-reference <verified-reference>`. This appends truthful current-time retrospective linkage; it never performs business DML. Conflict, changed evidence or missing proof is a blocker. The source in-transaction timestamp is not an exact commit timestamp. Operator labels are not proof of reviewer membership.

Verify subsequent natural relay completions, exactly-once export events/acknowledgements and zero eligible backlog before declaring recovery. Do not rely on a transient green collector value while a worker is still running. Deployment/rollback is separately scoped through `scripts/deploy-runtime.py`; ordinary alert restart authority does not authorize this source change or reconstruction.

Schema sources: `database/migrations/` (central immutable history), business R015 V33 in AppSheet-Loan-Project, and `database/setup/` for separately managed roles/grants. The original design in `docs/design/agent-postgresql-20260922/` remains dated evidence.
# Receipt evidence extension — 27 September 2026

Independent central migration V4 is applied in `mw_agent`: immutable receipt source/asset/link metadata is separate from business Flyway V49/V50. Login `mw_receipt_projector` can execute only the guarded attachment function in the business databases; it has no direct Payments UPDATE. Original pictures stay in private GCS. [State, retries, deployment and recovery](RECEIPT_EVIDENCE.md). Existing journal generation, proxy, financial integrity triggers and audit relay are unchanged.


## Deployed durable operator execution and relay inspection

Installed MW source pin `0aaedf13` supplies canonical durable-intent execution and completed-job/backlog relay inspection; companion DEV/PROD V58 and collector pin `f63d2c8` were deployed on 4 October 2026. Independent central intent readback precedes business dispatch. Repeated/uncertain requests remain reconciliation-only. RUNNING cannot erase a completed failure. No new scheduled service or mw_agent migration was required. Natural relay completions and numeric health export verified Healthy with backlog/missing intents zero. Preserve the retrospective reconciliation. [Deployment, checks, pins and rollback](../Change%20Logs/CHANGE_NOTES_DURABLE_OPERATOR_AUDIT_HEALTH_2026-10-04.md).
