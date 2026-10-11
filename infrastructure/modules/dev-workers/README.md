# DEV notification and canonical job workers

R053 uses two private Cloud Run services and separate IAM/SQL identities. The DEV root calls this module from `workers.tf`; it does not manage PROD or alter the shared SQL instance. `enabled=false` creates nothing. Enrollment (`enabled=true`, no image) creates fourteen prerequisites only. Runtime requires a reviewed immutable DEV image and explicit numeric notification-policy/VAPID versions. Worker activation and schedule activation are independent flags, all false by default.

| Worker | Identity prefix | Fixed POST route | Bangkok schedule |
| --- | --- | --- | --- |
| Notification dispatcher | `mw-credit-app-notify-dev` | `/internal/dispatch` | Every minute |
| Canonical jobs | `mw-credit-app-jobs-dev` | `/internal/jobs/daily-charges` | 00:05 daily |
| Canonical jobs | Same jobs identity | `/internal/jobs/recent-analytics` | Hourly at minute 0 |

The caller `mw-credit-app-scheduler-dev` receives only service-scoped `run.invoker` on these workers. Both use internal-only ingress and enforce Cloud Run IAM; application code additionally verifies Google's OIDC token against the exact caller and audience. The documented deterministic default URL `https://SERVICE_NAME-PROJECT_NUMBER.REGION.run.app` supplies the audience without a Terraform self-reference ([Cloud Run HTTPS invocation](https://docs.cloud.google.com/run/docs/triggering/https-request)). Same-project Scheduler calls to default URLs are accepted as internal ([ingress documentation](https://docs.cloud.google.com/run/docs/securing/ingress)).

Both disabled runtimes and the jobs worker scale to zero. Only an explicitly enabled notification worker uses service-level minimum one with allocated CPU (`cpu_idle=false`) for its immediate PostgreSQL LISTEN loop; revision minimum remains zero to avoid warming historical revisions. This incurs always-on instance billing and stays blocked pending the owner cost decision. Region is `asia-southeast1`. Both remain at most one configured instance/concurrent HTTP request, 1 CPU/512MiB, 120-second request timeout. The dispatcher uses one dedicated listener plus pool maximum two SQL connections (three per instance); transient revision overlap can exceed that count, so durable leases remain required. Scheduler deadline is 150 seconds. Transactional empty NOTIFY on `mw_pwa_notifications_v1` wakes the durable dispatcher immediately; LISTEN then backlog drain closes restart gaps. The minute tick is recovery only. Jobs have five retries bounded to ten minutes, with database boundary checks/idempotency authoritative; a previous day's charge run is never silently replayed. No queue, public invoker, database-wide setting, bucket grant or VAPID access for jobs is added.

Dispatcher receives the existing Firebase user-read custom role and access only to the existing DEV VAPID container and new DEV notification-policy container. Payloads never enter Terraform. Reuse VAPID version 1 only after validating its P-256 pair privately; do not rotate it to fill missing local files. The approved subject is `mailto:welct0407@mw-credit.com`. Command enrollment optionally receives the policy and public key, never VAPID private access. Jobs receives neither notification secret.

## Delivery sequence

1. Review the current DEV state and preserve its private before-image. Apply only the exact reviewed enrollment plan. The initial R053 plan intentionally targets this isolated module: checked-in legacy DEV defaults are stale and must not be used to roll back current reader/command images or shared authentication settings. This is bounded enrollment evidence, not a full-root no-drift claim.
2. Apply B's reviewed DEV SQL migration and fixed capability grants. Verify each new DEV identity remains unable to CONNECT to PROD; grant no direct protected-table access. Reuse the existing state/backend and project; do not provision a new database.
3. Run `scripts/notifications/Prepare-DevNotificationPolicy.ps1` with a new private `candidate-policy` output path. It verifies the pinned Firebase owner and current DEV Partner mapping without printing identifiers. An enrollment-only policy has a null endpoint hash and is rejected by the worker parser. Publish the exact reviewed file separately to Secret Manager and record the numeric version/hash; Terraform never reads its payload.
4. Enable command enrollment with the tested command image, existing public VAPID key and policy pin. Capture the actual owner-controlled subscription before preparing a subsequent policy with its exact endpoint SHA256. Never invent a subscription or endpoint hash.
5. Bind `services/workers/server.mjs`, the same reviewed image, exact SQL registered creators, numeric secrets and fixed audience. Review a saved plan with both worker activation flags false and all schedules paused. Persist the applied private variable set so later plans do not revert enrollment.
6. Only after root-reviewed DEV owner notification checks and AppSheet single-owner handoff, enable the intended worker/schedule flags. Existing AppSheet jobs remain authoritative until the recorded handoff. No PROD activation is implied.

## Checks and recovery

Use Terraform 1.16.5/Google provider 8.6.0, an external private `TF_DATA_DIR`, `fmt`, `validate`, and module `terraform test`. DEV root's focused mock tests target command/module resources to avoid the unrelated legacy Google-IDP import and real secret reads. These tests establish contracts, not live SQL or delivery success. New runtime and delivery acceptance must use actual DEV identities and owner device evidence.

Pausing notification Scheduler alone does not stop the listener. Disable the notification worker (and reconcile its capture/ownership boundary) for delivery containment; pause schedules and disable jobs for job recovery. preserve captured event/job ledgers and investigate uncertain sends rather than replaying. Secret containers and runtimes have deletion protection; SQL users use ABANDON. Do not destroy shared resources or restore PUBLIC PROD CONNECT. Private state/plans and owner policies are recovery/operational material, not disposable because source is published.

