# R008 DEV review candidate — revision 1

Frozen implementation/evidence commit: **f284d1f959b2f8796a4bd6e5e18e6a79a104e932**.

Canonical configuration candidate SHA256: **6aefc0d2f33d48f3eb2c8b94c1728f09b720af027cdc0121a374f0fef36feea2**.

Tested DEV: SQL **V24**, OLTP **1.000176**, OLAP **1.000169**, both Prototype. [Delta](release-delta.json), [167/167 DEV comparison](dev-comparison-r1.json), [SQL manifest](flyway-manifest-r1.json), [report and recovery](REPORT.md), [running edit reconciliation](appsheet-edit-record.md). App identities and exact environment substitutions are in the delta. All files at the implementation commit form the candidate, including the model workbook and retained passing SQL tests. No candidate app edit followed the saved readbacks.

Dependencies: released **R007**, including R005/R006. PROD baseline: SQL **V22**, OLTP **3.000173**, OLAP **1.100131**. Pending SQL promotion order is V23 then V24 using the frozen files/hashes. Synthetic accounts, borrowers, financial fixtures and DEV owner-only recipients are not production data/configuration to copy blindly.

Status: **Ready for review, subject to listed checks/owner decisions. Not approved for production.** Owner must accept the compact one-field fallback/mobile experience, provide real account/default/opening allocations, and review the proposed exact-receipt recipient-context adaptation. Live DEV account openings are intentionally uninitialized. Physical-phone and physical push delivery acceptance remain unverified. Prototype's two specifically recorded schedule limitations remain visible; no other editor configuration issue was found.

Rollback points and private restorable DEV backups are documented in the report. Production needs its own current verified backup and restorable app versions before authorization is acted on. Forward correction is preferred after later financial writes; never overwrite newer data with the initial snapshots.

Promotion must confirm delta-related PROD drift, apply the entire approved dependency-ordered batch, independently read back every frozen PROD target and perform relevant GUI/SQL checks. The checklist's production documentation closure rows remain pending until that separate promotion. Owner authorization must identify this revision; changed candidate scope requires a new revision and affected retesting. The capture script refuses to overwrite this frozen revision.
