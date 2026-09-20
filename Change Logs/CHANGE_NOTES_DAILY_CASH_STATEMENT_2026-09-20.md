# Daily cash movement statement — 20 September 2026

## Scope and authority

Owner requested a daily picture statement for every bank/cash account, an R010-style summary, opening balance, transactions with running balances, and closing balance; send to all Partners with IG Integration Enabled, using each Partner's master Language Preference. Owner explicitly chose posting timestamps for the 06:00–06:00 Bangkok cutoff. Manual generation/delivery is in scope. Scheduling awaits owner satisfaction.

Starting clean Git commit: `fcedf4b9959cf9115d9b8c24ac96e314e5d5441a`. No AppSheet definition, financial row, production schema, or Windows runtime change.

## Implementation

Fixed read-only R010 view query under repeatable-read transaction; immutable opening-minus-baseline offsets; Decimal arithmetic; exact start-inclusive/end-exclusive period; all accounts including inactive/no activity; no invented zero for uninitialized accounts. Effective dates remain visible for backdated entries. Current ledger corrections can restate historical postings; snapshots freeze once prepared rather than pretending to be immutable bank history.

Deterministic PNG renderer in English and Thai with Garuda and RAQM shaping, masked account suffix, summary and full running-balance table. Long statements use numbered pages with brought/carried balances. Financial images and source snapshots stay private under runtime state, never Git or a public URL.

Partner authentication requires current explicit opt-in, supported language, unique master username, live official API conversation/profile binding and a signed-ingress 24-hour window. Fresh controls/master checks surround upload/dispatch. Durable intent is committed before send, and unknown outcomes never automatically replay. No inbound processing, financial writes, email fallback, or schedule is enabled.

Changed modules: cash_statement, statement_image, statement_delivery, statement_run, CLI/config/catalogue; pinned Pillow/tzdata dependencies; preflight/deployment/sample scripts; tests and operating documentation.

## Checks and status

Read-only VM preflight confirmed `vm-mw-credit-agent`, correct proxy instance, `loan_manager_prod` / `mw_integration_agent`, actual source fields, four accounts with four initialization records, and one opted-in Partner with English preference. No row contents printed.

Implementation checkpoint `64b01ad` was published and installed. All 20 logic/transport tests passed on Windows and Debian. Private production preparation generated four account statements for 19 September 06:00 through 20 September 06:00 Bangkok. Visual review caught missing Latin glyphs in the original Thai-only font before any delivery. Changed to Garuda, added Latin/Thai glyph guards and Debian pagination/font regression tests; numeric date formatting avoids untranslated month names and a missing arrow glyph. Garuda samples were visually checked in both languages; final rerender/live reconciliation and delivery remain in progress. No schedule installed.

Pre-installation rollback directory: `/var/lib/mw-integration-agent/rollback/cash-statement-20260920T224152`. It contains the prior installed package, protected config/catalogue and dependency inventory. Its source-commit file identifies the new checked-out source; the original installed baseline was `fcedf4b`.

## Rollback

Revert this source change normally, reinstall the prior package, and restore the backed-up catalogue/configuration. The deployment script preserves affected installed Python code, dependency inventory and private config/catalogue before installation. Never replace an active delivery journal with an older copy or erase accepted/unknown send records. No database rollback is needed because reporting performs SELECT only. Existing ingress remains independent.
