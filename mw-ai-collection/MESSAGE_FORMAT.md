# Daily collection message format

8 September greeting correction: write as a young woman addressing friends. Use the nickname directly, without คุณ. Preserve an existing พี่ prefix and add คะ after that name; do not invent an age title. End the amount sentence with นะคะ. Examples: Lisa วันนี้มียอดที่ต้องส่ง 600 บาทนะคะ; พี่เนยคะ วันนี้มียอดที่ต้องส่ง 300 บาทนะคะ. All existing three-paragraph financial terms remain in place.

Accepted by the user on 7 September 2026 for the **first message of the day only**. Reminders use `reminder_engine.mjs` and remain short; they do not repeat this full deadline, penalty, or bank block.

Source: final user instructions in **Draft daily collection messages**, task `01a066b1-e885-7d52-98f5-34812d9c7c18`, 3 September 2026. Updated here on 7 September following the user's request to remove the test heading and resend.

| Element | Rule |
| --- | --- |
| Polite borrower greeting and today's remaining amount | Required first line, natural friendly Thai using ส่งยอด / ยอดที่ต้องส่ง. |
| Deadline and late-charge wording | After current/overdue amounts:16.00 deadline;50฿ starting16.01,50฿ hourly, cumulative500฿ at midnight. User authorizes the16:00 run to infer16:01. Build3 posts the cumulative fee into the same charge's Interest Due and records the breakdown in Notes; reminders require saved readback. Opening line: หากข้ามวัน ค่าปรับล่าช้ารวมเป็น 500฿. |
| Overdue line | Only when overdue remaining is positive; follows today's line. Omit zero-overdue explanation. |
| Loan closure line | Required in paragraph 2 after the cross-day penalty: ‼️ กรณีปิดต้น รบกวนชำระเงินต้นพร้อมดอกเบี้ยของวันนี้ทุกครั้งนะคะ |
| Paragraph layout | Exactly three paragraphs separated by one blank line: (1) greeting/current and conditional overdue amounts, (2) deadline, late-payment and loan-closure terms, (3) payment heading and bank details. |
| Emojis | Optional; use sparingly. |
| Payment reminder / bank block | Required in the final reference format, but actual bank details require approved private input; do not send placeholders. A user-approved test omission is an exception, not a claim the reference made it optional. |
| Test heading | Removed at the user's explicit request. Synthetic identity remains in local records. |
| Promise-time question | Not part of the referenced daily template; removed. |

If today's remaining is zero but overdue exists, avoid assuming a payment occurred merely from zero remaining. State no current-day balance and request the overdue amount. Skip entirely when total remaining is zero.

The reference deadline is retained for this user-requested format review. The resend is after 16.00 local time; it demonstrates the standard first-message template, not an asserted new future deadline or an automated late-charge action. Scheduling and after-cutoff wording remain to be agreed before unattended sending.

The user explicitly approved including the bank block and saving the supplied details on 7 September 2026. `local/payment_account.json` is the editable source for both runner commands. The real values are kept out of this document and tracked source. No additional permission prompt is needed for this already-authorized use in the friend's test conversation.

An explicitly requested revision is stored separately in `review_resends`, linked to the original send. Never erase/reset `initial_messages` or change the borrower/date to bypass duplicate protection.
