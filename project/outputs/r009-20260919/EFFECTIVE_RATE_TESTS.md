# R009 effective daily interest rate — DEV evidence

19 September 2026. PROD was not changed.

The existing OLTP `Loans[Effective Daily Interest Rate]` virtual column now divides the applicable daily-income amount by `Outstanding Principal`. It returns zero when outstanding principal is zero. `Loan Key` remains unchanged. Saved AppSheet documentation independently read back the formula at DEV OLTP **1.000032**, and the editor reported **No issues found**.

Flyway V26 applies the same rule to `public.olap_loans_analytics` without changing the view signature. The full migration chain passed twice with checksum-tampering rejection. Synthetic full-balance, partial-balance and zero-balance cases passed. The post-migration live DEV audit returned 129 loans, 7 partial-balance loans, 0 nonzero rates on zero balances and 0 calculation mismatches; machine-readable output is in [effective-rate-sql-readback.json](effective-rate-sql-readback.json).

Rollback points: DEV OLTP **1.000031** and private DEV schema backup `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/development-schema-20260919-204149.sql`. V26 is immutable; database correction is a reviewed forward migration. R009 remains In development because the owner's wider GUI work is still ongoing.
