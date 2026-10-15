# R051 related-list SQL-view experiment — 7 October 2026

Owner requested replacing expensive reverse-reference calculations with ordinary SQL views while preserving the same UI, information, freshness and clicks. Starting Git a9e00a98af57d9134b6853f67f49a95837b40ef3, branch codex/r051-appsheet-latency-experiment, draft PR16 stacked on PR15. Baseline OLTP200/OLAP56/V74; unrelated checkout work preserved.

V75/V76 add only public.oltp_payment_related_ids_v1, a security-invoker ordinary view of current child IDs. No physical ID-list columns, cache, maintenance triggers, accounting writes or grants. Candidate204 replaced three Payments reverse-reference formulas and Visible Allocations; existing names/List-of-Ref metadata/inline displays were retained. Bounded current GUI tests passed correction, new receipt, child navigation, source deletion and loan-close/reopen behavior.

Three-sample edit median3.261→2.494s; manual sync2.985→3.450s; paired edit-plus-following-sync6.821→6.593s. Server traces eliminate separate Loans/Repayments/Allocation dependency reads, but full sync still requires their data. No convincing overall loading improvement: original formulas restored in205, helper binding/generated definition removed in206. Final both editors saved with No issues found; OLAP56 unchanged.22 business tables plus settings remain. View stays dormant; no production changes, merge or promotion. Earlier PR16 improvements retained. Offline behavior unverified and candidate not retained.

Backup: verified private V74 dump restored26 matching tables before mutation. Both migrations preserved25 non-Flyway tables. Exact synthetic cleanup preserved22 existing source/audit tables; derived analytics/statistics excluded, zero fixture residue and zero non-owner notification delivery addresses. Full local SQL/concurrency/upgrade CI through V76 passed, including new rollback-only relationship tests. Read-only PROD397-payment view query median8.09ms; not an AppSheet sync benchmark.

Changed files: immutable V75/V76 migrations; view regression/measurement/preservation helpers; parameterized existing backup/GUI/preservation runners; Test-StatementBatch integration; selected DEV dictionary view/formulas and index; current environment/development/release/database references; sanitized evidence. Production dictionary and financial logic unchanged. No model-overview architecture change is needed for a dormant unused view; no affected export/Looker definition.

Rollback already completed for AppSheet. OLTP200 is the recorded baseline and204 retains the candidate. Never edit/delete applied V75/V76; remove dormant SQL view only with a higher migration after dependency review. Final retained DEV206/56/V76. R051 remains Open; owner acceptance and promotion remain separate. Repository publication/remote CI recorded in draft PR16; PR15 shared-DEV note updated.

[Complete evidence, exact formulas, tests, measurements and recovery](../outputs/r051-related-list-views/README.md).
