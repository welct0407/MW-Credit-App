# First daily message: loan-closure wording — 2026-09-07

## Scope and status

User approved the proposed wording and requested exactly three paragraphs. Added “‼️ กรณีปิดต้น รบกวนชำระเงินต้นพร้อมดอกเบี้ยของวันนี้ทุกครั้งนะคะ” after the cross-day penalty in paragraph 2 of `mw-ai-collection/src/message_template.mjs`. Updated `mw-ai-collection/MESSAGE_FORMAT.md` to document the exact line and paragraph structure. The three paragraphs are amounts, payment/closure terms, and bank details. Short reminder wording is unaffected. No message send was requested or performed in this update.

## Rollback point and effects

The immediately preceding template ended paragraph 2 with `📆 ข้ามวัน + ปรับ 500฿`, followed by a blank line. Roll back by removing only the newly added closure line and the two corresponding documentation rows; preserve unrelated work and send history. No AppSheet configuration, financial records, automation, or Looker objects changed. Historical app baseline remains 3.000011; app-version rollback is not applicable to this local template edit. Data-model documentation updates are not applicable.

## Verification

Follow-up: the user explicitly requested another send with the new format. Added one allowlisted revision `2026-09-07-closure-terms` in config.json and src/review_resend.mjs; rollback of this allowance removes only that revision entry and its authorization description, preserving the audit history. Fresh standalone production sync still showed 600 current-day plus 300 overdue, total 900 remaining. Reserved and sent the generated three-paragraph message to verified `__rxrisx__`. Composer text visibly preserved the two blank paragraph separators and approved closure sentence. Complete sent bubble appeared at 20:01 Singapore time, Sending absent and composer empty. Recorded SENT; duplicate reservation returned BLOCKED_DUPLICATE. This supersedes the initial no-send checkpoint above. No financial records or reminder schedule changed. Recipient review remains pending.

Generated synthetic messages for current-plus-overdue, current-only, and overdue-only balances using a synthetic three-line bank block. Verified exactly three paragraphs, with the approved closure text in paragraph 2 and the bank block in paragraph 3. Existing Node tests passed. User can review the next first daily message's three-paragraph layout; no further build acceptance or live-send result is claimed here.
