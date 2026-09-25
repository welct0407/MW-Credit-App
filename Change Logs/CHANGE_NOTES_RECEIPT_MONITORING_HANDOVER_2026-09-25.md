# Receipt monitoring handover — 25 September 2026

Owner initially authorized reuse of Grafana/IRM and requested a dedicated group of end-to-end payment visuals. The final direction reserves this task for worker review/fixes plus an implementation handover; another model will configure monitoring.

Baseline: `74912733825a441283071f44a7b347d979b38566`. Preserve unrelated Risks redesign and r026 output work. No AppSheet, business database, dashboard, alert, credentials, monitoring timer or live collector changes. This is prepared tooling/documentation, not a product promotion; R036 remains Open.

Changed `scripts/monitoring/debian-health.py`: prepared integration with worker `receipt_health.inspect`, combined service/queue health, failed inspection as Down, ten-minute receipt runtime threshold, and numeric-only `receipt_pipeline` snapshots. **Not installed or live-export verified.** The worker module is maintained/deployed separately in MW-Integration-Agent.

Authoritative implementation handover: [MW Integration Agent monitoring handover](https://github.com/welct0407/MW-Integration-Agent/blob/main/docs/MONITORING_IMPLEMENTATION_HANDOVER.md). It defines metrics, stage visuals, stale/no-data alert gaps, existing Grafana/IRM identities, rollback, synthetic tests and live acceptance. Another implementation task must update the dashboard guide with saved live panel definitions and rules.

Checks: all 10 existing collector timer tests pass; Python compilation passes. No monitoring execution or forced notification. Rollback for this integration is the baseline collector source; future live deployment must first capture its current installed file and Grafana versions. Existing current-state dashboard documentation stays authoritative; added links explicitly identify pending work.
