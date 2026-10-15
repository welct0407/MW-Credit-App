# R008 DEV candidate — revision 4

Implementation/evidence commit **003c1f15a0b25802c22a1c3d43cfaba9d4f5926a**.

Canonical configuration SHA256 **3a689c3d9a658f1927c57cb202ee06b0c74bdd10de0527a71783ca4a5cbfd656**. [199-item delta](release-delta.json), [DEV comparison](dev-comparison.json), [scope, tests, limitations and recovery](REPORT.md).

DEV SQL V24 / OLTP 1.000181 / OLAP 1.000170, both Prototype. Revision 4 supersedes revision 3 for review and includes native borrower Ref navigation in six detail views, removal of four custom actions and detail-wide Receive All suppression while preserving Collection's inline selector. The 33 refinement items include generated dependencies and nine updates to existing release targets. Unaffected original observations/tests retain their original versions/timestamps; OLTP navigation saved at 1.000180 is unchanged at 1.000181, whose only additional edit is Receive All visibility. All six native field-navigation tests and inline selector/Cancel pass. The specific previously owner-excluded Prototype schedule limitations remain visible; no other editor issues.

SQL V23/V24 hashes, dependency order and recovery remain the [original frozen manifest](../flyway-manifest-r1.json). Dependencies remain released R007/R005/R006. No SQL or financial writes in this refinement. Immediate app rollback points: OLTP 1.000179 / OLAP 1.000169, or use captured prior affected definitions while preserving subsequent work. Git starting commit 6220df6748159e0d412c7669d8fc5b5ebfb3f13e.

Ready for review subject to existing owner mobile/opening/recipient decisions; not production-authorized. PROD remains V22 / OLTP 3.000173 / OLAP 1.100131. Production requires scoped approval, current recovery points, drift checks, independent target verification and documentation closure. Later changes require a new revision and affected retesting.
