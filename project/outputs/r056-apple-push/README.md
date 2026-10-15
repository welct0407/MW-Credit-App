# R056 Apple push registration fix

13 October 2026. Owner requested fixing Lisa's failed notification enrollment. Production logged POST subscriptions400 while configuration/status succeeded. Rejected payloads were not retained; exact device-specific failure is unproven. Confirmed compatibility defect fixed: registration and delivery now accept valid Apple push.apple.com subdomains, with HTTPS, key, actor and anti-spoof checks preserved.

DEV/PROD V91 validated. Command 00006-lrd and notify 00003-bj4 are Ready at100% on image b4f528bc8ac48008ed0951e227089d3d0802a7a6c2dbaa826ada5e021e156aea. Command health200; notification service retains IAM-denied unauthenticated health403 and natural authorized requests200. Only two image updates; post-apply plan has no changes. Reader/jobs/frontend/schedules and push policies preserved.

Protected backups and isolated restores passed; temporary owner access restored. DEV capability reconciliation initially lacked existing journal-owner access, then passed under the maintained scoped route without migration replay. Prior command/notify image pins are rollback; retain compatible V91 unless separately corrected forward. No financial test or forced notification.

Baseline app0edd565/PM8ac39d9e; scope frozen13October18:50Bangkok at candidateb2a37f2, image built from018a59a. Paused Phase2 changes excluded. Focused notifications12, transactionguards35 and maintenancechecks10 passed; one disposable database suite passed189Node tests plus SQL. Thirteen test directories removed; private diagnostics review20October, protected backups preserved. Exact routine dictionary updated;1641documents validated with zeroerrors.

[App delivery evidence](https://github.com/welct0407/MW-Credit-App/blob/53cf5c0/outputs/r056-apple-push/deployment-evidence.json) | [Tests and cleanup](https://github.com/welct0407/MW-Credit-App/blob/53cf5c0/outputs/r056-apple-push/testing.md) | [PR4](https://github.com/welct0407/MW-Credit-App/pull/4) | [Routine readback](affected-routine-readback.json) | [Apple endpoint requirement](https://webkit.org/blog/13878/).

Status: deployment verified; Lisa asked to open the iPhone Home Screen app and enable notifications again. Device enrollment acceptance pending; no claim of a received push. R056 remains Frozen, R057 sole Open. [Single checklist](promotion-checklist.md).
