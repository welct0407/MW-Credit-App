# R015 — Agent PostgreSQL audit and reviewer operations

22 September 2026. Owner authorized execution of the approved integration-agent PostgreSQL handover. Starting business repository commit: `3060b2995f4b63d05e09af86c80b452e14f1578d`, clean main. R015 reserved; V33 is the next candidate migration, pending implementation/test. Both AppSheet definitions remain unchanged; audit tables will not be app data sources.

Scope: additive internal `agent_audit` tables/functions/capture triggers, separately managed restricted roles/grants, coordinated agent state/audit rollout in `MW-Integration-Agent`. Approved reviewer DELETE retains all existing business guards. No business-data correction or notification is a deployment test.

Status: implementation in progress; no live database change at reservation. Relevant backups/restore checks, laboratory/DEV tests, exact package promotion, final validation and documentation remain pending. Rollback: pre-change Git checkpoint for source; live assets require verified recovery before mutation. Additive audit history must be preserved after rollout; old uninstrumented reviewer DML cannot be re-enabled against the new capture triggers.
