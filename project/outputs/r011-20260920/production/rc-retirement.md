# R011 release-candidate retirement

Date: 21 September 2026

The owner explicitly authorized deletion of all R011 release-candidate apps after successful production closure. The following six AppSheet apps were deleted through Manage → Collaborate & Publish → Delete App:

- `MW-OLTP-R011-RC1-578763613`
- `MW-OLAP-R011-RC1-578763613`
- `MW-OLTP-R011-RC2-578763613`
- `MW-OLAP-R011-RC2-578763613`
- `MW-OLTP-R011-RC3-578763613`
- `MW-OLAP-R011-RC3-578763613`

Post-deletion verification opened each exact internal-name editor URL. All six resolved to AppSheet `Home/NotFound` with title `404 - AppSheet`, and none exposed editor controls. Canonical DEV and PROD apps were excluded from the deletion targets.

The RC definitions are not recoverable. Remaining R011 recovery points are the AppSheet PROD saved versions OLTP 3.000237 and OLAP 1.100183, plus the verified private pre-release database backup recorded in the production report. The additive V28/V29 schema should normally remain during an app rollback.
