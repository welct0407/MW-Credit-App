# R052 Collection loading shift — independent verification

8 October 2026. Baseline fed189a; synthetic responses only, no owner session or live business data.

Before the fix, delayed Upcoming completion reproduced the reported slight upward shift exactly: mobile scrollY0→4 and detail top68→64, with the56px header unchanged. After user scrolling during the wait, mobile200→4 and desktop independent detail scrollTop200→0. Instrumentation recorded a new completion-time scrollIntoView; focus/header geometry did not explain the motion. Three of four regression cases failed before the fix. Original geometry is preserved in before-*.json.

B moved the existing detail alignment from completion to the beginning of loadCharges. No CSS or unrelated scroll change was required. Final six focused Chromium cases passed: four delayed-completion cases (desktop/mobile with and without user scroll), plus existing desktop/mobile Collection pagination, local detail/Back, error, rollover and late route/logout response cases. The new regression also requires initial mobile alignment once and a detail panel below the header. Completion leaves scrollY/detail scrollTop unchanged and does not issue another scrollIntoView.

Current *.json files contain post-fix stage measurements (before selection, selected, charges loaded, waiting, complete). Viewport screenshots *-waiting.png and *-complete.png show the stable transition. WebKit is not installed locally; parent agreed not to add another engine for this bounded, exactly reproduced imperative-scroll defect. Native iPhone Safari/installed-app owner recheck remains pending and is not claimed by Chromium results.

C did not rebuild or modify app source. All owned test servers stopped; parent preview retained. D managed build remains untouched. Four regenerated historical outputs/r052-collection-read/*-TRIM-regression-{en,th}.png are incidental and should be restored by D before publication. Intended files are tests/e2e/collection-loading-shift.spec.ts and this outputs/r052-collection-shift directory. No broader regression or API/DB testing was needed.
