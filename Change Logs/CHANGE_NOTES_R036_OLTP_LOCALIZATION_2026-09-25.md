# R036 — OLTP localization refinements

Date: 25 September 2026. Status: **DEV implemented and verified; owner acceptance / production promotion pending. R036 remains Open.**

Purpose and scope: add missing Thai display names to Dashboard Total Cash Pool, borrower Today's Collection Charges and Loans_Detail Related Charges; make seven primary/menu navigation views and thirteen Payments_Detail field labels follow the logged-in Partner's language preference, using the existing Cash Statement identity/language pattern. Cash Statement itself is unchanged. Exact expressions and English/Thai labels are documented in the DEV AppSheet dictionary objects and [implementation evidence](../outputs/r036-oltp-localization/README.md).

Changed live object: DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`, saved 1.000090 → 1.000091. Version 1.000090 is the rollback point and includes prior intervening changes beyond R036 interest version 1.000086; this batch preserved them. DEV OLAP 1.000033, SQL and PROD remained unchanged. No data/financial write, schema regeneration, route or notification change.

Changed files: this log; `outputs/r036-oltp-localization/README.md`; new/updated R036 DEV AppSheet dictionary objects and index; release tracker, environment/development differences and model overview. Starting Git commit `74912733825a441283071f44a7b347d979b38566`. Unrelated pre-existing untracked risk-redesign and R026 files were preserved.

Checks: saved OLTP app loaded/synced. English Partner view rendered five primary and three menu labels in English, Dashboard cash-pool Thai/English label, translated Payments_Detail labels on the existing synthetic payment, bilingual Related Charges on its linked loan, and bilingual Today's Collection Charges on a borrower opened from Collection. Both final saved editors had zero issues and Deployed mode. Thai expression branches were reviewed but not independently rendered under a Thai-preferring session. Dictionary validation and Git publication evidence are in the implementation record.
Dictionary validation passed with 1,226 documents and zero errors; the saved OLTP editor was reloaded at 1.000091 for expression readback. The three pre-existing dictionary limitations remained unchanged.

Rollback: restore DEV OLTP 1.000090, preserving unrelated earlier R036 SQL and app changes. Reconcile intervening 1.000087–1.000090 saves before RC capture. R036 stays Open; no tag or production deployment from this batch.

## Business Expenses Detail and Form refinement — 25 September 2026

DEV OLTP saved 1.000091 → 1.000092 (1.000091 is the restorable pre-change version). Five Business Expenses column Display names are now fixed Thai / English strings, matching the existing Paid By format: Expense Date, Expense Category, Amount, Payee Name and Notes. Existing bilingual Paid By, Paid From Account, Related Borrower and Related Loan labels were retained. No Partner-profile lookup, view definition, data, DB, route, notification or posting behavior changed.

The saved editor was reloaded at 1.000092; Business Expenses_Detail rendered all five new labels on an existing expense, and Business Expenses_Form rendered all five on an unsaved new-expense form. The form was cancelled without a financial write. OLTP editor diagnostics showed **No issues found** and Deployed mode. OLAP was unchanged; its prior zero-issue check remains applicable. Exact DEV expressions are in the new `table-business-expenses-labels.yaml` dictionary object; the implementation record, tracker, environment inventory, development differences and model overview were updated. Dictionary validation passed with 1,227 documents and zero errors; its three pre-existing limitations were unchanged. Starting Git commit `6d8d47fcabfd9f5fc70129c5cc4954aa680f5fa5`; unrelated working-tree files were preserved. Rollback is DEV OLTP 1.000091. R036 remains Open; owner acceptance and production promotion are pending.
