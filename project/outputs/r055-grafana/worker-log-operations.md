# PWA worker platform incident queries

Read-only Cloud Logging queries using existing authorized operator credentials. Do not invoke Scheduler, job HTTP routes, notification dispatch, payments or receipt commands to generate samples. Replace `prod` with `dev` only for the intended environment; project remains fixed.

## Jobs request execution

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mw-credit-app-jobs-prod" AND jsonPayload.component="jobs" AND (jsonPayload.event="failed" OR jsonPayload.event="rejected")' --project=clever-oasis-508610-n7 --freshness=24h --limit=50 --format='table(timestamp,jsonPayload.event,jsonPayload.job,jsonPayload.code,jsonPayload.requestId)'
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mw-credit-app-jobs-prod" AND jsonPayload.component="jobs" AND jsonPayload.event="completed"' --project=clever-oasis-508610-n7 --freshness=24h --limit=50 --format='table(timestamp,jsonPayload.event,jsonPayload.job,jsonPayload.requestId)'
```

`completed` means the typed atomic job RPC returned successfully; it may be an idempotent replay. Request ID records the intended job/day/hour when available. This is not an independent financial reconciliation or a measured last-successful-business-boundary gauge. `rejected` includes malformed schedule/body or stale boundary, while `failed` is an execution exception. Missing rows may mean no request, query permissions/retention or unavailable telemetry—not proof of success. Compare intended Scheduler schedule and actual request logs through existing infrastructure tooling; do not rerun the job as a diagnostic.

## Notification dispatcher request execution

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mw-credit-app-notify-prod" AND jsonPayload.component="notify" AND (jsonPayload.event="failed" OR jsonPayload.event="completed")' --project=clever-oasis-508610-n7 --freshness=2h --limit=50 --format='table(timestamp,jsonPayload.event,jsonPayload.code)'
```

Completion means the bounded dispatcher returned. It may have claimed zero deliveries or left deferred/uncertain/ineligible states. It does not prove provider acceptance or device receipt; the existing runtime does not log queue depth or every delivery outcome. HTTP4xx/5xx charts are platform failure/rejection signals only. Protected queue-age, uncertainty totals and exact scheduled-boundary freshness are future telemetry enhancements, explicitly outside this focused platform batch. No protected-table grants, SQL changes or worker redeployment are required by these queries.

The queries project only timestamp, fixed event/code/job and nonpersonal intended-boundary request ID. Avoid unrestricted log payload exports. Authentication/permission errors remain errors, never translated to an empty healthy result. These commands are maintained incident instructions; execution/results are not claimed by their presence.
