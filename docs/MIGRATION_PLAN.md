# Migration plan

The source Windows agent was fully stopped on 19 September 2026. Its processing, sending, writes, daily briefing, business worker, webhook receiver, and Cloudflare tunnel are disabled. Preserve that state until a separately authorized cutover.

## Stages

1. **Foundation (this revision):** private Git repository, Debian bootstrap, external secrets/state layout, Codex installation path, disabled systemd verification, and fail-closed service catalogue.
2. **Transport and data foundation:** signed webhook parsing, durable deduplication, bounded AppSheet reads, and least-privilege PostgreSQL connectivity are implemented. Partner authentication and mapped operational edits remain pending.
3. **Codex conversations:** implemented with isolated per-partner threads and host-owned bounded tools; see [conversation operations](PARTNER_CONVERSATIONS.md) and its linked verification/deployment record. General GUI workflows remain stage 4.
4. **GUI compatibility:** replace the Windows/Edge saved session with Linux Chromium. Verify current OLTP and OLAP read-only navigation before any GUI write test.
5. **Delivery and scheduling:** migrate Instagram/email transports and the daily briefing only after fresh platform-policy checks and explicit owner authorization.
6. **Cutover:** back up and integrity-check old journals; copy only approved non-secret state through a documented transformation; establish a new inbound cutoff; rebind the existing tunnel; prove one receiver/worker/scheduler; then enable the minimum approved flags.

## Reuse candidates

- Service-catalogue/default-deny model
- HMAC webhook verification and message-ID deduplication
- SQLite reservations, unknown-outcome handling, integrity checks, and audit semantics
- Current Partner master-data authentication and opt-in refresh
- Bounded AppSheet Find reads and mapped-edit validation
- Per-partner Codex conversation isolation and tool boundary
- Deterministic briefing composition and current delivery fallback rules

## Do not copy directly

- Windows scheduled tasks, PowerShell installers, `pythonw`, Edge channel/profile paths, or Windows file paths
- Cloudflare tunnel token, Meta/AppSheet/Outlook credentials, Codex `auth.json`, browser profiles, private config, or recovery exports
- Active/paused queues, SQLite files, uncertain operations, webhook cutoffs, or partner message history
- Activation flags, source-verification claims, live app versions, or old test evidence as current Linux evidence

Every migration stage needs its own change log, tests, rollback, and owner-visible remaining limitations.
