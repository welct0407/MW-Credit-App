# Held receipt rejection and direct-reply routing — 25 September 2026

Owner authorized rejecting a held receipt by replying directly to its IG notification, and clarified that all direct replies belong to review actions. Baseline clean `c752c4865792f4711066ebeed4d3d27b90a501af`; installed revision21 `36657f567c5c0eebe16a3b3641e3585e18ee2a39`.

Implementation: shared exact-recipient/current-reviewer authorization, explicit rejection words, guarded REVIEW → REJECTED and durable decision in existing journal, retained receipt reason/history/deduplication, retry-safe acknowledgement to deciding reviewer, and acknowledgement failures in existing receipt health. All direct replies excluded from general conversation, even unknown references. Existing proposal approval and automatic posting unchanged. No new schema or payment write. New cutoff applies to new replies, including replies to old accepted hold notifications; earlier general-assistant replies not replayed.

Updated `hold_reply.py`, review cycle/authorization, conversation routing, hold wording/outbox icons, receipt health, config validation/example, reviewed updater, catalogue revision22 and affected operating docs/drawio nodes. Tests cover rejection/idempotence, role/identity/link/clock/cutoff guards, approval and ambiguous text, changed/posted holds, crash before acknowledgement, missing delivery health and real coordinator integration with mocked external effects. Diagram IDs/edges validated. Existing PNGs remain labelled historical.

Candidate Debian suite: 250 tests, 220 passed and 30 separate PostgreSQL-lab skips. Windows targeted tests also pass. Source-only staging used private archive, no live financial tests. Cloud SQL backup `1790337600000` SUCCESSFUL at 2026-09-25T13:27:09Z confirmed before rollout. Package/config/catalogue backup through reviewed updater; retain all current PostgreSQL journals on rollback. No AppSheet/SQL promotion, flags or model changes. Deployment verification follows below.


## Deployment verified

Pinned source `dcb8443087d16eedc69bd1c990fd7406bb107a66` installed on Debian, revision22. Exact candidate and installed suites: 251 tests, 221 passed / 30 separate PostgreSQL-lab skips. Nine hold-reply tests include case-insensitive Reject/No. Catalogue/config check passes. All eight changed runtime modules match installed source byte-for-byte.

Private rollback `/var/lib/mw-integration-agent/rollback/reviewed-20260925T160926Z`. Parsed config comparison: only new `receipt_hold_reply_cutoff=2026-09-25T16:09:35.207877+00:00`; existing service switches, model settings and cutoffs unchanged. Package/catalogue/config preserved by updater; central journal recovery uses verified Cloud SQL backup/PITR, not the updater's historical SQLite copies.

Natural receipt cycle succeeded at 23:09:52 Bangkok, conversation cycle at 23:09:57; polling last success 23:07:13. All three timers active. Read-only installed inspection confirms all direct replies reserved, standalone text eligible for conversation, two holds unchanged, one overdue pending proposal, no stalled jobs/unknown postings/failed notices and retained POSTED19. No held receipt was dismissed by the deployment and no financial test or historical reply replay was invoked. Owner should send a new direct Reject/No reply to the existing hold notification; real user interaction remains the live acceptance test.

Monitoring uses unchanged metric fields/rule/dashboard. Existing failed_notifications now also covers missing/undelivered hold-reply acknowledgements; mirrored operating guide updated in the monitoring repository. Implementation, deployment, tests and editable process documentation complete; source and final evidence published under standing authorization.
