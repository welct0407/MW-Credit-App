# Official API conversation intake

Owner authorized scheduled API reads on 21 September 2026. Browser automation is prohibited, following the owner's prior account restriction. No browser is used. Group sending remains untested and is not enabled.

Live read evidence: the conversation-list endpoint returned 15 conversations, 12 with three participants, and messages for 13 conversations. Individual group-object/history endpoints returned HTTP 400; the working route is account conversations with expanded message fields. This is observed account behavior, not a claim of general vendor support.

`conversation-poll` runs every five minutes after the previous run finishes, under `mw-conversation-poll.timer`. It reads up to 100 recent messages per conversation, follows outer conversation pagination, and selects conversations containing a currently AI-enabled borrower. Messages from other participants and non-image content are ignored. Images feed the existing receipt job table and worker; receipt validation, current borrower identity, bank aliases, duplicate checks and Partner IG-first/email-fallback notices remain shared.

The first activation establishes a timezone-aware cutoff. Each successful conversation check stores a watermark with a five-minute overlap; message IDs make repeat scans harmless. Message and image reservations commit with that watermark. The same message/attachment job key is used by webhook intake. Polled events have their own provenance table and never become signed webhook evidence or refresh the IG delivery window.

If more than 100 new messages prevent reaching the saved boundary, or attachments/participants are incomplete, fail without advancing that conversation. The service reports failure in the systemd journal; no additional alert delivery is implemented. A manual API backfill needs explicit historical scope. Existing historical receipts, including the prepared real test, are not replayed by activation. Financial writes remain disabled.

Deploy with the reviewed runtime updater, then `scripts/activate-conversation-poll.sh`. Inspect `systemctl status mw-conversation-poll.timer` and `journalctl -u mw-conversation-poll.service`; successful output contains aggregate counts only. Roll back by stopping/disabling this timer and restoring the recorded config/package backup without replacing current journals. The webhook remains active independently.
