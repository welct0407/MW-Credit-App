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

Authentication state uses the Firebase SDK. Do not copy tokens into custom storage/logs/URLs. Clear or reject stale-session results and preserve denied access rather than granting permissions automatically. Offline viewed snapshots follow the current bounded cache policy; they do not authorize posting.

## Changes and verification

Select affected route/SQL/access/browser checks. Test restricted-role failures and malformed identity/cursor inputs when those boundaries change. Use sanitized error references for diagnostics; establish whether failure is connection or query-related before changing limits. Reuse valid CI and deployed proof. No AppSheet parity or editor tests.

Current API/data references are in the project PWA dictionary. Deployment and recovery follow [Development](Development.md).