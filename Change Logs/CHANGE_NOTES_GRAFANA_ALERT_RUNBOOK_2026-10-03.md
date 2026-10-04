# Grafana alert troubleshooting runbook — 3 October 2026

## Scope and purpose

The owner requested a Markdown runbook in `Documents` for OpenAI Dots to troubleshoot the already documented Grafana alerts, explicitly without inspecting live configuration again. This is documentation-only work; no product release number is required.

Starting Git commit / rollback reference: `a460295d8e50f82541c0e10c1bdc0af86a5ac5ca` on `master`. Drafted in isolated branch/worktree `codex/grafana-alert-runbook`. Existing unrelated modifications to `scripts/metabase/PartnersTab.mjs`, the risks-redesign log, untracked release/risk outputs and `scripts/metabase/RefinePartnerShare.mjs` remain outside this batch.

## Changes

- Added [Grafana Alert Troubleshooting Runbook](../Documents/Grafana_Alert_Troubleshooting_Runbook.md): ordered triage, all 10 documented rule UIDs/thresholds, every Debian component, receipt/review/posting distinctions, Metabase Live/PITR/scheduled backups, capacity diagnosis, telemetry/delivery failure, routing, bounded recovery decisions, verification and a Dots incident-report template.
- Linked the runbook from `Documents/README.md`, `Documents/Dots_Orchestration_Rules.md` and `Documents/Resource_Monitoring.md`. Existing Custom rule bodies and their character counts are unchanged.
- Reconciled stale monitoring summaries with already recorded 26 September evidence: 10 rules, four multi-instance rules, 23 availability/data tiles, five Metabase component instances and the separate scheduled-backup rule. The ninth non-Debian rule also retains KeepLast. No rule was added or changed live.
- Aligned `Documents/Resource_Monitoring_Dashboard_Guide.md` with the existing 2 October receipt correction: optional Partner-result delivery failures remain visible without degrading receipt processing. Pending live metadata alignment remains explicitly pending.

Source basis: monitoring operating reference, visual guide, original alert change log, Metabase recovery-monitoring change log, maintained monitoring README/selectors and current Dots/workflow/account-routing documents. Historical setup and test records remain dated evidence, not present service-health claims. External owning runbooks are linked for incident-time use; no outside agent was contacted.

## Authority and rollback

The procedure preserves the existing Dots policy: only an already-enabled eligible worker or demonstrably failed/unprocessed record may use its documented bounded recovery path; uncertain payments/sends remain reconciliation-only. It grants no code/configuration/schema/access/schedule/alert edits, infrastructure restart, external message or production deployment authority.

Rollback is a normal revert of this documentation commit after checking for later edits. No live asset changed, so no AppSheet version, dashboard copy, database backup or service rollback was required. No dictionary definitions, release tracker, environment identities or development differences changed.

## Verification and status

Documentation checks passed: saved-file/diff review; 87 local Markdown links and 15 heading anchors resolve; all 10 rule UIDs, 12 Debian components and five Metabase component labels are covered; all seven existing Dots Custom rule bodies are unchanged; `git diff --check` is clear. Thresholds, freshness/KeepLast exceptions, backup grace and optional notification behavior were compared with the affected repository references. Only the six intended Markdown files form this publication batch.

Status: documentation complete, for normal commit/push to the original `master` upstream under standing repository publication authority. The publication commit is recorded by Git history and verified in the task result. No live Grafana/provider/worker configuration, credentials, borrower records or alert delivery was queried; no recovery action or test notification was performed.

Live limitation: this runbook is grounded in existing repository evidence, not an incident drill. Future incidents require the fresh targeted observations and recovery verification described in the runbook. The previously documented live receipt-description/panel-text correction remains outstanding and is not implemented by this task.
