# R014 RC retirement — 21 September 2026

Owner authorization: “clean up the two RC created during cutover.”

| Candidate | App ID | Last frozen version | Result |
| --- | --- | --- | --- |
| MW-OLTP-R014-RC1-578763613 | 7de4438a-90b9-47f8-a6db-6c62b995c5c1 | 1.000007 | Deleted; exact editor URL redirects to Home/NotFound, 404: Page not found |
| MW-OLAP-R014-RC1-578763613 | 4936b576-e35a-4b24-b258-51e89f5a2e57 | 1.000006 | Deleted; exact editor URL redirects to Home/NotFound, 404: Page not found |

AppSheet My Apps displayed production names for both candidates. Opened each candidate in a new editor tab and matched appId/internal appName to the release manifest before using its row's Delete action. Reloaded both exact editor tabs after deletion to verify 404. No database, files, DEV or PROD app deletion was performed.

Recovery: PROD pre-upgrade saved versions OLTP 3.000242 / OLAP 1.100191 and retained private database/runtime backups in [production report](production-report.md). RC identities remain historical evidence, not live rollback sources. R014 tag remains at bed9ed7a49120df293adb4a73da1e0e8f5659fa5; cleanup is a later normal documentation commit.

Status: complete. No remaining manual test for RC retirement. No product/model change; data dictionary and development differences remain valid.
