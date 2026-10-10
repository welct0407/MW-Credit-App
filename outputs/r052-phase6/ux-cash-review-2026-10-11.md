# Agent E — Cash pages UX review

Date: 11 October 2026. Requested by the owner. Reviewer: Agent E, user experience officer (Astra, low reasoning). Agent E reviews only when requested. These recommendations are not implementation instructions or owner acceptance.

## Scope and evidence

Cash Accounts and Cash Position, desktop 1440×956 and iPhone Pro Max representative viewport 440×956. Review uses actual React components with synthetic data, the current source, and C's screenshots. This is not authenticated live-page or physical-device validation. The fixture's “SYNTHETIC route” heading and parent-rerender controls are test scaffolding, excluded from findings. No financial data was changed.

The ledger-width refinement is already requested and is not repeated as a new recommendation. Baseline: `d2045ce`; refinement source identity: [cash-ledger-fit-source.json](cash-ledger-fit-source.json). E inspected all four final captures: [Accounts mobile](cash-review-accounts-440.png), [Accounts desktop](cash-review-accounts-1440.png), [Position mobile](cash-review-position-440.png), [Position desktop](cash-review-position-1440.png). These supersede earlier two-pane/tree screenshots for this review. The final ledger visibly fits long English/Thai account names and ฿1,234,567 at 440 pixels; C separately reports no ledger/document horizontal overflow and successful Enter/detail/Back checks with no writes. The wider Position summary table still scrolls independently.

## Cash Position

### CASH-POS-001 — Keep the current balance visible on mobile

**Priority: High. Evidence: 440×956 visual review; desktop comparison.**

The phone initially shows the holder/account name and Opening Balance, while Current Balance is several columns to the right. A user opening Cash Position to answer “how much cash is available?” must discover and scroll the table before seeing its main result. Desktop presents the full set clearly.

**Suggestion:** On mobile, show holder/account and Current Balance first, then expose opening balance, movements and other measures through expansion or a clearly signposted detail view. Preserve the fuller desktop table. If horizontal scrolling remains for secondary measures, keep the name column visible and show a swipe cue.

### CASH-POS-002 — Distinguish transaction date from recording time

**Priority: Medium. Evidence: both viewport layouts plus source/fixture inspection.**

The Date cell joins `row.date` with only the time from `createdAt`. The fixture's transaction is dated 10 October but recorded on 11 October at 08:02; the row presents “10-Oct 08:02.” A user can reasonably read this as a single transaction timestamp. A hover title explains the recording date, but that explanation is difficult to discover on a phone.

**Suggestion:** Keep the transaction date primary. Label the secondary value “Recorded” and include its date when different, or move the full recorded timestamp to transaction details. Desktop can use a separate Recorded column if useful. Retain the existing business-date meaning.

## Cash Accounts

### CASH-ACCT-001 — Make the selected holder and resulting accounts obvious

**Priority: Medium. Evidence: both viewport layouts and selection-state source inspection.**

Selecting a holder updates a pane headed with that holder's name, but the holder list has no persistent selected state. On mobile the accounts pane appears beneath the entire holder list; with more holders, the result may be below the screen. Users can lose track of which holder they chose or think the tap did nothing.

**Suggestion:** Give the selected holder a persistent visual and accessible selected state. On mobile, bring the account heading into view after selection or use a compact holder selector above the accounts. Preserve the useful side-by-side desktop arrangement.

### CASH-ACCT-002 — Use distinct symbols for adding and opening details

**Priority: Medium. Evidence: both viewport layouts and `RecordAction` source inspection.**

The New record buttons and holder Details buttons all show a pencil. Mobile hides their text, so the same symbol represents different actions. A user seeking holder details can mistake the header pencil for editing an existing item when it actually creates one.

**Suggestion:** Use a plus for “Add cash holder” / “Add cash account,” a chevron or information symbol for details, and reserve the pencil for Edit inside a record. Keep the specific text labels on desktop and accessible labels on mobile.

### CASH-ACCT-003 — Shorten the desktop Details caption

**Priority: Low. Evidence: 1440×956 final visual review.**

Each desktop holder row repeats the entire holder name inside “Cash holder details: [name].” This button takes most of the left pane, forcing the actual holder name onto two lines even with only two short synthetic names. The repeated wording slows scanning.

**Suggestion:** Display “Details” on the button while retaining the full holder-specific accessible label. Give the holder name most of the row width.

## Decision and limits

Suggested order: CASH-POS-001, CASH-POS-002, then the Cash Accounts improvements. The tree hierarchy and desktop two-pane structure are useful foundations. The review does not claim financial correctness, full accessibility conformance, full Thai-language layout coverage, live authentication coverage, or physical-iPhone testing. Codes remain stable so the owner can request any improvement individually.

No app changes are made by this review. D owns publication and the related change-log entry; rollback for the review artifact is its Git revision.
