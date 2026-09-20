# Instagram transport foundation — 2026-09-20

## Scope and purpose

Implemented the Linux-native two-way Instagram transport boundary requested by the owner: signed receipt-only webhook ingress plus an official-API outbound adapter for later feature development. Automated processing, replies, AppSheet/database writes, schedules, and historical replay remain disabled.

Starting rollback point: `e1494f8dd6dc510f2a7217333e497f4ed14a75c6`.

## Changes

- Advanced the service catalogue to revision 1.
- Enabled `signed_webhook_ingress` and explicit `instagram_delivery`; delivery additionally requires a live runtime flag and has no automatic worker.
- Added HMAC-SHA256 verification, bounded event parsing, SQLite receipt/message deduplication, and `CAPTURED_NO_PROCESSING` status.
- Added a loopback-only webhook server with Meta verification challenge support.
- Added a read-only Instagram account/conversation probe and a disabled-by-default send adapter.
- Added hardened systemd units for the webhook receiver and Cloudflare tunnel.
- Added an installation script that installs code and units without enabling services.
- Added a pinned Cloudflare connector 2026.9.1 installer with SHA-256 verification.

## Credential and cutover boundary

After explicit owner authorization, the preserved Instagram access token, Instagram application secret, webhook verification token, and Cloudflare tunnel token were transferred through authenticated SSH/IAP into `/etc/mw-integration-agent/secrets`. They were not printed or committed. A fresh Linux cutoff marker was created, the stopped Windows route was not restarted, and historical messages are not replayed. The separately authorized controlled outbound test is recorded below.

## Rollback

Disable the Linux webhook and tunnel units, preserve the SQLite journal, remove the live config/credentials, and revert with a normal follow-up commit. Do not restart the Windows receiver without a separately reconciled cutover.

## Checks and status

Automated tests and configuration validation pass on Windows and Debian. The first Debian run exposed and corrected millisecond timestamp rounding in a test and refreshed example-config installation. Pinned cloudflared SHA-256: `03f1f25d1cc93b9ad6c60569d44060bc4f17ed97075760ed8cfca4b12dcd68cc`.

Live checks:

- Webhook and Cloudflare tunnel services are enabled and active.
- Receiver listens only on `127.0.0.1:8000`; Cloudflare registered four QUIC connections and loaded the existing `hooks.mw-credit.com` ingress rule.
- Public `/health` returned 200.
- Public Meta verification challenge returned the exact challenge.
- A signed empty Instagram payload returned 200 `EVENT_RECEIVED`; an invalid signature returned 403.
- The official Instagram API authenticated account `tttlll8709` and enumerated 14 conversations.
- A genuine post-cutover Instagram DM was captured exactly as `linux webhook test 20260920`, attributed to the captured sender, and stored with `CAPTURED_NO_PROCESSING`.
- With `sending_enabled` temporarily enabled, the Debian CLI sent one reply to that captured sender. Meta returned `accepted` and a message ID.
- The live configuration was immediately restored to `sending_enabled=false`; a subsequent delivery attempt was rejected locally with `sending_enabled is false`.
- Both `mw-instagram-webhook.service` and `mw-cloudflared-instagram.service` remained active after the test.

Status: two-way transport is verified. Signed receipt-only ingress is live, explicit delivery works when deliberately enabled, and outbound sending is disabled again. Provider acceptance proves submission to Meta, not recipient delivery or read status. Automated business processing remains disabled.
