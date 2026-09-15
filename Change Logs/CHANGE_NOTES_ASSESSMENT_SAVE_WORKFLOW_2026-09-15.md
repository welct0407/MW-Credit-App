# Assessment save workflow — 15 September 2026

Owner requested removal of Refresh Assessment and revised calculation-pending wording. Implemented in OLAP test copy LoanInsights PG Trial 20260914 only, version 1.000023. Rollback: restore AppSheet version 1.000022. Full definition captured before editing outside Git in the project credential/evidence folder.

Removed the custom Refresh Assessment action. Updated Loan Assessment[Recommendation] and [Recommendation Status] to distinguish changed inputs awaiting results from stored results invalidated by source/date changes. Existing numeric calculations, freshness guards, database objects, production apps and financial rows are unchanged. Hidden SQL Refresh Token remains unused; no schema deletion was necessary.

Original output ownership: Loan Assessment virtual columns, with forecast calculations in Calendar. Current test ownership: stored SQL outputs in public.Loan Assessment SQL Lab, exposed through public.Loan Assessment SQL Lab View as app table Loan Assessment. Recommendation and status remain lightweight virtual columns there. Statistics is not the owner of those assessment outputs.

Checks: fresh app definition confirms 1.000023 and zero Refresh Assessment actions; editor reports No issues found. New desktop interface loads and shows no refresh button. Changing proposed amount 2000 to 3000 immediately showed the new pending message, then automatic sync returned the changed eligible date without a refresh action. Original input restored; final sync verification recorded in outputs/assessment-workflow-20260915/verification.json. Test assessment input only, no new loan or financial transaction. No new performance claim; SQL logic unchanged.

Restoration limitation: the input is back to 2000 in the client, but the read-back verification failed repeatedly with PostgreSQL 53300 connection exhaustion on Calendar. The pending message remains, so database restoration and final returned results are not claimed verified. The test client remains open for recovery; no test financial transaction exists. This infrastructure failure is separate from the successful initial automatic-sync test and saved app configuration.

Model overview and detailed dictionary updated together. Dictionary export reimport checked and unrelated sheets preserved. Downstream production OLTP/OLAP and Looker untouched. Owner acceptance pending: change an assessment input, observe pending text, then verify the returned result after normal sync. Auto-sync on opening reads stored outputs; it does not fire an update trigger for unchanged inputs.

Rollback instructions: restore test app version 1.000022 to recover the action and former messages; restore these documentation files from the prior Git commit if rolling back. No database rollback is required.
