# R014 — AI Reviewer role

Owner clarified `AI Reviewer` belongs to Partners and initially selects Tommy. AppSheet R014/V32 owns the false-default boolean and initial assignment; this repository consumes that role independently from existing notification identities. Baseline `b0b8c36c0a211bedf1421df1a57695b7e200f3c1`, clean before edits.

Only reviewers receive proposals and may approve or reject signed direct replies. Role membership is re-read at dispatch, decision and execution. No reviewer leaves the validated receipt waiting. Removing an approving reviewer makes an unposted approval stale. Already uncertain posting outcomes continue readback-only. Partner result notices and daily summaries retain their recipients. Manual closure/overpayment policy is unchanged. Separate reviewer IDs preserve existing immutable Partner delivery snapshots and accepted-message correlation.

Changed receipt_master, partner_review, review_cycle, related tests and deployment prerequisite. `update-reviewed-runtime.sh` refuses installation before the non-null boolean exists. This is a coordinated R014 dependency, not a production deployment. No live financial write, notification, service activation or cutoff reset performed.

Local suite: 102 tests passed, two existing platform skips. Added non-reviewer approval/rejection denial, absent-role denial, reviewer-only dispatch, removed-reviewer execution block, no-reviewer waiting and unchanged all-Partner result tests. Corrected an existing webhook test's floating-point boundary fixture to allow one second between receipt and processing, without changing production filtering. SQL and app evidence live in AppSheet-Loan-Project's R014 report.

Rollback: before production activation retain the current package/config and integrity-checked journals via the reviewed updater. Revert agent code only with explicit awareness that the old policy allowed all Partners to decide; preferably pause review/execution while reconciling a rollback. Keep the additive column and all accepted-message/payment journals. Pending accepted requests remain valid only for current reviewers. Reconsider pending requests explicitly if a newly selected reviewer needs a replacement; never copy an old approval.

Status: implemented and tested locally, awaiting R014 production promotion and coordinated VM deployment. A real reviewer direct-reply test remains a production activation check; no synthetic payment will be posted.
