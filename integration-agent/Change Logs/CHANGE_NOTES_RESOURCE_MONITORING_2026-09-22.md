# Infrastructure monitoring — 22 September 2026

Owner requested Grafana availability cards for Debian services and its dependencies. Runtime source baseline: `0a6845958eb2d5a5e07c96a848ab289bfbda8351`; no application package/configuration or business state was replaced. Added a separately installed read-only monitor and systemd service/timer as documented in docs/OPERATIONS.md. Source/tests/dashboard evidence are maintained in AppSheet-Loan-Project under scripts/monitoring and outputs/resource-monitoring-20260922. The existing business service catalogue/activation flags remain unchanged.

Verified successful local checks/metric export, active monitor timer, existing workers left running, read-only SQL/API probes, and local Codex readiness. Eight timer/group tests plus thirteen dashboard selector tests cover stale/missing/failing states. External webhook checks run in three GCP locations. No new business messages, model prompts or financial writes were used as tests.

Rollback disables/removes only mw-resource-health.timer/.service and /opt/mw-resource-monitoring/debian-health.py. Existing application journals, timers, credentials and package remain intact. Status: monitoring deployed; operations reference updated. Tailscale is node health only; AppSheet availability is API-only and Codex readiness does not test inference/quota.
