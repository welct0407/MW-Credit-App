# Daily cash movement statement — 20 September 2026

## Owner refinement — calendar day and M&W Credit branding

Starting clean Git commit `5fd7f5b4773c71d30e80327bf05d6febddff3a30`; live VM checkout matches. The owner revised the reporting window to a full Bangkok calendar day, 00:00 inclusive through next midnight exclusive, retaining posting-time basis. Display all amounts without decimals, transaction times as HH:MM, organization name **M&W Credit**, no footer date, and primary color **#D81B60** with coordinated pink shades. These instructions supersede the historical 06:00 design below.

Updated period selection, rendering, CLI help, catalogue revision 4, sample fixtures, existing boundary/render tests and current documentation. Preserve exact Decimal accounting; round display only to whole baht (half up). Calendar-day snapshots have a separate directory and full-period send keys, preserving the earlier accepted report and its journal. Scheduling remains off. Verification, revised previews and deployment are in progress.

The owner then supplied the M&W Credit logo and requested a persistent Debian copy. Retrieved the exact PNG through the signed-in Drive browser (connector returned not found), verified its dimensions/hash, and bundled the unchanged original in the Python package. Header rendering scales a local copy; it never downloads at runtime. Provenance lives in `src/mw_integration_agent/assets/README.md`.

Calendar-day checkpoint `95b7aa1` is installed: all 22 Debian tests passed; four account balances and 19 transaction rows independently reconciled for 19 September 00:00 through 20 September 00:00 Bangkok. Eight private English/Thai images were generated. Delivery is held until the logo is included and visually verified. Refinement rollback package/config: `/var/lib/mw-integration-agent/rollback/cash-statement-20260920T230003` (prior installed implementation `89994d4`, checkout/evidence baseline `5fd7f5b`).

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

## Completed manual delivery

Runtime code `89994d4` is installed on Debian. All **22 tests passed on Debian**, including both actual renderer tests; Windows passed 20 logic tests with the two Debian renderer tests explicitly skipped. Final English and Thai synthetic PNGs were visually inspected; required Latin/Thai glyph checks pass, and the numeric date interval renders correctly. Synthetic review images are under `outputs/cash-statement-sample/`.

The frozen production period is **2026-09-19 06:00 through 2026-09-20 06:00 Asia/Bangkok**. Read-only verification independently reconciled all **four account closing balances against direct Cash Ledger totals plus the R008 baseline**, verified all **20 transaction rows** fall inside the posting-time interval, and checked eight English/Thai image files. No financial amounts or personal rows were published.

The explicit manual run found one currently enabled Partner, language English, verified the live conversation/profile and messaging window, uploaded the four images directly to Meta, and received **four accepted message IDs**. No public media hosting was needed. `sending_enabled` was restored to false in the wrapper's `finally` block. Delivery IDs, financial images and snapshots remain in private VM state. API acceptance is not proof of human reading.

**Implemented, deployed and manually sent for owner review.** Owner satisfaction/acceptance remains pending. **Scheduling remains off**; no timer, automatic reply, financial write or email fallback was enabled. Thai output was visually tested, but no Thai Partner delivery was attempted because the only currently enabled Partner selected English. Future changed/backdated source records can restate the operational ledger; the sent snapshot remains frozen.

## Rollback

Revert this source change normally, reinstall the prior package, and restore the backed-up catalogue/configuration. The deployment script preserves affected installed Python code, dependency inventory and private config/catalogue before installation. Never replace an active delivery journal with an older copy or erase accepted/unknown send records. No database rollback is needed because reporting performs SELECT only. Existing ingress remains independent.
