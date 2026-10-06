# R051 AppSheet latency experiment — 6 October 2026

Owner authorized priorities1/2 (virtual-column cost and save-time overhead) with a separate test branch/PR. Started from published PR15 commit7a0231d0ed964cf1e869ecd43c6521fb07a5e457; preserved unrelated main-checkout work. R051 remains Open; no merge/PROD changes.

DEV OLTP198→199→200: guard hidden Payments Eligible Charges and Eligible Outstanding only for server evaluation of Posted rows. Original form expressions remain in all other contexts. Saved AppDoc readback is exact; current editor has no issues. OLAP56, V73, all seven methods' unified engine, active automation and synced-table membership are unchanged. The already-disabled legacy processing chain is not a source of duplicate posting.

Three matched corrections improved median3.633→2.694s (25.8%) in a small sequential DEV sample. One add improved7.062→3.550s; no statistical/general sync claim. Receive All remains slow (14.541s, including10.301s borrower virtual-column work), explicitly outside the measured receipt-edit benefit. Retain candidate for review. [Exact changes, measurements, tests and limits](../outputs/r051-appsheet-latency/README.md).

Recovery: app198 and exact before-expressions; fresh private backup restored26 matching tables. Bounded GUI correction/new receipt/Receive All/invalid amount/delete checks passed, then exact fixture cleanup preserved23 pre-existing source/audit/history tables. DEV notification delivery remains owner-only with one actor mapping. Full maintained local SQL CI passed; dictionary/patch and publication CI results are recorded with the branch/PR evidence. No migration or new database object. Reuse unchanged seven-method and companion-app coverage; no mobile-device performance claim.

Changed files: two selected Payments dictionary properties/current DEV version and navigation metadata; environment/development/release references; three receiving-test helpers' scoped evidence directory handling; sanitized experiment evidence. Rollback changes only the two formula properties unless a whole-app restore is still safe. No forced history rewriting, no sources edits, no unrelated files staged.
