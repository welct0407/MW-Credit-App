# R015 — Agent PostgreSQL audit and reviewer operations

22 September 2026. Owner authorized execution of the approved integration-agent PostgreSQL handover. Starting business repository commit: `3060b2995f4b63d05e09af86c80b452e14f1578d`, clean master. R015 reserved; V33 is the next candidate migration, pending implementation/test. Both AppSheet definitions remain unchanged; audit tables will not be app data sources.

Scope: additive internal `agent_audit` tables/functions/capture triggers, separately managed restricted roles/grants, coordinated agent state/audit rollout in `MW-Integration-Agent`. Approved reviewer DELETE retains all existing business guards. No business-data correction or notification is a deployment test.

Status: implementation in progress; no live database change at reservation. Relevant backups/restore checks, laboratory/DEV tests, exact package promotion, final validation and documentation remain pending. Rollback: pre-change Git checkpoint for source; live assets require verified recovery before mutation. Additive audit history must be preserved after rollout; old uninstrumented reviewer DML cannot be re-enabled against the new capture triggers.

## Implementation and DEV verification

V33 adds three append-only `agent_audit` tables, fixed marker/capture functions and ten capture triggers for the dedicated reviewer login. AppSheet identities bypass this audit attribution path; definitions, public columns and workflows are unchanged. Restricted business grants are separately managed in the integration-agent repository. `Test-Migrations.ps1` provisions the required NOLOGIN owner only inside its disposable lab.

Full `Test-CI.ps1` passed on PostgreSQL 18.6, including immutable migration replay/checksum checks, core payment, loan close, charge generation, default and analytics checks and concurrency tests. Private V32 DEV/PROD dumps were independently restored: all 22 table fingerprints match, and V33 rehearsals pass. See backup and DEV validation evidence in `outputs/r015-20260922/`.

V33 applied to DEV successfully on 22 September 13:43 Bangkok. Ten capture triggers and denied reviewer audit INSERT/schema CREATE/relay business DELETE privileges verified. Current DEV editors show Deployed, unchanged saved versions and no issue badge; fresh previews loaded. AppSheet tables/columns/expressions and API schema versions unchanged; audit tables remain excluded.

Separate Cloud SQL `mw_agent` database provisioned with central V1–V3; agent source e0f050b published. Before coordinated PROD promotion, agent workers drained and ingress paused; private package/config/state/session archive restored and 3,513 file hashes matched. No production financial test or message is authorized by this check.

Status: DEV verified, production SQL and agent state cutover in progress. Use the single promotion checklist. Backups are private outside Git; published evidence contains only fingerprints/counts. Additive rollback retains audit evidence; never run the old uninstrumented reviewer writer against V33 or restore stale SQLite after new central work.
