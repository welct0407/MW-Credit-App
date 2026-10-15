# Partner sample activation — 13 September 2026

## Scope and authorization

Owner authorized activating the new partner agent, enabling Tommy, and selecting five Pattaya borrowers across shared/different locations for a one-time daily briefing review. Lisa must not receive messages. Partner management remains in OLAP; both OLTP and OLAP were checked. Looker Studio is secondary and unchanged.

## Changes

Only existing operational row flags changed: Tommy's `Partners[IG Integration Enabled]` enabled through OLAP; four `Borrowers[AI Collection Enabled]` flags enabled through OLTP, retaining the previously enabled borrower for a five-person sample. Lisa remains disabled. Exact keys/before-values are retained privately in the partner project's external runtime folder. No borrower financial amounts, fees, repayments, app definitions or database structure changed.

Both Partner languages remain exactly English / ไทย. Existing IG/email values were preserved. Current app interfaces were used; no legacy testing pages. The five borrowers remain in the existing Collection dashboard/backing slice with positive collectible amounts. All 18 dashboard row keys matched the backend source.

## Verification and impact

OLTP edits saved and synchronized; backend readback confirmed five selected opt-ins. OLAP Tommy integration readback confirmed on and Lisa off. OLAP borrower detail displayed the shared City and Working Location values correctly. The new agent verified Tommy's separate saved headless session in both apps. OLAP version 1.100033 was inspected; its existing API was disabled and left unchanged. OLTP setup baseline is 3.000052. There was no schema/config change requiring a new data dictionary or overview revision.

The agent's sample completed as 11 Instagram messages to Tommy, with no Lisa messages or email. No automatic fee, borrower-facing send or financial test transaction was performed. Old agent scheduled sending remains disabled.

## Rollback and status

Row rollback uses private `activation-before.json` / `activation-sample.json` under `Documents/ChatGPT/MW-Partner-Operations`; restore only the four newly changed borrower flags and Tommy's previous flag if requested. No app version restore is needed for row flags. Do not overwrite current financial records or sent-message journals. App definition baselines: OLTP 3.000052 / OLAP 1.100033.

Implementation, 61 synthetic tests, runtime activation, delivery evidence and source rollback are documented in `C:/GitHub/MW-Partner-Operations/Change Logs/CHANGE_NOTES_BUSINESS_ACTIVATION_2026-09-13.md`. Owner review of sample wording and genuine command workflows remains ongoing. Manual review: inspect Tommy's 11 messages and grouping; confirm Lisa remains off. Downstream report definitions were not changed or re-audited.

Status: authorized row changes and cross-app checks complete; sample sent for owner review.
