# Reviewer-requested Instagram resend — 29 September 2026

Owner authorized the standalone review command after asking how to recover email-fallback requests when the IG messaging window reopens.

- Starting clean commit: `2d6d1202474580ab1324b3b74dce7356a7723bbe`. Existing Debian source: `b263dac43b4df1b32454cb4d4cf1e5e6c1a81d6f` (revision 23 receipt evidence retained).
- Added deterministic current-reviewer command routing, pending/unexpired-only resend, immutable original delivery history, fresh direct-reply correlation, restart-safe per-command reservations and acknowledgement.
- Commands do not post, recreate proposals, extend expiry or reopen terminal/unknown payment states. Existing execution revalidation remains mandatory. Hold notifications are outside this resend command.
- Updated review coordinator, conversation exclusion, review identity parsing, delivery health aggregation, configuration validation, reviewed updater cutoff, catalogue revision 24, review/conversation docs and diagram page 17.
- Rollback: restore previous installed package/config/catalogue from reviewed updater backup; preserve all runtime journals. New notices remain historical evidence. No schema or app changes.
- Checks: six focused resend authorization/idempotency/restart/unknown-outcome tests passed locally. Full Windows run was limited by missing psycopg (four import failures); Debian full suite and deployment verification pending. Two integration tests cover signed command routing and approval execution from a resent-only IG notice.
- Latest production Cloud SQL backup verified SUCCESSFUL: `1790683200000`, ended `2026-09-29T12:23:48.089Z`.
- Status: implementation; pending Debian tests, deployment and publication verification. No synthetic production message or financial write used for testing.
