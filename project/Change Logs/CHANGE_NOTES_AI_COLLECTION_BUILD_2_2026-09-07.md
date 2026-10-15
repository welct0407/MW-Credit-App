# AI Collection Build 2 — 2026-09-07

## First scheduled reminder completed — awaiting acceptance

On 7 September, the scheduled cycle reached the 18.00 Asia/Bangkok promise. Re-synced the standalone production app after the due time: Lisa remained Overdue, collected 0, remaining 900, with the same two current-day 300 charges and one prior-day 300 charge. Rechecked Instagram through the latest inbound: no superseding promise, payment claim, or receipt. The CLI returned DUE and then READY at 11:00:32Z, reserving token `04bbc244-7b37-4ce4-8df4-a2b8943297ec`.

Sent exactly one short promise reminder: “คุณ Lisa คะ ถึงเวลาที่นัดโอนแล้วนะคะ รบกวนส่งยอดด้วยค่ะ 😊”. The complete outgoing bubble displayed at 19:00 in the Singapore-time browser (18:00 Thailand), with no Sending indicator and an empty composer. Confirmed SENT in the ledger at 11:01:08.808Z (confirmation time, not an exact Instagram delivery timestamp). State now has sentCount 1, promiseReminded true, pendingToken null, and AWAITING_ACCEPTANCE. Paused heartbeat `lisa-build-2-reminder-test` for user verification. No production financial data changed.

User/friend should confirm receipt, timing, and short wording before further testing or Build 3. Earlier pending-send notes below describe historical checkpoints. Rollback remains pause-and-preserve-ledger; no automatic resend or reset is authorized.

## Scope and acceptance

User accepted Build 1's latest message and explicitly designated it as the first message of the day only. User requested Build 2 and asked the friend to reply with a committed time. The latest inbound after the accepted opening message commits to 18.00 today. User confirmed **Asia/Bangkok** and **zero grace**. Earlier identical inbound text belongs to a different point in the conversation and was not replayed.

Build 2 adds local promise state, a two-hour fallback timer, short reminders, receipt/payment/ambiguity holds, fresh dual-source checks and duplicate-safe reminder reservations. This initial live test allows one confirmed reminder, then pauses for user verification, as required by the build-by-build instruction. Receipt posting remains out of scope.

## Rollback point and changed objects

Before edits, copied config.json, README.md and MESSAGE_FORMAT.md into ignored `mw-ai-collection/local/before-build-2/`. New files: `src/reminder_engine.mjs`, `src/reminder_runner.mjs`, `test/reminder.test.mjs`, `BUILD_2_RUNBOOK.md`, and this change log. Updated config, README, message-format documentation and Build 1 acceptance history. Added local SQLite tables `reminder_sessions`, `reminder_events`, `reminder_sends`; preserved existing send history. Live observations are under ignored local/. No bank values are duplicated in shared files.

No AppSheet, Looker or financial-record changes in this build. The prior app configuration baseline is 3.000011; no new app version or report backup is needed for these local additions. Data-model overview and dictionary updates are not applicable to local runner state. `sources/` and unrelated work remain untouched.

## Live observation and expected behavior

Verified exact Instagram recipient `__rxrisx__` and collection sender `tttlll8709`. Stored latest inbound under `after:2026-09-07-late-payment-terms:inbound:1:__rxrisx__`, with the source text and time evidence. No precise source timestamp was invented: the UI showed today's relative time; an absolute 18.00 commitment does not need a precise sent minute. Promised amount was unspecified and stored as null.

Session `lisa-build-2-2026-09-07` starts from the last confirmed opening revision at 10:20:43.717Z. Promise due is **2026-09-07 18:00 Asia/Bangkok = 11:00 UTC = 19:00 Asia/Singapore**. At the due time, fresh AppSheet and Instagram checks are required before sending. Reminder: “คุณ Lisa คะ ถึงเวลาที่นัดโอนแล้วนะคะ รบกวนส่งยอดด้วยค่ะ 😊”. No opening-message penalty or bank block is repeated. Normal no-promise interval is 120 minutes. Ambiguous replies, disputed amounts, payment claims and receipts hold for review. No payment or late fee is posted.

## Verification and limits

Created and activated one thread heartbeat, ID `lisa-build-2-reminder-test`, checking every five minutes. No matching existing collection automation was present. The source commitment is saved and the live engine returned WAIT with nextActionAt 11:00:00Z. The heartbeat rechecks sources and sends on its first due cycle; polling and runtime latency mean delivery may be several minutes after 18.00, never before. It stops after one confirmed reminder, a review condition, or test expiry. No reminder has been sent at this checkpoint.

Ten local tests pass, covering existing message controls, grace/exact-time boundaries, two-hour fallback, repeated inbound events, pending/unknown duplicate protection, receipt/payment/ambiguity holds, next-day promise review, full-payment stop, stale/wrong-target rejection, one-reminder acceptance gate and short wording. Codex supplies structured interpretation from visible UI; the CLI itself is not an autonomous Thai parser or browser integration. Scheduler and UI latency prevent exact-second guarantees. End-to-end scheduled send and recipient acceptance are pending.

Manual test: verify the captured 18.00 Thailand promise, that no reminder arrives before it, and that one short reminder arrives after the due-time checks if still unpaid. Test a receipt or recorded payment before due to verify suppression; these are alternative scenarios, not claims that those live scenarios were already executed. Confirm the first reminder before expanding reminders or starting Build 3.

## Rollback

Pause the Build 2 heartbeat to stop checks. Restore the three backed-up local files if reverting configuration and documentation; retain the SQLite history and this change log. Do not delete message reservations to retry a send. No production data cleanup is needed for Build 2. An already-sent Instagram message cannot be retracted by local rollback.
