# Instagram transport foundation — 2026-09-20

## Scope and purpose

Implemented the Linux-native two-way Instagram transport boundary requested by the owner: signed receipt-only webhook ingress plus an official-API outbound adapter for later feature development. Automated processing, replies, AppSheet/database writes, schedules, and historical replay remain disabled.

Starting rollback point: `e1494f8dd6dc510f2a7217333e497f4ed14a75c6`.

## Changes

- Advanced the service catalogue to revision 1.
- Enabled only `signed_webhook_ingress`; marked `instagram_delivery` implemented but disabled.
- Added HMAC-SHA256 verification, bounded event parsing, SQLite receipt/message deduplication, and `CAPTURED_NO_PROCESSING` status.
- Added a loopback-only webhook server with Meta verification challenge support.
- Added a read-only Instagram account/conversation probe and a disabled-by-default send adapter.
- Added hardened systemd units for the webhook receiver and Cloudflare tunnel.
- Added an installation script that installs code and units without enabling services.

## Credential and cutover boundary

The preserved Windows Instagram access token, Instagram application secret, webhook verification token, and Cloudflare tunnel token were not copied. Live Linux activation requires explicit credential migration authorization, a fresh cutoff, and verification that the Windows receiver/tunnel remain stopped. A live outbound test remains a separate deliberate action.

## Rollback

Disable the Linux webhook and tunnel units, preserve the SQLite journal, remove the live config/credentials, and revert with a normal follow-up commit. Do not restart the Windows receiver without a separately reconciled cutover.

## Checks and status

Automated tests, configuration validation, shell syntax checks, VM installation, and live provider/tunnel verification are recorded before completion. Status: implementation in progress; credentials and live activation remain pending.
