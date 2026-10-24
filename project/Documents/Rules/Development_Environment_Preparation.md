# PWA DEV preparation

Use only for initial setup, changed environment/recipient routing or a requested [refresh](Development_Refresh_Runbook.md). Ordinary feature work reuses verified setup. A refresh also restores the DEV test Partner for Claude Code (runbook step 7a).

1. Confirm the actual DEV project/service/database/storage prefix and intended identity from the affected inventory/configuration. DEV and PROD share a SQL instance and authentication project; those shared identities alone do not establish isolation.
2. Preserve existing source/configuration and a recovery point for assets being changed. Pause only affected DEV writers/jobs while copied data or changed routes are unverified; preserve production operation.
3. Verify DEV API/Hosting bindings, database grants, receipt destinations and links. No DEV financial data is copied into PROD.
4. Verify owner-only notification/test delivery using the current PWA preferences, subscriptions, routing controls and test identities. Do not assume an old email override isolates Web Push, Instagram or other channels. Keep a changed route inactive until its actual destination is verified; preserve distinct login identities.
5. Restore only intended native scheduler/worker ownership, with no duplicate scheduler. Preserve activation cutoffs, retry/idempotency and integrity triggers. Never resume retired AppSheet bots.
6. Perform the affected read/identity checks and, only when authorized, a synthetic isolated workflow/delivery test. Record the boundary proven and reuse it until relevant inputs change.
7. Record changed environment facts and reconcile temporary pauses. No routine editor validation, app copy, device sweep or full CI for setup already proven.

## DEV recipient override procedure

This heading remains for older links. An existing owner-only email data override may still protect a specific email route; verify its current consumer before using a maintained runner. It does not by itself isolate native push subscriptions or agent messaging. Follow the current owning route's procedure rather than replaying historical AppSheet setup scripts.

Preparation establishes environment isolation, not feature acceptance or production authority.
