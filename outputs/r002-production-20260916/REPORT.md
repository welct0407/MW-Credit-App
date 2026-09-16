# R002 production promotion report

Status: **Deployment applied; verification incomplete** on 16 September 2026.

Flyway V17 and V18 were promoted from pinned commit `f3a0d6616fad483f5e05e234b3608873cc427739` after a fresh private backup and isolated restore. Migration and validation succeeded. Production reconciles to contributed capital 120,000, outstanding principal 116,394, available cashpool 3,606 and partner shares 0.60 / 0.40. The production database migration was successful.

Production AppSheet saves finished at OLTP 3.000134 and OLAP 1.100106. The loan form uses the short bracketed limit and gives the bilingual form-level over-limit warning. Borrower navigation is saved for Loans, Charges and Repayments in both apps. Collection keeps its original row-to-detail page; the Borrower Name TE header and status colors are preserved, and the approved native Ref inside the existing detail opens the matching borrower viewer. No financial test row or notification was created.

GitHub's failed migration emails came from disposable test fixtures that lacked contributed capital under the new V17 guard. Production was already healthy. The fixtures and concurrency expectation were corrected, and both the full migration workflow and R002-specific workflow pass locally. GitHub Database migrations run #25 for corrective commit `8e244e9` completed successfully in 2m 23s.

The old Borrower Name - Collection virtual column has no active dependency. Its deletion is the one remaining production configuration action and requires action-time confirmation because it deletes a live cloud configuration object. After that deletion, update the tracker from Deployment applied; verification incomplete to Released.

Rollback: restore OLTP 3.000121 and OLAP 1.100101. Remove V18/V17 only through a reviewed higher Flyway migration after removing app references. The private V16 dump is an emergency recovery artifact; restoring it over later production writes requires separate authorization and reconciliation.
