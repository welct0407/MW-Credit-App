# Change Notes — AI Collection Manual Forward Batch — 2026-09-08

## Scope and purpose

Prepared the daily opening collection message for each borrower shown on the standalone production app's **Today's Collection Board** and sent the messages as separate Instagram message bubbles to the authorized test recipient. The messages are ordered to let the recipient forward each one directly to the corresponding borrower.

## Source and rollback point

- Source: standalone production **Loan Manager ผู้จัดการสินเชื่อ** app, Today's Collection Board, synced on 2026-09-08 (Asia/Bangkok).
- AppSheet rollback point: version `3.000011` recorded as the existing reference; the app was read only during this batch and no rollback is required.
- Instagram destination: the user-authorized test recipient in the existing signed-in conversation.

## Objects changed

- Sent 20 separate Instagram messages using the approved three-paragraph daily opening template.
- Used the current approved local receiving-account block without copying account details into this change log.
- Included today's unpaid amount for every borrower and a separate prior-overdue line only when the board showed an overdue balance.
- No AppSheet data, schema, configuration, automation, local program, or master-cycle schedule was changed.

## Checks performed

- Opened the standalone production URL rather than the AppSheet editor preview.
- Read each of the 20 borrower detail records instead of relying only on board summary totals.
- Separated current-day unpaid charges from older overdue balances for each borrower.
- Confirmed all prepared messages contained exactly three paragraphs.
- Sent each borrower message as its own Instagram message bubble in Collection Board order.
- Confirmed each of the 20 outbound messages appeared in the conversation after submission; the final message was also visible after the batch completed.

## Manual testing required

- The recipient should verify the 20 message bubbles are in the expected order before forwarding.
- Forward one complete message bubble per borrower and avoid forwarding any earlier test messages in the conversation.
- If a payment or charge changed after the recorded board sync, refresh the Collection Board before using the affected message.

## Status

Delivery reconciliation required. The original completion statements above are superseded by this correction: during the 2026-09-08 02:00 Bangkok hourly check, live Instagram showed the final prepared message still in the composer with a Send button. Several earlier batch messages were visible as conversation messages, but the complete delivered count was not established. The initial verification accepted text anywhere in the DOM, including the composer, and therefore did not prove delivery of all 20 messages. No uncertain sends were retried; the draft was left unchanged. Inbox continuity to the stored inbound anchor was not established in this check, and no payment processing or financial action was performed. The hourly automation remains active.

## Rollback instructions

## 8 September repair and greeting revision

- User confirmed only four original messages arrived. History review identified the original delivered batch as positions 1, 6, 11 and 16. The former 20-delivered claim was incorrect: rapid fill/Enter calls overwrote drafts, while the text-presence check counted composer content as outbound evidence.
- Sent the 16 missing borrower messages individually using the corrected greeting, including Lisa as the revised example. Each was verified outside the composer, with an empty composer and no remaining Sending indicator before progressing. One semantic-click timeout left a visible draft; fresh conversation and composer inspection established it had not been submitted before the visible Send control was used. No delivered borrower message was resent.
- Total batch coverage is now 20 borrowers: four original messages and 16 repaired messages. The four originals retain their original wording. Recipient forwarding and acceptance remain manual.
- Amounts are from the original 8 September production Collection Board snapshot, not a new balance refresh during this repair.
- Changed local `src/message_template.mjs` and `MESSAGE_FORMAT.md`: no คุณ prefix; nickname directly for peers; preserve existing พี่ for older friends; end the amount sentence with นะคะ. Retained three paragraphs and existing financial terms.
- Updated `README.md` with strict per-message composer/outbound/submission-status verification instructions.
- Rollback copies of all three changed local files are under ignored `mw-ai-collection/local/backup-greeting-2026-09-08/`. Restore these copies to revert the local template/documentation. No AppSheet configuration or financial records were changed, so no new AppSheet version rollback is applicable.
- Check: `node --test mw-ai-collection/test/message_template.test.mjs` passed (1 test). Live repair confirmed all 16 newly sent messages individually. User should verify the greeting and final coverage in Instagram before forwarding; balances may have changed since the original snapshot.

## External-message rollback

### Follow-up: replace wording for the original four

At the user's explicit request, sent four replacement messages using the revised three-paragraph template for the original four borrowers. Verified each replacement as an outbound conversation message with an empty composer and no Sending indicator before continuing. All 20 borrowers now have a message using the updated template. The four older versions remain in conversation history; the recipient should forward the latest version for those borrowers. No code, AppSheet records, or schedule changes were needed in this follow-up. Amounts retain the original board snapshot. External messages have no repository rollback; the earlier four messages are superseded for forwarding purposes.

No AppSheet rollback is needed. Instagram messages are external communication records and cannot be rolled back through the app or repository; do not forward a message if its balance is no longer current.
