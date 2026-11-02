# Change notes — R116 Cash Ledger sort and borrower names, 3 November 2026

## Purpose
The owner asked: "Fix the ledger sort and release it in the same release as the other session about principal write offs." and "Show borrower name in preferred language instead of —." This batch is an R116 add-on. The R116 write-off segregation scope (PR #215) and the R116 release records belong to another session, and DEV and PROD deployment ride R116 through that session.

## Changes
Outcome: the Cash Position "Recent" Cash Ledger list reads in transaction time within a day, so the lines of one withdrawal sit together. A row whose other side is a borrower names that borrower instead of "—".

Cause: the owner thought the R115 SCB withdrawal row was missing. A read-only PROD read confirmed that both withdrawal rows exist. The list was sorted by Movement Date and then Row ID, so rows of the same day appeared in Row ID order rather than time order, and the two lines of one withdrawal could be separated.

Design:
- Sort: `cash-movements` orders newest first by Movement Date, then "Created At" (the transaction time), then Row ID.
- Cursor: the Cash Ledger cursor becomes version 2 and carries `createdAt`. A version 1 cursor issued before R116 is rejected as `invalid_request` (HTTP 400) and is never reinterpreted, so the client starts the list again. Contributions and settlements keep the version 1 cursor and their order.
- Borrower name: each row carries its borrower, found through "Ref Payment", then "Ref Loan", then the referral rebate expense's payee, as the statement views do. The side without a cash account shows the borrower's Thai name in Thai and the English name in English. If the preferred name is empty it falls back to the other name, and then to "—". The row's aria-label and title use the same text.
- No SQL migration and no grant change. The offline dataset uses the same read.

Files: `services/business/management-financial.mjs`, `apps/pwa/src/ManagementPosition.tsx`, `apps/pwa/src/ledger-counterparty.ts`, `tests/unit/cash-ledger-list.test.mjs`, `tests/e2e/cash-ledger-counterparty-independent.spec.ts`. Commit `0b0fd1c` on branch `claude/r116-ledger-sort`.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass at `0b0fd1c` |
| `npm run build` | Pass at `0b0fd1c` |
| `npm test` | 1101 of 1102 pass, 0 failures, at `0b0fd1c` |
| Three focused Playwright specs, including `cash-ledger-counterparty-independent.spec.ts` | 18 of 18 pass at `0b0fd1c` |
| The list read on a disposable PostgreSQL database | Pass: time order within a day, version 2 cursor paging, version 1 cursor rejected |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
DEV and PROD deployment and their smoke checks: not run in this batch. They ride R116 through the session that owns R116. The pull request's Development checks have not run yet. WebKit and a real iPhone were not checked.

## Recovery
Git baseline: `80fbf6b` (`main` after the R115 closure, PR #214). No schema or data change, so reverting the commit and redeploying the services and Hosting with R116 undoes it. A client holding a version 2 cursor after a rollback restarts its list (the version 1 reader rejects it).

## Open questions
None.

## Remaining work
Merge into R116 and deploy to DEV and PROD with the write-off segregation scope (other session). Then the owner checks the Recent list and the borrower names.
