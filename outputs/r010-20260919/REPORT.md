# R010 DEV report — Payment validation and Cash Account Statement

**Ready for owner review.** Current DEV OLTP **1.000052**, SQL **V27**; both DEV editors have zero issues. The owner-confirmed OLTP 1.000038 manual baseline was preserved. Current companion OLAP **1.000017** was not edited by this feature; reconcile its owner scope before RC capture. PROD remains R009 / SQL V26.

Cash Statement is available from the OLTP menu. Select an active account and one of the latest 15 Bangkok dates to see the daily summary and chronological Time / Transaction / From-To / Amount / Balance table. Financial rows are read-only; only private account/date preferences change. SQL computes balances using full history and initialized baseline semantics, then limits recent output. Unknown opening balances remain blank with an explicit status.

[Statement GUI evidence](cash-statement/GUI_TESTS.md), [SQL evidence](cash-statement/SQL_TESTS.md), [exact configuration](cash-statement/appsheet-config.json), [manifest](release-manifest.json), [promotion continuation](promotion-checklist.md).

Extension rollback: OLTP 1.000038 plus compatible additive V27 (verified private backup recorded in SQL evidence). Actual Thai second-user/physical-device testing and owner acceptance remain pending; initialized balances have disposable SQL coverage. No RC/PROD deployment or financial GUI write occurred.

## Earlier payment-guard implementation (retained evidence)

R010 is implemented in DEV OLTP **1.000036** and is **Ready for review**. The editor is Deployed and reports **No issues found**. DEV OLAP remains **1.000015**, SQL remains **V26**, and PROD remains R009 at OLTP **3.000231** / OLAP **1.100181**.

The change puts predictable rejections at the form boundary:

- new direct receipts require borrower, amount and payment date and show bilingual messages for competing receipts, invalid amount/date and inactive receiving account;
- Posted receiving-account/holder corrections compare against `_THISROW_BEFORE` and require Notes to preserve the prior text and append a reason;
- Receive Full, Receive All and Loan Close command account fields return an empty eligible-account list when the current charge, borrower or loan is no longer eligible, with visible balance/prerequisite guidance.

The initial Posted-correction expression used LOOKUP to recover the prior row. Current-GUI testing showed that unchanged Posted receipts were incorrectly marked invalid. The final 1.000036 definition uses `_THISROW_BEFORE`; an unchanged Posted receipt then opened cleanly, while an account change without an appended reason remained blocked.

GUI validation was write-free: the blank new-receipt form and invalid Posted correction both remained open with their messages, then were cancelled/discarded. No payment, repayment, allocation, cash-ledger or notification side effect was created. The quick-command conditions were read back from the saved editor; a concurrent stale-balance write was not fabricated.

Exact expressions and messages are in [dev-saved-readback.json](dev-saved-readback.json) and the workbook `Dev Differences` rows 2790–2811. Test details are in [TESTS.md](TESTS.md). Rollback is DEV OLTP **1.000033**. No RC or PROD action has been taken.
