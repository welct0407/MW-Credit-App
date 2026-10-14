# Native read service

Current read implementation serves authenticated Borrowers, related loans and Collection/charge data. Other business reads, writes and receipt access are composed through the command/business runtime.

## Source ownership

- services/api/dev-read-handler.mjs: route validation and request handling.
- services/api/borrower-read-store.mjs: bounded SQL reads.
- services/api/read-access.mjs and firebase-principal.mjs: identity/access policy.
- services/production/business-runtime.mjs: production composition.
- services/production/business-config.mjs and business-target.mjs: fixed environment/target guards.
- services/payment-command/handler.mjs: additional operational/management route families.
- apps/pwa/src/live-main.tsx: live application entry.

The DEV handler name is an implementation filename, not a claim that production access is absent. Exact runtime configuration comes from the owning infrastructure stack and service loader; do not copy old checkpoint settings.

## Data and access

Validate Firebase identity and current Partner membership/capabilities. Use explicit environment origins/database identities and restricted database roles. Shared Google sign-in does not make DEV/PROD routes interchangeable.

Borrower visibility excludes only Hidden Flag=true; false/null remain eligible under the source contract. SQL supplies governed balances and financial calculations. Paging/search are bounded and cursor-bound; one page is not a complete portfolio.

Borrower detail Upcoming Charges reuses Collection's five-date forecast, date detail and paging for the selected visible borrower, including borrowers with only future charges. Borrower-scoped upcoming reads use the visible-borrower boundary; Collection-scoped reads retain their existing Collection membership check. Both use the existing forecast SQL, cursor binding and freshness checks. Viewing upcoming rows is read-only and does not submit borrower changes.

Collection preserves status grouping and orders borrower names ascending within each group with stable id ties. Loan-related charges/payments order by business date descending, null dates last, then id ascending. Both use matching scoped/versioned cursor boundaries; existing eligibility, balances and authorization remain unchanged.

DEV and the owner-authorized R059 PROD candidate bulk reads use `GET /api/offline-dataset?domain=records|collection|cash|management` and recipient-scoped `GET /api/notifications/offline-dataset`. They retain authenticated membership/capabilities, existing read DTOs and SQL calculations in read-only repeatable-read transactions. One shared bulk connection slot preserves foreground SQL capacity; cancellation stops abandoned preparation. Cash coverage follows the existing recent-statement provider. The R059 candidate enables main-domain routes in production composition and recipient datasets when existing notifications are enabled; production deployment is pending.

Protocol 2 uses `protocol=2` with an optional `cursor` on both dataset routes and splits preparation into bounded chunks; omitting protocol retains legacy protocol 1 for deployment compatibility. Traversal cursors bind actor, domain and business day; startedAt identifies traversal start, and asOf is read metadata; the traversal is not one global MVCC snapshot across requests. The PWA persists partial stages and resumes their cursor using local read-revision/cursor compare-and-swap. Focus/reconnect resumes work; a local applied mutation restarts that revision. Prior complete bundles remain available until every new page commits atomically.

After initial protocol-2 completion, protocol 3 uses read-only POSTs on the same routes with cursor/need/sourceVersion bodies. Deterministic per-domain logical-page caps keep manifest/need replays identical, with a between-page byte boundary and no elapsed-time cutoff in protocol 3. Bounded content-hash manifests transfer values only for missing hashes; canonical hashing ignores asOf metadata and can index an existing complete bundle. Main domains use actor/day-scoped raw-source SHA256/xmin fingerprints to skip unchanged providers, validating traversal source at start/end. Notifications always scan protected recipient manifests with sourceVersion=null; they have no cheap source gate or universal snapshot claim.

Visible polling every 60 seconds and reconnect/focus check for changes from other users. Complete data and checkpoints commit together under original local mutation revision, expected cursor and prior-base guards; response-cache epoch is separate. Existing complete data remains visible while updating or failed. An unavailable initial cache epoch disables caching/fallback for that read while allowing a valid online response to succeed. Downloads never replace pending requests/drafts, and mounted view refresh preserves dirty edits.

The PWA prepares complete owner-scoped bundles and authorized receipt images separately from the response-cache LRU, enabling local search/paging and unvisited offline views. Foreground reads take priority; atomic replacement preserves prior complete data on storage failure. The header shows actual preparation progress and page-scoped refresh failures. Financial close/correction/auto-assignment/review and command-status reads remain online. Read-only Collection Note baseline can refresh from prepared data when not editing, busy, blocked or carrying a pending request; dirty text remains protected. Note autosave behavior is unchanged, and the reported note concern is not claimed fixed.

Authentication state uses the Firebase SDK. Do not copy tokens into custom storage/logs/URLs. Clear or reject stale-session results and preserve denied access rather than granting permissions automatically. Offline viewed snapshots follow the current bounded cache policy; they do not authorize posting.

## Changes and verification

Select affected route/SQL/access/browser checks. Test restricted-role failures and malformed identity/cursor inputs when those boundaries change. Use sanitized error references for diagnostics; establish whether failure is connection or query-related before changing limits. Reuse valid CI and deployed proof. No AppSheet parity or editor tests.

Current API/data references are in the project PWA dictionary. Deployment and recovery follow [Development](Development.md).
