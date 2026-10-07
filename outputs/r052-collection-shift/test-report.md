# R052 Collection loading shift — independent verification

8 October 2026. Baseline fed189a; synthetic responses only, no owner session or live business data.

Before the fix, delayed Upcoming completion reproduced the reported slight upward shift exactly: mobile scrollY0→4 and detail top68→64, with the56px header unchanged. After user scrolling during the wait, mobile200→4 and desktop independent detail scrollTop200→0. Instrumentation recorded a new completion-time scrollIntoView; focus/header geometry did not explain the motion. Three of four regression cases failed before the fix. Original geometry is preserved in before-*.json.

B moved the existing detail alignment from completion to the beginning of loadCharges. No CSS or unrelated scroll change was required. Final six focused Chromium cases passed: four delayed-completion cases (desktop/mobile with and without user scroll), plus existing desktop/mobile Collection pagination, local detail/Back, error, rollover and late route/logout response cases. The new regression also requires initial mobile alignment once and a detail panel below the header. Completion leaves scrollY/detail scrollTop unchanged and does not issue another scrollIntoView.

Current *.json files contain post-fix stage measurements (before selection, selected, charges loaded, waiting, complete). Viewport screenshots *-waiting.png and *-complete.png show the stable transition. WebKit is not installed locally; parent agreed not to add another engine for this bounded, exactly reproduced imperative-scroll defect. Native iPhone Safari/installed-app owner recheck remains pending and is not claimed by Chromium results.

C did not rebuild or modify app source. All owned test servers stopped; parent preview retained. D managed build remains untouched. Four regenerated historical outputs/r052-collection-read/*-TRIM-regression-{en,th}.png are incidental and should be restored by D before publication. Intended files are tests/e2e/collection-loading-shift.spec.ts and this outputs/r052-collection-shift directory. No broader regression or API/DB testing was needed.

## Deployed correction

Exact source bb3ac5ce3fc87bacdc7827ec75a1d3378c064027 passed CI37704697997. D deployed Hosting b11661ef7a7a3d77. Bounded fresh unsigned canonical/fallback delivery checks passed: both serve index-DlD64PWM.js and worker SHA25619c7faf1e390457122e3a3924c820fa313e3db419df56af0ed3f203c17d9ea43 with no-store; canonical registers, fallback does not. Both show signed-out UI, zero records and zero API requests. Evidence live-delivery.json and live-*-signedout.png; all browser contexts closed. This confirms delivery, not the owner-authenticated Collection interaction. Native installed iPhone recheck remains pending. Existing PWA lifecycle evidence is reused.
