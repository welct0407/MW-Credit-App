# Change notes — R111 Pay Forward Release 2, referral rebate offset, 2026-11-02

## Purpose
At Loan Close the referral rebate (10% of interest received, at most 1,000 baht) is booked as a Business Expense paid by Lisa in cash. To offset the referrer's own loan the Partner hand-books a future charge and a payment, and the expense still looks unpaid. R111 lets the Partner offset the rebate against the referrer's open loan inside the Loan Close command. Design record: the owner-approved [plan artifact](https://claude.ai/artifact/6iCRmdeKsroNkf6NxKrZBj) (Pay Forward Design, revision 6, sections 3.2, 4.0, 5, 6 and 7); no new design document.

## Changes
Scope: Release 2 only, on top of R110 (`pwa_pay_forward_plan_v1` and payment command v10). Release 3 (the receipt agent) is a later release and is not part of R111.

Owner authority (2 November 2026): "Merge PR 202 and promote to prod. After it's done, start release 2 development, and test it in dev". It authorizes building R111, the D2 schema change (new nullable column "Ref Offset Payment" on Business Expenses and payment method "Referral Rebate Offset"), opening the pull request and the DEV deployment and test. It does not authorize PROD, merging or Release 3.

Owner decisions (plan revision 6):
| Id | Decision |
| --- | --- |
| D2 | New column "Ref Offset Payment" (nullable, foreign key to the payment) on Business Expenses and payment method "Referral Rebate Offset": both authorized |
| D3 | Rebate choice at Loan Close when the referrer has an open loan: "Offset referrer's loan" is preselected, the Partner can switch to "Pay out as expense" |
| D4 | Deleting the closing payment removes the rebate expense and the linked offset payment; booked charges stay and reopen. Deleting the offset payment alone is refused ("Remove through the closing payment") |

Planned areas (Release 2 scope; the file list is filled from `git status` at hand-off):
- Database: migration V122: the column, the payment method (cash effect of Cash, received by Lisa in cash), the offset posting inside the Loan Close command through the pay-forward plan (purpose forward only; amount = rebate; close date; notes "Rebate from loan <key>"; several open loans use the earliest next date; a rebate beyond the 93-day schedule offsets up to the horizon and the rest stays a payable expense), the chosen path stored on the closing command so a re-close repeats it, the linked deletion and the refusal of a lone delete, and the read-role grant as needed. V122 also adds `pwa_notify_content_v2` for the notification line below. The rebate rule, Lisa's cash netting to zero for the day and the Partner profit split are unchanged.
- PWA: Loan Close rebate line with the offset preview from the same plan function; a referrer without an open loan shows "Rebate X to <referrer>, transfer from Lisa" on the confirmation and the result; Expenses shows "Settled by offset" with referrer and loan key; payment method label; Collection "Paid in advance" caption "rebate offset" when the paying payment is an offset.
- Notification: the existing "Loan closed" push to Lisa carries the same transfer line when the rebate is paid out. Content change only; no new notification type and nothing forced.
- Chat rules asset `services/chat/assets/conversation-business-rules.md`, sections 6 and 9: updated after the code lands, from Archie's design.
- Tests: SQL (offset posting, cash net zero, linked deletion, lone-delete refusal, re-close repeating the choice, horizon remainder, several loans, the no-open-loan path unchanged), unit, integration, Loan Close and Expenses Playwright.
- Not in scope: bank-transfer initiation, a "paid" flag, a reminder table, a new status.

Team (six-agent process, this session): Archie designs, Byte builds the code, Chase verifies on a disposable cluster and on DEV, Echo reviews the built UI, Dewey keeps records. Forge deploys DEV, including the notify worker, because V122 adds `pwa_notify_content_v2`; PROD is not authorized.

Carried over from R110: the "Paid in advance" tile date was not yet seen on DEV (it appears only from 2 November). Chase checks it during the R111 DEV test.

## Checks
| Command | Result |
| --- | --- |
| (to be filled) | |

## Not run
To be filled at hand-off. A skipped check is not a pass.

## Recovery
Before release: revert the pull request (Git baseline R110 `2546e64` plus later main commits). Schema: V122 adds a nullable column and functions; rollback is a later migration. To be completed at hand-off.

## Open questions
None for the owner at this point.

## Remaining work
- Build, verification and review by the team; fill Checks, Not run and the file list.
- Chat rules asset sections 6 and 9, after the code lands.
- Open the pull request and deploy to DEV for testing (authorized); PROD promotion and merge need a separate scoped owner instruction.
- Release 3 of the plan.
