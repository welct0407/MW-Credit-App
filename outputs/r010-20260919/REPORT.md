# R010 DEV report — GUI validation for predictable payment rejections

R010 is implemented in DEV OLTP **1.000036** and is **Ready for review**. The editor is Deployed and reports **No issues found**. DEV OLAP remains **1.000015**, SQL remains **V26**, and PROD remains R009 at OLTP **3.000231** / OLAP **1.100181**.

The change puts predictable rejections at the form boundary:

- new direct receipts require borrower, amount and payment date and show bilingual messages for competing receipts, invalid amount/date and inactive receiving account;
- Posted receiving-account/holder corrections compare against `_THISROW_BEFORE` and require Notes to preserve the prior text and append a reason;
- Receive Full, Receive All and Loan Close command account fields return an empty eligible-account list when the current charge, borrower or loan is no longer eligible, with visible balance/prerequisite guidance.

The initial Posted-correction expression used LOOKUP to recover the prior row. Current-GUI testing showed that unchanged Posted receipts were incorrectly marked invalid. The final 1.000036 definition uses `_THISROW_BEFORE`; an unchanged Posted receipt then opened cleanly, while an account change without an appended reason remained blocked.

GUI validation was write-free: the blank new-receipt form and invalid Posted correction both remained open with their messages, then were cancelled/discarded. No payment, repayment, allocation, cash-ledger or notification side effect was created. The quick-command conditions were read back from the saved editor; a concurrent stale-balance write was not fabricated.

Exact expressions and messages are in [dev-saved-readback.json](dev-saved-readback.json) and the workbook `Dev Differences` rows 2790–2811. Test details are in [TESTS.md](TESTS.md). Rollback is DEV OLTP **1.000033**. No RC or PROD action has been taken.
