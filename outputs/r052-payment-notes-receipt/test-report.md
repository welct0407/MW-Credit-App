# R052 checkpoint 4B independent verification

8 October 2026. Local synthetic notes/manual-receipt rehearsal only. No live database, GCS, owner credentials, real images or financial writes outside disposable loopback V77.

## Database

B ran the complete guarded V1–V77 suite: 15/15 cases passed (the previous12 plus3 independent receipt cases). C authored and reviewed the independent assertions. The final descriptor case additionally pins new-command rejection and changed-known-command conflict. Its final affected full-V77 receipt-file run passed3/3; the prior12 unchanged financial cases are reused from the15/15 run. No additional unique test cases were added by these assertions.

Actual V52 evidence: initial upload stamps a time; same-reference update preserves it; replacement advances it; removal clears both reference and time. Across these operations, the entire Payment row except the two manual-upload columns, plus every repayment/allocation/cash row and key, remains deeply equal. This includes protected IG Receipt ID, Receipt Image and Receipt Received At. Exact Thai/newline/HTML/leading-trailing-space Notes round-trip unchanged. Initial receipt identity and notes stay bound to the original command; replacement is metadata CAS, not a rewritten original command. Stale expected receipt conflicts.

Receipt bytes are a generated2x2PNG in the runner-owned temporary directory. Decoder/MIME mismatch, truncated signature, over5MiB, HEIC, wrong actor/request and traversal identifiers reject. Restarting the descriptor store does not reconstruct a receipt journal from remaining files. Missing descriptor metadata does not erase confirmed financial Posted status.

## Browser and HTTP

Six focused scenarios passed:

1. Streamed upload exceeding5MiB returns413.
2. Actual local confirmation splits a Thai UTF8 codepoint across raw HTTP chunks; exact Notes survive into the new database read. Notes equal to Back/Notes are not translated when language changes; HTML is displayed as text. DesktopEN/mobile320Thai review stays within the viewport.
3. Actual receipt replacement commits, its response is deliberately dropped, and explicit attachment refresh recovers the new reference without another financial confirmation. Payment remains Posted throughout; one confirmation request total.
4. A delayed synthetic upload response after Remove cannot restore the image.
5. Synthetic unavailable attachment metadata shows Receipt unavailable, never No receipt or financial Unknown.
6. Delayed synthetic metadata replacement disables competing refresh/status/upload controls; no competing status request or stale old image commit occurs.

browser-results.json records the first4 scenarios; metadata-race-results.json records the final2. Actual posting/replacement used the guarded local database; delayed/race/unavailable transport fixtures are explicitly simulated. All browser requests stayed on loopback. Native iPhone camera/HEIC, live storage, durable request journal and notification behavior remain unverified/out of scope. The5MiB/20MP/64KiB bounds are rehearsal technical limits, not AppSheet guarantees.

Screenshots: desktop-review-en.png; mobile-review-th.png (full page); mobile-posted-receipt-en.png (full page); mobile-receipt-unavailable-en.png (full page). Images are synthetic orange squares.

Test-only setup corrections: first browser attempt needed a fixture-ready assertion before enumerating checkboxes; the initial one-byte-per-timer transport fixture was too slow on Windows, so it was replaced with three deliberate chunks splitting one Thai codepoint. Standard assertions/timeouts were not relaxed. No failing financial result was treated as success.

C owns payment-receipt-independent.test.mjs, the v2 adaptation of payment-rehearsal-independent.test.mjs, payment-receipt-browser.mjs and payment-receipt-races.mjs plus this report/JSON/screenshots. D owns README/database CI evidence and publication. No historical screenshots or managed live frontend build were touched.

One additional targeted layout check passed at desktop1440/mobile320 using a deterministic600x900 TEST RECEIPT PNG. The actual local upload decoded600x900 and rendered186.66x280 inside the preview with no page overflow. See large-receipt-layout.json and desktop/mobile-large-receipt-review.png. This was review only, with synthetic fixture values and no confirmation. It supplements the six behavioral scenarios; it is not another financial test.

Final freeze:15 unique database cases, six browser/HTTP behavioral scenarios, and one receipt-sized layout check at two viewport widths. Parent accepted the final visuals. C stopped its owned preview57947; runner finally confirmed disposable PostgreSQL shutdown. Intentional server-child termination causes wrapper exit1, not a failing test. D can now start an untouched owner fixture. No C edits remain pending.

## Selected total and embedded-list refinement

Two focused browser scenarios passed at1440px desktop and320px mobile, each in English and Thai. A browser-only30-charge fixture exercised totals0→1→3→2→32→2, including selection/unselection and keyboard Space on the last row. The charge list scrolls internally while the total remains visible; checkbox focus, list scroll, document scroll, Notes and receipt selection remain unchanged by toggling. Neither language overflowed the page. Evidence: total-scroll-results.json and four total-scroll-{1440,320}-{en,th}.png captures.

The old owner preview62740 refused the initial connection, so verification used a separate ephemeral static server and intercepted fixture/upload responses. No database, real upload, confirmation or owner fixture mutation occurred. The temporary static server stopped normally. This UI-only check did not rerun database or broader regression suites. C added tests/integration/payment-total-scroll-browser.mjs; product scope is B's two UI files.
