# API conversation polling — 21 September 2026

Owner requested scheduled API checks for new group messages, reusing existing processing and ignoring unsupported content. Browser automation is explicitly prohibited. Starting clean commit: `8d4662dbbcd7d8ff82665f1dcfce0e6aec74d58c`.

Implemented `conversation_poll.py`, CLI/config/catalogue controls, five-minute systemd timer, activation script and shared updater handling. Private polling provenance and watermark tables are local SQLite only; no business schema change. Existing receipt job IDs provide cross-input deduplication. New cutoff prevents automatic historical replay. The catalogue is revision 10. No financial write or group-send capability is added.

API evidence: 15 conversations, including 12 three-participant conversations; 13 returned message data. Direct group-history endpoints rejected reads, so polling uses the observed working expanded conversation-list response. A history window gap fails closed rather than skipping messages.

Local verification: 66 tests, two platform skips. Added tests for new images, ignored text/nonborrowers/history, overlapping scans, webhook deduplication, disabled borrowers, pagination loops, incomplete attachments and no cursor advancement on history overflow. Deployment uses private package/config and integrity-checked journal backup. Final deployment verification is recorded below.

Rollback: stop/disable mw-conversation-poll.timer and restore recorded configuration/package if needed; never overwrite newer journals. Source rollback is the starting commit. Update the process diagram and operations documentation with the new intake path.
