# Agent process review and API connections — 21 September 2026

Owner authorized direct PROD OLTP/OLAP API enablement outside the release process, no DEV change, and requested a multi-page editable map of every agent service. Owner corrected all Partner notifications to Instagram first with email fallback, and required shared parameterized scripts for real tests rather than person-specific programs.

Starting commit: `59830b0cbb53a77f0547387392d3da48169d5852`, clean. Source rollback is this commit. Runtime rollback uses the reviewed updater's private package/configuration and consistent SQLite backup. Never restore an older journal over accepted sends.

## Scope

- `appsheet.py`, `config.py`, `cli.py`: named OLTP/OLAP connections, isolated key selection and bounded read probes; no generic write expansion.
- `scripts/configure-appsheet-apis.py`: private configuration backup, existing OLTP key retained, new separate OLAP key installed outside Git. Both production switches enabled through the current editor. No DEV edits, App Upgrade, release number or schema changes.
- `partner_notice.py`, `receipt_run.py`, `receipt_master.py`: receipt notices now use the current Partner's language and IG route first, then email fallback. Durable intent precedes calls; unknown effects never replay; definite email rejection has bounded retry. Old definitely unsent direct-email records are superseded; SENT/UNKNOWN records remain. New cutoff prevents historical notification replay.
- `receipt_prepare.py`: shared operator command takes borrower/date/message parameters and uses the same extractor and receipt rules as webhook processing. It does not fabricate signed webhook events, post payments or send notifications.
- `scripts/generate-business-process.py`: 14 linked editable pages, overview plus every active/pending/disabled service, script references and decision/exception paths. Rendered pages support review.
- A processed-payment template is prepared but not connected to an unverified result. The reusable payment-writing/readback stage remains pending; the owner-approved real loan-close test has not been posted. This is explicitly shown in the diagram.

## Verification and deployment

Local tests: 59 passed/ran with two platform skips; Linux verification and deployed read probes recorded at closure. No financial write or live notification was used as a synthetic test. OLTP API probe returned HTTP 200 after enablement. Configuration rollback before OLAP setup: `/var/lib/mw-integration-agent/rollback/api-connections-20260921T092009Z`.

App Upgrade preservation: the previous operational record said OLTP API enabled, while the live app returned API-disabled HTTP 403 before this change. This does not prove which operation changed it. Google's [upgrade guide](https://support.google.com/appsheet/answer/10105386?hl=en) does not explicitly guarantee preservation of API Enable. Keep DEV unchanged; inspect/probe production after future upgrades. Do not present the preservation assumption as verified fact.

No secrets, account numbers, borrower documents or unrestricted production exports are included. This log distinguishes API/notification deployment from the still-pending payment posting stage.
