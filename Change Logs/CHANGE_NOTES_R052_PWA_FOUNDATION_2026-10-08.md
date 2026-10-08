# R052 checkpoint 2E — Install/update/offline foundation

8 October 2026 (Asia/Bangkok). Owner authorized this bounded foundation checkpoint and themed mobile bottom navigation. R052 remains Open; Phase2 is incomplete.

## Delivered scope

Canonical https://dev-lm.mw-credit.com offers installation help/prompt, explicit waiting-worker update, public-only bilingual offline/reconnect fallback and themed mobile bottom navigation. The web.app origin remains ordinary online fallback. Business/API/auth responses and app HTML/JS are not worker-cached; only offline.html and three public icons are cached. Existing owner UID/access checks, API00009-5x5, database and DNS are unchanged.

Source848750a216511af514b37f97fbddacae7a9d1707 passed [CI37702097252](https://github.com/welct0407/MW-Credit-App/actions/runs/37702097252). Hosting6a5b8f75b50f4537/release1791415694758000 serves managed assets index-sGHwhqbu.js/index-DwqdYJQo.css and worker SHA256 d5939ba01524083acb956618322532a0e881effeb691d62839472d183b24b63d. Exact deployment/evidence is under outputs/r052-pwa-install.

## Verification and limits

Six focused cases passed: real worker lifecycle and rollback/retirement, built canonical/fallback registration, two-tab explicit updates, and synthetic-auth offline/expiry races on desktop/mobile. A's activation-failure and delayed401/offline corrections were included before final build. Parent reviewed synthetic visuals without a blocker. Final unsigned deployed checks passed: six asset MIME/no-store checks and exact worker hash; canonical desktop/mobile plus fallback EN/Thai; canonical cache contains exactly four public URLs, fallback has no registration/cache; zero API requests or business records.

Owner subsequently confirmed successful iPhone Safari home-screen installation on 8 October. This is scoped installation acceptance; offline/reconnect and update acceptance remain pending. Synthetic beforeinstallprompt tests alone do not prove native installation. Separately, domain HTTPS and owner sign-in, Borrowers/Collection reads and refresh persistence are confirmed; no owner browser-reopen claim.

## Recovery and changed ownership

Baseline app845efef2b43042da67c19b0477f96989a3c9e4b4; prior Hostingccb0af261babf04b is pre-worker. Restoring that release alone cannot retire an installed worker. Use a valid earlier PWA worker or pair the earlier frontend with the maintained retirement overlay; see docs/Development_PWA_Delivery.md. Actual retirement tests preserve unrelated caches and auth storage. No live rollback was performed.

B owns app/build integration; C owns focused tests/evidence; D owns Hosting helper MIME/preflight, scripts/pwa-retirement-worker.js, managed build/delivery and publication. The helper requires real assets and stable manifest identity; --check uses no credentials/network. Progress and roadmap record this checkpoint without full-phase acceptance.

## Collection load-completion refinement — delivered

Owner reported a vertical shift when Collection finishes loading. C reproduced a 4px mobile jump and a 200px manual-scroll reset: the completion path aligned the detail pane after delayed charge/Upcoming reads. B moved alignment to the initial navigation action, preserving the user position when those reads complete. C froze six passing focused regression cases, including before/after geometry and manual-scroll retention. iPhone Safari owner recheck remains pending. App baseline fed189a31c49ee19807d282497bca25c4319a322, PM ddc6d5ab5f098d25a68a4b200eacd50cb1ca6eb5, current PWA Hosting6a5b8f75b50f4537 provide recovery. The corrected frontend retains a valid worker and explicit Update/reload delivery; API00009-5x5 and infrastructure remain unchanged.

Managed-config correction build/helpercheck passed: index-DlD64PWM.js and worker SHA25619c7faf1e390457122e3a3924c820fa313e3db419df56af0ed3f203c17d9ea43. Existing local browser runtime is Chromium; WebKit is not installed. No physical-device/browser-engine equivalence is claimed.

Correction delivery: exact sourcebb3ac5ce3fc87bacdc7827ec75a1d3378c064027 passed CI37704697997; Hostingb11661ef7a7a3d77/release1791417424598000 deployed with the recorded newworker. Rollback6a5b8f75b50f4537 is a valid earlier PWA release; use its normal explicit worker update semantics. Final unsigned canonical/fallback artifact check passed: exact new JavaScript/worker hash and no-store, correct registration boundary, zero API requests/records. Evidence is under outputs/r052-collection-shift. Owner should use Update/reload before the iPhone Collection recheck; no owner acceptance is claimed yet.

Owner continuation, 8 October: after delivery of the Collection scroll correction, the owner said 'Ok. Continue'. This authorizes the next bounded slice; it is not an explicit native Safari measurement or offline/update acceptance. Current recovery remains Hostingb11661ef7a7a3d77/API00009-5x5; A is selecting the next remaining foundation/parity scope. No new runtime change during preflight.
