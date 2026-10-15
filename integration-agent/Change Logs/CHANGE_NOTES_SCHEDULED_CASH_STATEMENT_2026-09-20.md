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

- All 26 tests passed on Debian, including Thai rendering, cutoff, idempotency, unknown-outcome and email retry cases. Synthetic English and Thai statements rendered successfully.
- Microsoft Graph authenticated without sending mail and the returned identity matched `welctcodex@outlook.com`.
- At the owner's request, Microsoft Graph accepted one non-financial end-to-end test email from `welctcodex@outlook.com` to the owner's business account `welct0407@mw-credit.com`. The message contained no statement or financial data.
- Current Partner preflight found two enabled Partners; both have supported languages and valid fallback Email values. No Partner address was printed.
- systemd unit verification passed. Both timers are enabled and active; the daily timer reports the next 00:15 Asia/Bangkok occurrence and the retry timer completed its empty first run successfully.
- Live controls: cash statement schedule and email fallback true; generic sending, message processing and writes false. OAuth JSON is mode 0600 and owned by `mwagent` for refresh-token rotation.
- Published checkpoints `5cccb8b` and `6c5e01e` were fetched by the VM. The first automatic business run remains scheduled for the next 00:15 Asia/Bangkok occurrence.
