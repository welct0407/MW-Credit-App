# R051 — Grafana row 5 and VM-01 daily uptime

4 October 2026. Owner requests item1 (bridge availability/dispatch/outbox) and item2 (subscription/auth renewal/delivery continuity) as separate groups in Performance row5, plus daily VM-01 uptime bar chart under Cost/Azure.

**Status: source published in draft PR12; live inspection/publication blocked on existing Grafana browser/export route.** No live dashboard, alert/filter, runtime, IAM, credential/network or VM power change performed. No business writes/sends/tests.

Starting Git commit `2e56498dddac2709434301a34625cb32b3774730`, clean tree; branch `feat/grafana-row5-vm01-uptime`. Owning instructions reviewed; R051 Open. Local scoped patch, pure bridge observation contract, passive Azure daily selector, proposals and tests are under [checkpoint](../outputs/grafana-row5-vm01-20261004/README.md), including exact changed files, evidence, rollback and remaining implementation/approvals. Tests passed via `node scripts/monitoring/test_row5_dashboard.cjs`; no live-query or UI claim. Proposed definitions use dated source snapshots and must not be treated as live backups. Operating guide gains only a labeled Proposed section. Source publication is now verified below; live reconciliation pending parent resumption.

Fresh GCP readback confirms bridge00014-s6x Ready, 100% traffic. Authenticated bridge read returns owner enabled, pending0/failed0/delivered9/cancelled0, cap100; age/expiry/expected state unavailable. Live Grafana backup not possible through currently exposed tools; Dots route required. Azure availability metric semantics independently checked against official documentation; actual VM series still unverified. Null must remain unknown; observed running/available hours are not billable allocation or exact power runtime.

## Continued source preparation

Parent resumed local work while exporting Grafana. Optional disabled-by-default post-dispatch Cloud Run instrumentation now builds, with numeric-only fields, uncapped Firestore counts/oldest age, exact expected membership, revocation/deadline checks and private renewal comparison. New composite-index definition and paused independent IRM-only alert proposals are **not applied**. All 40 targeted monitoring/events/offline-auth/store tests pass; dashboard, passive Activity Log parser and alert-selector suites pass. Monitoring failure preserves completed dispatch200 and emits no secret details. Existing grant730-day ceiling and delivery/subscription semantics remain tested. Files and exact approval scope are in the rollout proposal, including metricWriter permission if absent; no new credentials/network settings or Debian/MW worker changes.

R051 tracker, monitoring README and operating/visual references now record this proposed source scope. Official Activity Log/default retention/schema/REST documentation verified; actual VM01 passive reads still need parent Grafana/Azure route. No live instrumentation, dashboard/rule publication, notification/filter or VM/business effect. Source publication/draft PR follows this checked checkpoint; later acceptance/deployment readback will update this same log.

## Source publication

Verified normal push of implementation `d010c282043041718da675e12663c1c8aa729e57` to `feat/grafana-row5-vm01-uptime`; connected actor welct0407 created draft [PR12](https://github.com/welct0407/AppSheet-Loan-Project/pull/12) at15:40:10 UTC. Commit author/committer verified as welct0407<welct0407@gmail.com>. Publication evidence recorded on the same branch. No merge or production effect. Live completion remains blocked on parent fresh Grafana/Azure readbacks and the exact instrumentation/IRM approval bundle.

## Fresh dashboard reconciliation

Parent provided authenticated 15:42–15:43 UTC v2 backups; original hashes/generations/resourceVersions recorded in [fresh evidence](../outputs/grafana-row5-vm01-20261004/fresh-reconciliation.json). Performance61→69 elements adds IDs120–127 only; Cost23→24 adds ID110 only. Tests prove removing only task additions restores the complete original object, preserving all other panels/layout/preferences/metadata. Fresh imports and browser handoff prepared; original Library backups are preserved. Parent confirms both live URLs. Live folder annotation is absent, so handoff requires existing-dashboard UI save and folder verification. Passive Azure results/rule/contact/datasource inspection still pending; no live save or deployment/alert effect applied.
