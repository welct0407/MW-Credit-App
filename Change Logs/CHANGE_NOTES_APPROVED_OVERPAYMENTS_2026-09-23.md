# Reviewer-approved overpayment posting — 23 September 2026

Owner request: reviewer approval of an overpayment should record the full receipt amount as Lump Sum. Ordinary automatic payments remain automatic; potential loan closures remain manual. Source baseline f5890c6720c8fd3cb5f080f4bea62fceeee3fb08, clean tree.

New overpayment proposals carry approved_allocation_method=Lump Sum and explicit English/Thai wording. The existing signed, exact-message reply coordinator verifies current reviewer membership/identity, fresh receipt/borrower/account/balance facts and duplicate/manual postings. Only that authenticated approval path passes internal authorization to the existing Payments Add adapter. It sends the full amount and Allocation Method=Lump Sum, preserving account, reference, receipt date/minute and approving Partner actor. Automatic policy cannot execute overpayments. POSTING is claimed once; unknown outcomes never replay Add; exact readback precedes existing localized success notices.

Earlier manual-only proposals remain distinct. Their replies are not reinterpreted; an eligible pending request must be superseded through receipt-reconsider and receive a new linked approval. Rejected/manual-completed/posted/unknown history is not reopened. One pending old overpayment request was observed read-only before deployment and will be refreshed through that standard flow.

No AppSheet or database schema change; no product release needed. Catalogue revision 17, review operating guide and process diagram are updated. Existing database reconciliation/eligible-balance rules remain authoritative: reviewer approval cannot waive them. Live read-only verification confirmed loan_manager_prod and the post_payment reconciliation guard. No new financial fixture was sent.

Checks: 27 review cycle/execution tests and 15 proposal/reply tests passed, covering full-amount request payload, approval-only execution, pending/rejected/automatic denial, older manual-only requests, closure exclusion, changed facts/reviewer removal, and unknown-outcome idempotency. Diagram and catalogue validation pending with deployment.

Recovery: verified successful Cloud SQL backup 1790078400000 completed 2026-09-22T12:57:38.892Z. Reviewed installer preserves current package/configuration; retain current PostgreSQL journals on rollback and reconcile any financial effects. Restore the prior package to stop the new overpayment execution path. Google Cloud authentication was refreshed using the owner-requested work Chrome profile; no Instagram browser interaction.

Status: tested implementation; publication/deployment, pending-request refresh and scheduled verification pending.
