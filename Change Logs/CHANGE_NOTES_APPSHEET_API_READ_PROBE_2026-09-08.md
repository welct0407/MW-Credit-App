# AppSheet API read-only connection verification — 2026-09-08

## Scope and status

Completed the first connection check for the collection API migration. Awaiting user verification before integrating API reads into the master cycle. No API Add/Edit/Delete/action execution, financial mutation, message sending, scheduler change, or AppSheet schema/configuration edit occurred in this step.

## Local artifacts and credential handling

- `mw-ai-collection/local/api-read-probe.mjs`: standalone Find-only probe; reads the user-provided credential file at runtime and sends the key only in the official AppSheet API request header. Redirects are rejected; errors suppress raw response/credential content.
- `mw-ai-collection/local/api-read-probe/`: private responses for the synthetic test borrower and referenced rows. Both locations verified ignored by Git. Responses include sensitive fields and must remain local; not reproduced in this change log.
- This change log contains only synthetic test balances and aggregate check results. No key, bank account number, or unrestricted borrower roster is included.

## Checks and measurements

All requests used POST with Action Find, explicit Row ID keys, Locale en-US and SE Asia Standard Time. Borrower references supplied the charge, payment and effective-bank keys; the previously verified settings singleton was explicitly selected.

| Table | Rows | HTTP | Single request duration |
| --- | ---: | ---: | ---: |
| Borrowers | 1 | 200 | 3.837 s |
| Charges | 4 | 200 | 2.890 s |
| Payments | 5 | 200 | 2.703 s |
| Collection Bank Accounts | 1 | 200 | 1.735 s |
| Collection Settings | 1 | 200 | 0.705 s |

The last four requests ran concurrently. These are individual observations, not a full-cycle benchmark or token-savings measurement.

API includes calculated fields. Lisa's communication name is Lisa, collection and late-penalty flags are enabled, effective receiving-bank reference is populated, and setup issues are empty. Latest payment is Posted: received 300, posted 300, posting difference 0.

Fresh standalone production app collection-board comparison confirmed: displayed Amount Due 1,800, Collected Today 300 and Remaining 900; four referenced charge balances match API: 300 and 100 for September 8, 200 for September 7, and 300 for September 6. Preserve AppSheet's definitions: Amount Due minus Collected Today is not equivalent to Remaining because prior payments are also relevant.

## Rollback point and downstream effects

No app configuration changed, so no new app-version rollback was required. Previously documented version 3.000024 predates the user's API-enablement action; current version was not reverified and is not asserted here. Existing scheduler, source guards, financial write paths and Instagram workflow remain as before. Local probe is isolated from the runner; rollback is to stop using/remove this newly introduced local probe and its private outputs. Do not remove or alter the credential file.

## User verification and next step

Verify Lisa's production collection board shows the same balances at the comparison time, allowing for subsequent scheduled updates. After acceptance, implement a shared API read adapter and compare its normalized observations against the existing UI workflow before switching scheduled reads. Financial API writes require separate validation of late-fee readback and existing payment-posting automation behavior. No data-model documentation changes apply to this read-only probe.

References: https://support.google.com/appsheet/answer/10105770?hl=en and https://support.google.com/appsheet/answer/10105398?hl=en.

## Subsequent status — 8 September 2026

User accepted Lisa balance comparison and authorized the next build. Superseded by completed full read/write cutover; see CHANGE_NOTES_APPSHEET_API_CUTOVER_2026-09-08.md.
