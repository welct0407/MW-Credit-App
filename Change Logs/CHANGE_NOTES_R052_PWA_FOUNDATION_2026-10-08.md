# R052 checkpoint 2E — Install/update/offline foundation

8 October 2026 (Asia/Bangkok). Owner authorized this bounded foundation checkpoint and themed mobile bottom navigation. R052 remains Open; Phase2 is incomplete.

## Delivered scope

Canonical https://dev-lm.mw-credit.com offers installation help/prompt, explicit waiting-worker update, public-only bilingual offline/reconnect fallback and themed mobile bottom navigation. The web.app origin remains ordinary online fallback. Business/API/auth responses and app HTML/JS are not worker-cached; only offline.html and three public icons are cached. Existing owner UID/access checks, API00009-5x5, database and DNS are unchanged.

Source848750a216511af514b37f97fbddacae7a9d1707 passed [CI37702097252](https://github.com/welct0407/MW-Credit-App/actions/runs/37702097252). Hosting6a5b8f75b50f4537/release1791415694758000 serves managed assets index-sGHwhqbu.js/index-DwqdYJQo.css and worker SHA256 d5939ba01524083acb956618322532a0e881effeb691d62839472d183b24b63d. Exact deployment/evidence is under outputs/r052-pwa-install.

## Verification and limits

Six focused cases passed: real worker lifecycle and rollback/retirement, built canonical/fallback registration, two-tab explicit updates, and synthetic-auth offline/expiry races on desktop/mobile. A's activation-failure and delayed401/offline corrections were included before final build. Parent reviewed synthetic visuals without a blocker. Final unsigned deployed checks passed: six asset MIME/no-store checks and exact worker hash; canonical desktop/mobile plus fallback EN/Thai; canonical cache contains exactly four public URLs, fallback has no registration/cache; zero API requests or business records.

Native OS installation is not established by synthetic beforeinstallprompt tests. Owner PWA install/offline/update review remains pending. Separately, domain HTTPS and owner sign-in, Borrowers/Collection reads and refresh persistence are confirmed; no owner browser-reopen claim.

## Recovery and changed ownership

Baseline app845efef2b43042da67c19b0477f96989a3c9e4b4; prior Hostingccb0af261babf04b is pre-worker. Restoring that release alone cannot retire an installed worker. Use a valid earlier PWA worker or pair the earlier frontend with the maintained retirement overlay; see docs/Development_PWA_Delivery.md. Actual retirement tests preserve unrelated caches and auth storage. No live rollback was performed.

B owns app/build integration; C owns focused tests/evidence; D owns Hosting helper MIME/preflight, scripts/pwa-retirement-worker.js, managed build/delivery and publication. The helper requires real assets and stable manifest identity; --check uses no credentials/network. Progress and roadmap record this checkpoint without full-phase acceptance.
