# R051 — row 5 bridge monitoring and daily VM-01 chart

Status4 October2026,16:46 UTC: source published in draft [PR12](https://github.com/welct0407/AppSheet-Loan-Project/pull/12); approved telemetry live on00015-qcs/100%. Three natural empty drains exported12 numeric series each at16:44,16:45 and16:46, with no monitoring failure in the bounded readback. Existing owner access remains enabled, delivery counts pending0/failed0/delivered9/cancelled0 unchanged. Scheduler configuration and unrelated service/IAM settings are preserved. Eight IRM alerts remain uncreated. No merge, subscription/filter/credential/network change or VM/business action.

## Deliverables and evidence

- [Fresh Performance import](performance-import.json): IDs120–127 only, two distinct row5 groups (bridge availability/dispatch/outbox; subscription/auth renewal/delivery continuity). Two width12 headers at overview y17, six width4 cards at y18height4. All original61 elements and other layouts/preferences/metadata preserved.
- [Fresh Cost import](cost-import.json): ID110 only, daily VM-01 observed running/available-hours bars at Azure y20width24height8. All original23 elements and other layouts/preferences/metadata preserved. Singapore days, minute integration, partial-day clipping, null unknown coverage; no CPU inference.
- [Fresh reconciliation](fresh-reconciliation.json): exact private parent-backup hashes, resourceVersions/generations, final import hashes and full-object preservation/idempotence evidence. Original Library backups remain intact. Older *-proposed.json files are dated-source design examples, never live import payloads.
- [Browser handoff](BROWSER_HANDOFF.md): existing-dashboard Edit→Code save route, folder/version safeguards, exact metric-query checks and monitoring-only expected-membership document requirements.
- [Rollout evidence](rollout/): immutable image/source, pre-change baseline, missing Metric Writer grant with unrelated IAM preserved, exact state/createdAt index READY, staged old100% traffic, activated new100%, three natural export ticks and unchanged Scheduler. Private full configuration backups stay outside Git at `/tmp/grafana-row5-live-20261004`.
- [Approval and design](ROLLOUT_PROPOSAL.md): owner telemetry approval15:58 UTC; eight IRM alerts/contact/routing expressly excluded and uncreated. Alert proposal JSON is design only.

Runtime source pin ae4cb9031e679e302cd1296ed727c47d6c07968c; immutable digest sha256:9ba9b0f222c7f75e7302cdc7162873060c0c71488696766f11422306f22758fe. Existing service account, mounted secret pins, OAuth, callbacks, ingress and subscriptions are preserved. No Debian/MW integration runtime change. The deployment helper was corrected to resume the existing staged revision after a sanitized CLI response failure, preserve explicit metadata-only formats, and account only for the generated client nonce. No duplicate revision was created.

## Checks and real data limits

All40 targeted monitoring/events/offline-auth/store tests and TypeScript build passed. Dashboard/observation/SGT integration tests, passive power-history parser tests and independent-alert selector tests passed. Fresh LIVE exports additionally pass complete-object preservation and idempotence. Immutable Linuxamd64/non-root image build succeeded from the integrity-checked locked offline npm cache;185packages installed in2seconds. Cache bind mount is transient, ignored by Git and absent from runtime layers; no production network/security change.

Parent passive Azure metricDefinitions HTTP200 verified VmAvailabilityMetric Average/Min/Max, PT1M→P1D,93day retention. Three-day minute series:4320rows,815null,3480exact1,14exact0,11fractional, empty Context. Rounded inherited sum3486 is not an exact runtime total. Available-hours integration is a lower bound when gaps exist;0 means unavailable, not confirmed off. It is neither exact powered-running time nor billable allocated time. Activity Log response inspection was blocked without a verified HTTP status; zero framed rows are not verified empty history or403. No controller status/power call was made; owner idle hold persists.

## Remaining parent actions / access blockers

1. Executor has no authenticated Grafana browser tool. Parent must verify real field reads through existing mw-gcp-monitoring and the exact daily Azure backend query, then save both scoped existing dashboards and read back layout/folder/timezone/errors. Re-export/repatch if resourceVersions changed since15:42–15:43 backups. Dashboard edits are already owner-authorized; no repeat approval needed.
2. Fixed CLI adapter exposes no Firestore document read/write or raw ADC. Through an existing owner document route, privately verify exact expected native subscriber record(s), then seed only control/monitoring.expectedSubscriptionIds, preserving unrelated fields. Maximum8 unique verified sub_<64hex> IDs; no auto-enrollment or count-based expectation. This monitoring-only write was included in approval, but unavailable here. Subscription/renewal remains Unknown until verified; legacy grant expiry stays Unknown until ordinary authenticated renewal records it. No forced refresh, borrowed credentials or new IAM requested/applied.
3. Eight IRM alerts/contact/routing remain uncreated by explicit owner instruction. Independent paging is not enabled by these dashboard additions. Any later alert activation requires its own exact approved scope.

Rollback uses retained00014-s6x traffic and captured pre-change configuration through the established adapter; do not delete queues/grants/events or monitoring history. No VM operation is part of recovery.

## Cost numeric-column repair

Parent browser found panel110 “No numeric fields found” after saving the existing Cost UID/folder. Exact Azure URL/jq probe returned rows when columns were inferred. Root cause was prepared explicit numeric selectors using bracket notation; Infinity JQ transforms the root, then its jsonframer uses GJSON column paths. Correct selectors are plain output keys `Observed available hours`, `Unknown hours`, `Coverage percent`, all type `number`; Day stays `Day`/string. Source correction changes no Azure query, jq calculation, units, timezone, unknown behavior or other panel. Regression checks bind every explicit selector to actual generated jq keys and preserve numeric/null values; fresh original-object preservation/idempotence passes.

Parent browser independently confirmed the corrected preview returns numeric daily rows (Oct1≈12.78,Oct2≈23.52,Oct3≈24,Oct4≈10.04; partialOct5 unknown in that selected window). These are time-window-dependent observed estimates, not fixed fixture/runtime totals. Browser worker owns the corrected save/readback; executor performed no browser overwrite or backend deployment. Do not re-import the pre-save envelope over newer live dashboard state.

Primary source: https://github.com/grafana/infinity-libs/blob/main/lib/go/jsonframer/jsonframer.go (`getColumnValuesFromResponseString` calls `gjson.Get(value.Raw,col.Selector)` after the root transformation).
