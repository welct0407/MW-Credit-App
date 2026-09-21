# Receipt notification recovery — 22 September 2026

Scope: owner-requested repair of NOTICE_CONTENT_CHANGED in the Debian receipt worker. Baseline: 5419ce5bf23fdca5125c2dd3817c804817682020; clean working tree before edits.

Cause: the review coordinator revisits terminal results using fresh Partner master data. Two already emailed result notices had a different IG enabled preference, causing reservation to abort before dispatching pending reviews.

Change: NoticeJournal.reserve returns the existing immutable entry for the same event/Partner when dispatch already considers it completed or held. It does not alter payloads, delivery states, message correlation or reopen unknown outcomes. Pending content conflicts and dispatch authorization checks remain enforced. Shared conversation delivery uses the same unchanged terminal-state rules. No app, schema, financial data, schedule, service authority or routing change.

Checks: 132 local tests passed (3 platform-specific skips), including restart recovery across accepted, emailed, unknown and held outcomes; changed Partner preferences cannot replay old messages; a subsequent queued notice dispatches; pending preference conflicts still reject.

Rollback: reviewed installer must back up installed package, configuration and integrity-checked journals before deployment. Restore the prior package if necessary, retaining current journals to avoid replay. Source changes are limited to partner_notice.py, its tests and partner-review documentation.

Deployment: source 5b9c64c58f8a479aa5cfddba91142749db503ff5 installed on vm-mw-credit-agent using the reviewed updater. Private rollback snapshot: /var/lib/mw-integration-agent/rollback/reviewed-20260921T190131Z; journals passed integrity checks. All 132 Debian tests passed and installed configuration validation succeeded. Existing activation controls were preserved.

Verification: the natural scheduled receipt cycle finished successfully at 02:01:53 Bangkok on 22 September, exit 0. Receipt and conversation-poll timers are active. The previously blocked receipt review now has Instagram ACCEPTED, no error detail, and review state PENDING. API acceptance does not prove the reviewer has read it. No synthetic payment, historical resend or group message was sent; manual-only handling remains enforced. Complete.
