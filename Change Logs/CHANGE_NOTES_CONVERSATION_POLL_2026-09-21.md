# API conversation polling — 21 September 2026

Owner requested scheduled API checks for new group messages, reusing existing processing and ignoring unsupported content. Browser automation is explicitly prohibited. Starting clean commit: `8d4662dbbcd7d8ff82665f1dcfce0e6aec74d58c`.

Implemented `conversation_poll.py`, CLI/config/catalogue controls, five-minute systemd timer, activation script and shared updater handling. Private polling provenance and watermark tables are local SQLite only; no business schema change. Existing receipt job IDs provide cross-input deduplication. New cutoff prevents automatic historical replay. The catalogue is revision 10. No financial write or group-send capability is added.

API evidence: 15 conversations, including 12 three-participant conversations; 13 returned message data. Direct group-history endpoints rejected reads, so polling uses the observed working expanded conversation-list response. A history window gap fails closed rather than skipping messages.

Local verification: 66 tests, two platform skips. Added tests for new images, ignored text/nonborrowers/history, overlapping scans, webhook deduplication, disabled borrowers, pagination loops, incomplete attachments and no cursor advancement on history overflow. Deployment uses private package/config and integrity-checked journal backup. Final deployment verification is recorded below.

Rollback: stop/disable mw-conversation-poll.timer and restore recorded configuration/package if needed; never overwrite newer journals. Source rollback is the starting commit. Update the process diagram and operations documentation with the new intake path.

Deployment verified at 18:40 Bangkok: implementation `f30c0fbdf3afa5746ca40585f2147ebd11c7a8b3`; all 66 tests passed on Debian. Private rollback `/var/lib/mw-integration-agent/rollback/reviewed-20260921T113954Z` includes integrity-checked journals. New cutoff established at activation, without changing existing webhook or notice cutoffs. Initial and repeat runs succeeded: 15 conversations, 10 eligible, zero new messages/images. Poll timer, webhook and receipt timer are active. Of 12 three-participant conversations, 10 map to enabled borrowers, one to a disabled borrower and one has no borrower match. No post-cutoff real receipt has yet exercised this new input end-to-end.

Updated the agent overview, service index and new detail page 16; rendered changed previews and checked the new flow. Operations, receipt guide and persistent browser prohibition are documented. No production financial write or group send occurred.
