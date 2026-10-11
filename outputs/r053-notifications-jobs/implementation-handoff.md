# R053 implementation handoff

Baseline app source: `2ee8bee2b7c1dc65641f8e8fd5f993ef56f8f192`. B preserved existing unrelated modifications. This is an implementation checkpoint, not DEV delivery or PROD authorization. A owns the design, C the independent SQL proof, D the operator/delivery records, and F infrastructure.

## Implemented boundaries

- V88 reuses the five V86 tables. Six authenticated API functions, six dispatcher functions and one atomic job function replace direct runtime access to protected tables. Private helpers and capture are not runtime entrypoints. Environment-specific closed owner/capability roles must exist before migration; runtime roles get only their assigned function capability. Jobs-owner canonical dependencies require the independently tested narrow operator grant manifest.
- Capture reads its exact function's catalog-owned `application_name` setting: only `application_name=mw_pwa_capture_enabled_v1` enables capture; the migration installs `mw_pwa_capture_disabled_v1`. Missing, RESET or unknown metadata is closed. Caller application_name and the old custom GUC cannot activate it. This managed-PostgreSQL correction avoids parameter ACL changes; the function setting temporarily changes diagnostic application_name and restores it on exit. Successful new event insertion sends an empty transactional `mw_pwa_notifications_v1` signal. Loan close occurrences use a row-lock-serialized ordinal; payment posting remains one occurrence per payment. The listener treats signals only as untrusted wake hints.
- The notification worker uses one dedicated guarded autocommit LISTEN connection plus the existing maximum-two-connection RPC pool. Each successful LISTEN is followed by durable catch-up. Signals and recovery HTTP coalesce into one serial drain; full runnable batches rearm immediately. Reconnect uses bounded jitter. Shutdown stops new claims and closes the listener, retaining existing fencing/uncertainty behavior for started sends.
- Candidate selection is bounded and excludes existing deliveries. Definite external ineligibility records a cancelled delivery so it cannot starve later candidates; temporary Firebase lookup failure defers it. Claims are acquired one at a time before sending. Current mapping, consent and subscription version are rechecked at SQL boundaries.
- The job RPC persists the canonical result count and completion atomically with the financial operation, returning the same count on replay. HTTP jobs require authenticated Scheduler identity and its original schedule timestamp; previous boundaries, future invocations and excessive delay are rejected before effects. Daily retries are bounded to one hour; recent analytics retries to ten minutes.
- DEV and PROD notification API composition remains explicitly gated. API receives public VAPID key only. DEV enrollment pins owner subject/email/Partner; its initial policy permits an explicitly null device hash, while enabled dispatch requires the enrolled endpoint hash. Jobs receives no notification secrets.
- Notification UI separates account-wide preference from device registration/revoke, adds own-device status and history pagination, and preserves explicit permission requests and authenticated deep links.

## Runtime contract

Entrypoint: `node services/workers/server.mjs`.

Common environment: `APP_ENV`, `WORKER_ROLE` (`notify` or `jobs`), `WORKER_ACTIVATION` (absent/disabled or explicitly enabled), `APPLICATION_PROJECT_ID`, `INSTANCE_CONNECTION_NAME`, `DB_NAME`, `DB_USER`, `RUNTIME_SERVICE_ACCOUNT`, `WORKER_AUDIENCE`, `SCHEDULER_SERVICE_ACCOUNT`, `SQL_REGISTERED_CREATORS_JSON`. The loader binds exact DEV/PROD database and dedicated identity names. Notification-only private inputs: `NOTIFICATION_POLICY_JSON`, `WEB_PUSH_VAPID_JSON`; subject: `WEB_PUSH_SUBJECT`. Secret numeric version bindings belong to infrastructure/delivery records, not this file.

Routes: GET `/health` returns minimal no-store health without database/provider work, including disabled composition. Private POST `/internal/dispatch` acknowledges a recovery wake with HTTP 202. Private POST `/internal/jobs/daily-charges` and `/internal/jobs/recent-analytics` require an empty body and `X-CloudScheduler-ScheduleTime`; job selection cannot come from a body. OIDC audience and scheduler email are exact. Browser notification routes remain under the command API.

## Focused checks performed by B

- Existing notification validation/encryption/default-off tests passed (five cases).
- New RPC adapter tests passed (four cases).
- Worker configuration, owner/device policy, identity, disabled health, original schedule boundary/age and no-effect rejection tests passed (seven cases).
- Listener ordering, wake coalescing, serial drain, immediate rearm and reconnect catch-up tests passed (two cases).
- Existing actual-browser denial/unsupported/authenticated deep-link test passed. New mobile own-status/device-revoke/history-pagination/no-auto-permission test passed.
- Actual packaged worker child-process bootstrap/health passed with activation disabled and no credentials. Docker packaging includes the worker entrypoint and runtime dependencies; F's infrastructure environment keys and startup route match the loader.
- Real Vite production-artifact contract passed (three cases), including embedded runtime configuration and no DEV fallback. Windows sandbox `realpath` denial required the scoped unsandboxed rerun; no source workaround or deployment was performed. Its exact task-owned build scratch was removed.
- TypeScript no-emit and scoped whitespace checks passed.

C separately owns real PostgreSQL compilation, restricted-role, canonical financial parity, notification races and transactional NOTIFY evidence. Relevant V88 edits invalidate older migration hashes; use C's final pinned proof. No full CI was run by B, no live SQL/provider action was taken, and no disposable PostgreSQL cluster or browser profile was retained by B. Final checkpoint, operator provisioning, DEV enrollment/delivery, scheduler takeover and publication remain coordinated work.
