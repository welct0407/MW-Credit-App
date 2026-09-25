# R035 — Metabase monitoring group

## Scope / status

Owner authorized Platform, application database, reporting database and custom chart service lights, fitted into existing Performance rows 3/4. Implemented and published on 25 September 2026; R035 remains Open. Work began while R034 was Open, but its concurrent matrix-only freeze/pin excluded this monitoring work. This delivery is recorded in the current R035; the Grafana save note retains the start-of-work R034 reference. No frozen matrix package is changed.

Twenty tiles now fit in two rows. Original groups occupy left/center thirds; Metabase occupies the right third in two pairs, under Platform/Reporting subheadings. Existing 44 panel definitions are unchanged; six new elements are panels74–75 (headings),80–83 (checks). Only overview group/tile geometry changes. CPU/RAM, detailed charts, Cost, old hover queries, eight alert rules and business schedules are preserved. New tiles do not yet send mobile push.

## Checks and implementation

- Platform: public Metabase `/livez` returns200/status ok.
- App DB: `/readyz` returns200/status ok, including application-database readiness; it also depends on the platform and route.
- Reporting DB: uncached saved question276, `SELECT 1 AS healthy`, through existing source2/loan_manager_prod. HTTP202 is normal when response status is completed and rows are exactly `[[1]]`.
- Charts: verified actual hostname **charts.mw-credit.com**, expected public shell and401 from unauthenticated protected matrix API. No borrower data fetched; this does not assert authenticated SQL or browser rendering.
- Concurrent Debian probes every~2m; passing calls >5s are Degraded, network/incorrect responses Down, access/rate/probe failures Unknown. Grafana rejects telemetry >6m old. Hover shows result category, HTTP, duration, observed SGT time.

New metric `custom.googleapis.com/mw_resource_monitoring/metabase_probe` contains only numeric status/code/duration and stable component/field labels. Existing health/worker timing metrics remain unchanged. Maintained collector module, selector, targeted updater, builder, classic/V2 resources, guide and operating reference were updated together.

Metabase group6/collection9/key4 are dedicated monitoring objects. Question276 reads no business tables. Key is non-admin, collection9 read-only, no ad hoc native-query permission; other report274 access and ad hoc `SELECT 1` both returned403. No existing source/collection grants or public-sharing setting changed. Key stored outside Git and deployed root:mwagent0640, not in Grafana/browser. Existing administrator setup key was not deployed. One-time initialization script refuses existing state.

## Rollback and evidence

Starting Git commit `a0e2b97bfc9824f4daa39f7fd65feca62cc21cbb`; unrelated risk and matrix work preserved. Pre-edit live Grafana Code definition retained in editing session; scoped recovery is original availability geometry from that revision/starting committed definition, removing only six new panels. Existing panel definitions compared unchanged in maintained V2 output. Debian rollback `/opt/mw-resource-monitoring/debian-health.before-metabase-20260925.py`, SHA256 `427fe1f9076d9d95392762f7a6a1f547936c741ad33c393da380181124f21584`. Private Metabase collection graph and new object IDs retained with monitoring credentials.

Rollback collector first (old version does not import new module), restore overview layout/remove new panels, revoke key4 and archive monitoring canary/collection if retiring the feature. No business database restore or report rollback required.

## Verification

- Five probe tests passed: slow success, credential/rate classification, completed202, query failure, unauthenticated chart guard and timeout behavior.
- Existing ten collector tests passed.
- jq fresh/slow/stale/empty cases passed.
- Live probes all Healthy: platform105ms, readiness129ms, reporting232ms, charts183ms during bounded validation.
- Collector systemd Result=success / ExecMainStatus=0; normal subsequent samples observed in Grafana.
- Live preview verified all four green hover links, current SGT timestamps and both compact rows via screenshots. Dashboard saved and reloaded for persistence verification.
- Non-admin identity and denial tests verified; no forced service outage, business job, financial write or notification test performed.

Ongoing limitations: Debian probe dependency; Charts tests shell and authentication guard only; reporting SELECT1 tests connection rather than every report; no new push rules. Credential recovery folder exists outside Git but independent backup coverage was not audited.

Dictionary closure: saved question276 and its monitoring access/canary contract recorded in the Metabase question namespace; navigation index regenerated. All 1,170 dictionary documents passed structural validation with zero errors.
