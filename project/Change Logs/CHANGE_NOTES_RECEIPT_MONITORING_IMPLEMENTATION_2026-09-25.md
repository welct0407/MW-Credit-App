# Receipt monitoring implementation — 25 September 2026

Owner authorized implementation of the existing handover. Monitoring is deployed and verified; no AppSheet/database promotion. R036 remains Open. Baseline `ab4e28551f9932e413c03b6c2daebbd0e4d74a54`; unrelated Risks redesign and r026 work preserved.

Changed collector validation and deployed the existing two-minute collector; activated numeric-only receipt pipeline telemetry. Added eight Performance visuals from group scanning through Partner notification, with unavailable/stale handling and queue trends. Updated existing Debian rule/contact for critical missing telemetry and query failures; no duplicate watchdog/alert route. Updated canonical jq queries, classic/V2 patcher, builder, saved dashboard definitions, tests, visual guide, operating reference and monitoring README. Linked completion from the Integration Agent handover.

[Implementation evidence](../outputs/receipt-monitoring-20260925/README.md) records exact targets, rollback files/versions, hashes, test results, metric descriptor/sample verification, saved dashboard generation27 and successful real IRM integration delivery. AppSheet model/dictionary/environment inventory and product promotion artifacts are unchanged because no app/schema/source mapping changed. No financial actions or borrower/reviewer messages were invoked.

Checks passed: 15 collector, seven jq fixture and eight installed worker-health tests, plus classic/V2 preservation/idempotence checks. Saved dashboard visually checked and original50 panels/five row layouts preserved. Phone display was not independently verified; Grafana reports successful IRM delivery. Two notified holds and one overdue review remain business work, not monitoring implementation defects.

Rollback restores only the backed-up collector and prior affected dashboard/rule versions. Preserve business state and all unrelated monitoring. Commit/push intended sanitized source/evidence under standing publication authorization.
