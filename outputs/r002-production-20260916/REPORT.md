# R002 production promotion report

Status: **Released** on 16 September 2026.

Flyway V17 and V18 were promoted from pinned commit `f3a0d6616fad483f5e05e234b3608873cc427739` after a fresh private backup and isolated restore. Migration and validation succeeded. Production reconciles to contributed capital 120,000, outstanding principal 116,394, available cashpool 3,606 and partner shares 0.60 / 0.40. The production database migration was successful.

Production AppSheet saves finished at OLTP 3.000135 and OLAP 1.100106. The loan form uses the short bracketed limit and gives the bilingual form-level over-limit warning. Borrower navigation is saved for Loans, Charges and Repayments in both apps. Collection keeps its original row-to-detail page; the Borrower Name TE header and status colors are preserved, and the approved native Ref inside the existing detail opens the matching borrower viewer. After explicit owner confirmation, the retired Borrower Name - Collection VC was deleted and the Borrowers schema now has 41 columns. The live production Collection page still opened the original detail, and its native Ref opened the matching Borrowers_Detail. No financial test row or notification was created.

GitHub's failed migration emails came from disposable test fixtures that lacked contributed capital under the new V17 guard. Production was already healthy. The fixtures and concurrency expectation were corrected, and both the full migration workflow and R002-specific workflow pass locally. GitHub Database migrations run #25 for corrective commit `8e244e9` completed successfully in 2m 23s.

All frozen checklist objects are verified. R002 is Released; R003 remains preserved as the intervening corrective release for R001.

Rollback: restore OLTP 3.000121 and OLAP 1.100101. Remove V18/V17 only through a reviewed higher Flyway migration after removing app references. The private V16 dump is an emergency recovery artifact; restoring it over later production writes requires separate authorization and reconciliation.
