# Change notes — Lint warnings reviewed and cleared (CI tune-up Batch 3), 25 October 2026

## Purpose
Batch 3 of the Development Checks tune-up plan, stacked on Batch 2 (`5bfcbca`). Owner decision of 25 October 2026: fix the hook warnings with review, reject dependencies created during render and suppress intentional cases with reasons. After this batch `npm run lint` reports 0 warnings and 0 infos, so a future warning is new.

## Changes
- Hooks (`useExhaustiveDependencies`, 296 diagnostics at 99 sites): 98 suppressed and 1 fixed (the `SelectedCharges` sync-outcome listener, whose suppression is removed), each suppression with a reason on a `//` line above the hook; 16 reason typos fixed. Thirteen hook suppressions from before this work also exist, 111 in total in `apps/pwa/src` (a `biome-ignore` applies to the whole following line). One attempted fix at `live-main.tsx:142` (adding `state`, `updating` and `updateFailed` to the offline-preparation effect) broke `payment-command.spec.ts:303` (the refresh-failure badge cleared early) and was reverted. High-risk sites are untouched; `commandAccess` is not memoized.
- Real bug found: `SelectedCharges.tsx:301` stale-language listener, so a blocked-payment message could show in the old language after a language switch. Fixed with a `resultNow` latest-value ref (the `LoanForm.tsx:30-31` pattern); the listener calls `resultNow.current(detail.data)` and is still registered once. `thaiNow` is kept only for the listener's own blocked-payment message, and the suppression there is removed.
- Accessibility (39): 12 fixed, 27 suppressed with reasons.
  - Fixed: label and control tied by `htmlFor` and `id` from `useId` in `BorrowerRecord` (5 editable fields), `ManagementForm` and `ManagementFinancialForm`; a new `biome.json` override declares `ManagementReference` an input component; the `main.tsx` brand link became a button (computed style identical at rest, hover and focus at 3 widths); 2 unsupported `aria-label`s replaced with visually hidden text.
  - Suppressed: 4 read-only label displays, keyboard-scrollable panels, the language group Escape, the search region, focus tracking, drawer `autoFocus`, 3 `role="group"` button lists and the ledger row acting as a button.
- `noImportantStyles` (42): 24 fixed by moving declarations into 18 sibling rules with `:not(#_)` (adds ID-level specificity); 18 kept with reasons (view transition, status and money colours, header-back). Equivalence: static proof that 9,287 declaration pairs keep their precedence, and in-browser comparison of 4,804 elements in 13 contexts at 4 widths with no difference.
- `docs/Development.md`: lint paragraph states the clean state and the suppression convention.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | 0 warnings, 0 infos (Byte, on `5bfcbca` plus this diff) |
| `npm run typecheck` | Pass (Byte) |
| `npm run check` | 913 pass, 1 skipped (Byte) |
| 14 targeted spec files | 357 pass, 3 fail, 4 skipped; the failures were the reverted `live-main.tsx:142` attempt and one startup-generations run during a mid-run CSS edit; both files re-pass (35 pass, 1 skipped); `foundation` 18 pass, 2 skipped after the brand change (Byte) |
| `SelectedCharges.tsx:301` language fix | Lint 0/0, typecheck pass, unit 913 pass; `payment-offline-independent` and `own-receipt-seed-independent` 6 pass; earlier `payment-command`, `unified-receiving` (two files) and `payment-offline-independent` 78/78. No existing spec asserts saved-rejection messages, so no regression test was added (Byte) |
| Chase verification | No defects. Final `SelectedCharges` review: `resultNow` is set before the effect, `[]` dependencies unchanged, listener registered once, `thaiNow` used only in the blocked branch, old suppression removed. `<pre aria-label="Notes">` became a visually hidden span plus the `pre`, and no spec relies on it; the typo fixes are comment-only. No dependency array edited in 46 files; sampled suppression reasons true; label and id, the brand button and the visually hidden text verified; CSS computed styles identical across 13 contexts, 3 viewports and rest, hover and focus (Chase) |
| Echo review of the changed flows | No blocking findings. `live-style.css` at HEAD against the tree on scratch pages (with `style.css` and `chat.css`): 30 computed properties plus sizes at 7 widths (390 to 1440 px), 4,781 element checks, 0 differences (a deliberate break produced 2,155, proving sensitivity). Brand button identical in size, position, hover and focus at 4 widths, drawer open and closed; E-B3-01 (Info): it now also responds to Space and is announced as a button, an expected improvement. Every `htmlFor` has a matching `id` on each field variant, picker fields unchanged, a label click focuses the field and a checkbox toggles once. The visually hidden "Paid amount" and "Notes" read once and take no space. E-B3-02 (Low, not UX): `resultNow` widens the listener to latest values, covered by Archie's assessment, Chase's review and the two payment specs (6 pass). Not reviewed: the running app, WebKit, iPhone Home Screen (not exposed) (Echo) |
| `npm run check:docs` | 0 failures, 0 warnings |
| Development checks (pull request) | The pull request's run on this commit |

## Not run
No full local Playwright suite; the pull request's run is the broad one. No deployment.

## Recovery
Revert the batch commit. Suppressions and the CSS rules revert together.

## Open questions
None. Archie assessed the earlier stale-access question: not a financial defect (`access.token` reads live refs and `getIdToken`; `confirmOwnPayment` is a GET plus local apply, deduplicated; a stale user fails closed). The real effect was a queued-then-synced receipt downloading again because the first-render `localImage` was null; the `resultNow` fix above removes it.

## Remaining work
None.
