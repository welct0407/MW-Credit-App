# R019 — Loan-cohort return correction

Owner rejects R018 period ratio and requests profit from the same loans issued in each week, within selected filter dates. Implemented prepared scripts/metabase/CohortLoanReturn.mjs; 12 preflight checks pass. Loan/payment OLAP models reused; each principal counted once. Corrected chart will be labeled/moved to live section. [Scope, evidence and rollback](../outputs/r019-20260924/README.md). Starting ce407b16b747a05d99d30477e182465c52f48c73; private affected-object capture complete. Publication, actual dashboard/UI checks and documentation pending.
