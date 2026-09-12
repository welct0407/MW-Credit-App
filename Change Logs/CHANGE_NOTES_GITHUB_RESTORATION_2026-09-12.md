# GitHub restoration - 12 September 2026

## Scope and purpose
Owner requested restoration of committed work after an OS filesystem corruption and Azure restore reported as 04:00 Bangkok today. Fast-forwarded master from b9dce4eee2f8e4a42c971c07eb4d1386fd030a77 to verified GitHub commit 662a1629c56de4a49b2d4bec133a8cc2fa5e41b3. Restored the diagram, generator, documentation, previews and original change log listed in CHANGE_NOTES_OLTP_BUSINESS_PROCESS_DIAGRAM_2026-09-12.md.

## Rollback and checks
Pre-restore working tree was clean; prior commit above is the source rollback point. Fetch and fast-forward succeeded. HEAD equalled origin/master and tracked-file diff was empty after restoration. No application code was executed and no live AppSheet/Looker objects changed; app/report backups are not applicable. This additional recovery note is the only newly authored file.

## Status and manual review
Committed source restoration complete. Open the restored draw.io diagram for user review; original acceptance remains pending. Conversations, ignored runtime data, credentials and automation definitions are outside this restoration. No runtime activation or live testing occurred. Publish this recovery note under the standing commit/push rule.

If rollback is needed, revert the restored diagram commit with a normal new commit after checking later dependencies; preserve this audit note and unrelated work. No financial data rollback applies.
