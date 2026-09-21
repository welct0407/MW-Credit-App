# Receipt notification recovery — 22 September 2026

Scope: owner-requested repair of NOTICE_CONTENT_CHANGED in the Debian receipt worker. Baseline: 5419ce5bf23fdca5125c2dd3817c804817682020; clean working tree before edits.

Cause: the review coordinator revisits terminal results using fresh Partner master data. Two already emailed result notices had a different IG enabled preference, causing reservation to abort before dispatching pending reviews.

Change: NoticeJournal.reserve returns the existing immutable entry for the same event/Partner when dispatch already considers it completed or held. It does not alter payloads, delivery states, message correlation or reopen unknown outcomes. Pending content conflicts and dispatch authorization checks remain enforced. Shared conversation delivery uses the same unchanged terminal-state rules. No app, schema, financial data, schedule, service authority or routing change.

Checks: 132 local tests passed (3 platform-specific skips), including restart recovery across accepted, emailed, unknown and held outcomes; changed Partner preferences cannot replay old messages; a subsequent queued notice dispatches; pending preference conflicts still reject.

Rollback: reviewed installer must back up installed package, configuration and integrity-checked journals before deployment. Restore the prior package if necessary, retaining current journals to avoid replay. Source changes are limited to partner_notice.py, its tests and partner-review documentation.

Status: tested locally; production installation and scheduled-cycle verification pending. No synthetic payment or group message will be sent.
