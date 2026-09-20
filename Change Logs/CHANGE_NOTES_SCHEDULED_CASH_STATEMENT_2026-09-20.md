# Scheduled cash statement — 20 September 2026

## Scope and purpose

Activate the accepted daily cash statement at 00:15 Asia/Bangkok for every current Partner with `IG Integration Enabled=true`. Deliver through Instagram in `Language Preference`; when Instagram is unavailable, rejected, partial or uncertain, send the complete statement set to that same Partner row's current Email.

## Changes

- Added dedicated schedule and email fallback controls while leaving generic sending, processing and database writes disabled.
- Added systemd daily and bounded email-retry timers and hardened one-shot services.
- Added Microsoft Graph fallback using the previous Partner Operations sender design: sender identity verification, Partner master email, localized content, durable reservation, no replay after unknown outcome, and at most three attempts for definite non-delivery.
- Extended the read-only Partner query with existing Email; no database schema or AppSheet model changed.
- Added editable and rendered business process diagrams plus a deterministic generator.
- Updated service catalogue revision 7 and operating documentation.

## Rollback

Disable both timers, restore the captured config/catalogue/unit files and reinstall the prior package. Preserve snapshots and delivery journals. Do not restore an older journal over newer delivery evidence. Keep the OAuth credential backup until the sender and scheduled run are verified.

## Checks and status

Pending final Debian tests, OAuth sender probe, systemd calendar verification, timer activation, and published Git verification. The first automatic business run remains scheduled for the next 00:15 Asia/Bangkok occurrence.
