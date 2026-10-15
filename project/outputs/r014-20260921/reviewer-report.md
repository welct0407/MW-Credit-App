# R014 AI Reviewer — DEV verification

21 September 2026. DEV complete; no production promotion or VM deployment performed.

- V32 adds Partners.AI Reviewer boolean NOT NULL DEFAULT false. Stable verified Tommy identity is true; Lisa false. New inserts default false and null is rejected. No financial rows, existing columns, views, grants or triggers changed. Existing explicit-column reporting consumers remain compatible.
- Target verified: project clever-oasis-508610-n7, shared instance appsheet-pg-prod-20260914, host 34.21.174.215, database loan_manager_dev. PROD is still V30. Private DEV pre-change backup/hash and archive validation are in reviewer-backup.json; this is not a claim of a completed restore drill.
- App rollback: OLAP 1.000028, OLTP 1.000073 observed live before edits (the tracker had previously recorded OLTP 1.000072; intervening saved configuration was preserved).
- Both apps regenerated only Partners. The new column is Yes/No, Show TRUE, Required TRUE, Initial FALSE, not key/label/search/scan/NFC/PII; display expression `"ผู้ตรวจสอบ AI / AI Reviewer"`. OLAP Editable TRUE; OLTP Editable FALSE with existing READ_ONLY table permission. OLAP Partners_Form automatically includes it; explicit Partners_Detail order now includes it after IG Integration Enabled. No other view order or calculation changed.
- Current GUI: Tommy's Partner form showed selected Y; saved Y through the form. After app reload, Tommy detail displays Y and Lisa detail N. SQL readback independently confirms Tommy true/Lisa false; DEV delivery remains owner-only. OLTP loads/syncs and retains read-only reviewer setting.
- Final saved/reloaded DEV versions: OLTP **1.000075**, OLAP **1.000031**. Both Deployed, Save disabled, **No issues found**.
- Database tests: full Test-CI passed; isolated migration rebuild through V32, repeat no-op and checksum rejection passed. Test-R014Reviewer verified false default, null rejection and explicit selection. The existing runner's baselineRebuildMatch=false means no baseline comparison was requested, not a failed test. DEV migrate and validate passed.
- Integration agent commit `83e1b56`: 102 local tests passed, two existing platform skips. Real DEV master SELECT and reviewer filter independently passed with one reviewer and both Partner recipients retained. No live send or payment test. The private runtime is unchanged until R014 promotion.
- Data dictionary: four DEV differences appended; existing values/formulas preserved and rendered. Model overview, tracker, inventory, open differences and manifest updated. Agent process diagram page 17 labels the staged role restriction separately from current production policy.

## Deployment and recovery

The expanded batch includes V31 and V32. Pin a new complete Flyway manifest; the old V31-only manifest is not the expanded release package. Verify Tommy's stable Partner identity in PROD before migration. Promote SQL, prepare/freeze both PROD-bound RCs, upgrade both existing apps, then deploy the pinned agent runtime with the reviewed updater. It checks V32's column before stopping timers or installing. Check production API enablement under the existing operational rule. Test a genuine reviewer direct reply under the authorized workflow; never post a synthetic financial record.

Current accepted messages retain correlation because the new role list is separate from immutable notification snapshots. Only current reviewers can decide; removed reviewers cannot authorize old requests. Unsent non-reviewer requests stop. Unknown previous posting outcomes remain readback-only. Closures/overpayments remain manual. New requests wait if no reviewer is selected. Existing request replacement remains explicit through the shared reconsideration command.

Rollback retains the additive column, saved app versions and private journals. Pausing review/execution is safer than silently restoring the old all-Partner approval policy. Do not restore old journals over later accepted messages or payments. Production authorization, frozen RCs and a real post-deployment reviewer reply remain outstanding.
