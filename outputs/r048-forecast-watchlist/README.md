# R048 Forecast watchlist Loan Key

On 27 September 2026, the owner asked to replace **Loan reference** with **Loan Key** in Forecast watchlist. The saved Metabase question [360](https://reports.mw-credit.com/question/360-forecast-watchlist) on Forecast & Planning tab262 now displays the same readable loan-key format used by Borrower Detail: borrower name, original principal, loan date and effective daily interest rate. Its row set, order, other values, dashboard placement, filters and other questions are unchanged. No SQL migration, AppSheet change or source financial write was needed.

Before editing, a recovery copy of dashboard3 was created as dashboard **23** and the exact original question/dashboard definitions were saved privately under the project `r048-forecast-watchlist` folder. [Verification](verification.json) compares all 34 returned rows before and after the edit, checks the new column and confirms other values and dashboard structure are unchanged. Chrome Wel displayed the new column; its screenshot is retained privately as `watchlist-loan-key.png`. The exact saved definition is [saved.json](saved.json), and the affected dictionary question is updated. Dictionary validation is in [dictionary-validation.txt](dictionary-validation.txt).

To revert, restore question360's original SQL and visualization settings from the private `card-before.json`, after checking for later changes. Recovery dashboard23 is the report rollback reference. No database or financial-data restore is involved. R048 remains Open; this refinement does not freeze it or allocate R049.

28 September: effective-rate suffix replaced with stored original integer rate. [Current verification](../r048-forecast-original-rate/README.md).
