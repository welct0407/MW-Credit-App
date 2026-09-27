# Forecast original-rate alignment

28 September 2026 Bangkok. Owner authorized direct production correction of question360, dashboard3 / Forecast & Planning tab262. It now uses stored Original Daily Interest Rate and displays `10%`; its previous independent expression used Effective Daily Interest Rate with two decimal places.

1. Captured exact question/dashboard definitions privately and created recovery dashboard24. Starting Git commit4b682c5e3a50b446b09e6ec02ad86af56a03ec9c.
2. Compared original and proposed queries: all36 rows, column names and every non-key value unchanged.
3. Replaced only the percentage expression with `coalesce(k."Original Daily Interest Rate"::text||'%','Unavailable')`. Principal/date formatting, filters and visual configuration preserved.
4. Read back and executed saved question: integer percentage suffixes verified for every row; dashboard unchanged. See [verification](verification.json) and [saved definition](saved.json).
5. Chrome Wel canonical question visibly shows whole percentages and36 rows. Screenshot and borrower data remain private under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r048-forecast-original-rate/`.
6. Updated generator, dictionary and current references. No AppSheet, schema, financial amount or charging logic change. R048 remains Open. Other independent report keys are outside scope; no pending manual check for this correction.

Rollback: restore question360 dataset_query from private `card-before.json` in the above folder. Dashboard24 preserves report recovery. Do not replay the completed guarded helper.
