# Configurable collection reviewers — 2026-09-09

Status: Implemented and activated. Tommy's Instagram account is the sole active primary reviewer. The friend's Instagram account retains only its Lisa borrower mapping; it no longer has review authority. User acceptance pending.

## Scope
The user explicitly requested moving review responsibility to their own account, without hardcoding the reviewer and with support for multiple reviewers later. Reviewer roles are now defined in collection-agent/local/reviewers.json (ignored, user-editable). Each entry has instagram_username, enabled and primary. API-resolved IDs are generated into reviewer-routes.json from authenticated conversations. Borrower profiles and AI/penalty flags were not changed.

The primary reviewer receives new requests. Any enabled configured reviewer with a verified identity can provide a valid correlated approval. Removed/disabled accounts cannot approve. Reviewer discovery does not require an AppSheet borrower profile or AI collection opt-in. An account can have both roles without mixing receipt context and approval context.

## Implementation
- New Python reviewers.py and Node reviewers.mjs share the configurable-list semantics.
- Config loading, directory refresh, inbound routing, worker approval checks, financial evidence, receipt approval and case decisions use the reviewer list.
- New reviewer-handoff command forwards outstanding reviews to the current primary with a unique durable outbox action and exact API verification. Assignment history is preserved in reviewer_assignments; financial status/duplicate holds are not changed.
- REVIEWERS.md, reviewers.example.json, config.example.json and PORTFOLIO.md document maintenance and multiple reviewers.
- No account username/ID was added to script logic. The only current account selection is in the ignored reviewer configuration file.

## Rollback
Before edits: collection-agent/local/before-reviewer-change-20260909 contains source/agent copies, runtime configuration and consistent local SQLite snapshots. Processing was temporarily disabled while deploying; worker and receiver were restarted and processing restored. Hourly schedule stays ACTIVE. No AppSheet schema/app definition change; app version restoration is not applicable.

To revert, disable processing, restore code/config or adjust the reviewer list, refresh identities and restart the worker. Preserve current SQLite journals after messages/activity; do not overwrite them with old snapshots. No payment was posted by this role change.

## Validation
28 Python and 56 Node tests passed. New tests verify primary/secondary membership and reject removed reviewers while allowing a second configured reviewer to confirm an eligible held receipt. Live directory readback: Tommy reviewer true; Lisa reviewer false; both borrower mappings retained. Receiver restart health 200 and worker heartbeat fresh.

One outstanding duplicate-receipt review was delivered to the new reviewer and verified through Instagram API; its duplicate hold remains unchanged. Existing review messages in the old recipient's chat were not deleted, and do not confer authority. A later idempotence check deferred because the normal event worker held the shared lease; the lock was not bypassed.

## Manual acceptance
Receive the transferred review in the new reviewer account. A correlated eligible approval from this account should work; a reply from the old reviewer should not authorize a payment. Add a second reviewer entry when required, establish its IG conversation and refresh routes; no source edit is needed. Real duplicate transactions remain blocked regardless of reviewer role.
