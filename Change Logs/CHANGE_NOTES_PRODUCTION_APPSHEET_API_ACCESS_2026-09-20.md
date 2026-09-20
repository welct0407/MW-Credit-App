# Production AppSheet API access — 2026-09-20

## Scope and purpose

Enable the existing inbound AppSheet API integration on production OLTP so the authorized Debian integration agent can perform bounded operational reads. No AppSheet row edit, database write, schema change, automation change, notification, or OLAP configuration change was included.

Starting Git commit: `987c5ba01825af751b7d1fd99144f119bcd74300`.

## Changed object and rollback

- App: production OLTP `Loan Manager ผู้จัดการสินเชื่อ` (`93844270-6aa5-420b-a960-bcdf08abd357`).
- Rollback version recorded before editing: `3.000236`.
- Saved version after enabling Settings > Integrations > inbound API: `3.000237`.
- The existing enabled application access key created on 8 September 2026 was retained; no key was created, exposed, disabled, or replaced.
- Rollback: restore version `3.000236`, or disable the inbound API and save a new version after first stopping its consumers.

## Verification and status

- The saved app remains Deployed; the final editor state displayed no warning or error text. No repeat Deployment Check was run for this already-Deployed app.
- The official production OLTP API returned HTTP 200 to the bounded `Top(Filter(Partners, true), 10)` Find request from Windows and returned two rows.
- The Debian VM returned an authenticated bounded probe for the same app and table with row count two; the probe emits no row contents.
- The application key file copied to Debian was SHA-256 identical to the preserved external Windows credential.

Status: complete. This maintenance enables API access only; mapped AppSheet edits remain disabled in the Linux agent.
