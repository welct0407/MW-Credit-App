# R053 implementation handoff

Baseline app source: `2ee8bee2b7c1dc65641f8e8fd5f993ef56f8f192`. B preserved existing unrelated modifications. This is an implementation checkpoint, not DEV delivery or PROD authorization. A owns the design, C the independent SQL proof, D the operator/delivery records, and F infrastructure.

## Implemented boundaries

- V88 reuses the five V86 tables. Six authenticated API functions, six dispatcher functions and one atomic job function replace direct runtime access to protected tables. Private helpers and capture are not runtime entrypoints. Environment-specific closed owner/capability roles must exist before migration; runtime roles get only their assigned function capability. Jobs-owner canonical dependencies require the independently tested narrow operator grant manifest.
- Capture reads its exact function's catalog-owned `application_name` setting: only `application_name=mw_pwa_capture_enabled_v1` enables capture; the migration installs `mw_pwa_capture_disabled_v1`. Missing, RESET or unknown metadata is closed. Caller application_name and the old custom GUC cannot activate it. This managed-PostgreSQL correction avoids parameter ACL changes; the function setting temporarily changes diagnostic application_name and restores it on exit. Successful new event insertion sends an empty transactional `mw_pwa_notifications_v1` signal. Loan close occurrences use a row-lock-serialized ordinal; payment posting remains one occurrence per payment. The listener treats signals only as untrusted wake hints.
- Current owner-approved revision removes resident LISTEN and transactional NOTIFY. The command API requests an authenticated empty POST after acknowledged COMMIT and client release; wake failure cannot change financial success. The notify handler awaits bounded drain before 200 and owns work only while the request is active. Original frontend deadlines include token acquisition, are clamped by server limits and reserve response time. Minute Scheduler recovery remains independent. Started sends retain existing fencing/uncertainty semantics.
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

C separately owns real PostgreSQL compilation, restricted-role, canonical financial parity, notification races and request-driven post-commit evidence. Relevant V88 edits invalidate older migration hashes; use C's final pinned proof. No full CI was run by B, no live SQL/provider action was taken, and no disposable PostgreSQL cluster or browser profile was retained by B. Final checkpoint, operator provisioning, DEV enrollment/delivery, scheduler takeover and publication remain coordinated work.

### 12 October request-driven revision (in progress)

Default-off command dispatch uses NOTIFICATION_DISPATCH_ENABLED, NOTIFICATION_DISPATCH_URL and NOTIFICATION_DISPATCH_AUDIENCE. Exact command/Scheduler identities may invoke notify; jobs remain Scheduler-only. No agent dispatch identity is granted: the approved shared receipt-payment API is a separate pending implementation. Focused postcommit/worker/business tests passed (18, followed by 8 worker tests with the new notify case), and root TypeScript compilation passed. No full CI or live action. Previous listener-specific checks are historical and invalidated.


### Shared receipt-payment API candidate — 12 October

`services/agent-receipts/contract.mjs` is the dedicated schema7 serializer. `runtime.mjs` supplies exact machine-only POST/status routes, privately pinned Google workload identity, fresh actor mapping and transaction handling. V89 adds two SECURITY DEFINER functions under the existing environment journal owner and replaces the capture function body to remove the SQL hint while preserving its exact owner, OID, ACL, execution mode and full proconfig; PUBLIC is revoked and D grants EXECUTE only to the exact command SQL principal. The browser V3–V6 parser is unchanged. Native Processing/Lump Sum triggers preserve transfer minute, reference and actor. The command journal/capture/financial work commit together; image attachment remains the existing later agent projector.

Agent candidate: `C:/GitHub/MW-Integration-Agent`, branch `codex/r053-postcommit-notifications`, baseline38d3739. Default-off receipt_payment_api transport requires explicit timezone cutoff; only unattempted eligible new jobs change route. Existing pwa IDs reconcile status/readback; legacy missing/igr IDs remain legacy readback, and earlier approved jobs remain AppSheet. No generic reviewer hook, direct agent push permission or production configuration change. Catalogue26 is implemented/disabled.

Checks completed by B: schema7/route-local OIDC/commit-wake3 tests, existing production-business7 tests, TypeScript; agent config6 and adapter7 tests. C independently reports actual V89 compilation plus native financial parity/replay/foreign-workload denial; C owns exact evidence/hashes and remaining operator/projector/status tests. Final source/CI freeze remains coordinated; no broad suite by B.

B app publication allowlist for this revision (preserve all unrelated dirt):

- apps/pwa/src/BorrowerRecord.tsx
- apps/pwa/src/LoanClose.tsx
- apps/pwa/src/OperationConfirm.tsx
- apps/pwa/src/PaymentResult.tsx
- apps/pwa/src/SelectedCharges.tsx
- database/migrations/V89__agent_receipt_payment_command.sql
- services/agent-receipts/contract.mjs
- services/agent-receipts/runtime.mjs
- services/notifications/postcommit.mjs
- services/notifications/identity.mjs
- services/notifications/dispatcher.mjs
- services/notifications/web-push.mjs
- services/notifications/worker.mjs
- services/notifications/wakeup.mjs (delete)
- services/payment-command/dev-server.mjs
- services/payment-command/handler.mjs
- services/payment-command/store.mjs
- services/production/business-runtime.mjs
- services/workers/config.mjs
- services/workers/runtime.mjs
- services/workers/server.mjs
- tests/unit/agent-receipt-command.test.mjs
- tests/unit/notification-transport.test.mjs
- tests/unit/notification-wakeup.test.mjs
- tests/unit/worker-runtime.test.mjs
- outputs/r053-notifications-jobs/implementation-handoff.md
- Change Logs/CHANGE_NOTES_R053_NOTIFICATIONS_JOBS_2026-10-11.md

B agent publication allowlist: receipt_api.py (new), review_cycle.py, receipt_run.py (runtime catalogue gate) and config.py under src/mw_integration_agent; tests/test_receipt_api.py (new); config.example.json; service-catalogue.json; SERVICE_CATALOGUE.md; docs/SHARED_RECEIPT_PAYMENT_API.md (new); docs/PARTNER_REVIEW.md; Change Logs/CHANGE_NOTES_SHARED_RECEIPT_PAYMENT_API_2026-10-12.md (new). Parent/D coordinate both publications after independent findings are resolved.

Known canonical over-balance rejection now catches only P0001 with exact `Payment does not match the current eligible balance`, rolls back inner financial work and records immutable selection_unavailable. Other trigger errors still escape without a journal. C verifies this precise correction.


### Immutable migration correction — 12 October

V88 is restored byte-for-byte to published5199 (`2100c28f1bd62f16fda811efdb42234b1d0676f7fc5a3f4197144e8842477e8e`) and is not part of the staged delta. V89 is the forward function-only change: its fixed capture body removes the former NOTIFY call, validates the exact prior V88 body, and uses the existing CREATE OR REPLACE definition to preserve all current settings, including an already-enabled activation marker. It verifies OID/owner/ACL/full proconfig/security mode and execution flags are unchanged. This replaces the earlier unpublished attempt to remove the call from V88; that attempt is not the release package. No release-guard bypass. Current V89 `86b2607221b56c665974f1723e632241e1bbffe86d05e3939079f878c4f8b833`; C owns the focused forward-migration/true-owner proof and final evidence. D's existing three-owner preparation is sufficient.
