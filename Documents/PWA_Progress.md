# MW Credit current progress

Updated 14 October 2026 from published deployment and owner-acceptance records; no new live audit.

Production: **https://lm.mw-credit.com**. DEV: **https://dev-lm.mw-credit.com**. The owner accepted the core operational/management flows and subsequent UI release. Notifications, jobs and the agent's native API integration are deployed. AppSheet has no operational role.

| Capability | Current state |
| --- | --- |
| Operational and management screens | PWA/API production |
| Payment receiving | PWA and Debian agent use native authenticated API/SQL commands |
| Receipts | Private GCS; existing evidence and compatibility references retained |
| Push | Post-commit Web Push, minute recovery, no always-on listener |
| Jobs | Native daily charges and hourly recent analytics |
| Monitoring | Native probes, Grafana dashboards and event bridge |
| Database | Last verified DEV/PROD Flyway V91 |
| AppSheet | Four definitions paused; bots, API/key access, sources and stores disabled/removed |
| Development | R058 sole Open; R059 next |

Remaining follow-ups: owner license revocation is unconfirmed; Lisa's post-fix push retry and natural business observations retain the limits in their owning deployment evidence; paused credential work remains in the infrastructure cleanup record. Do not invent completion or repeat accepted checks for documentation closure.

See [tracker](Release_Tracker.md), [environment inventory](Environment_Inventory.md) and [delivery policy](PWA_Orchestration.md).