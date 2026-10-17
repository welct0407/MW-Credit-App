# Payment process monitoring — implementation handover

**Implementation completed in the subsequent owner-authorized monitoring task, 25 September 2026.** Existing collector activated; eight Performance visuals and existing Debian IRM alert saved/verified. See [implementation evidence](../../project/outputs/receipt-monitoring-20260925/README.md) and [visual guide](../../project/Documents/Resource_Monitoring_Dashboard_Guide.md). The original handover and dated pre-implementation observations below are retained as historical context. No worker code/business policy changed in the implementation task.

Original handover direction, 25 September 2026: this task reviews/fixes the receipt worker and prepares this handover. A subsequent model/task will configure Grafana. **No Grafana rule, dashboard, collector installation or metric activation was performed by this task.** See the reliability change log for the worker deployment result.

## Goal and boundaries

Add a dedicated Payment processing group to the existing Performance dashboard, showing the path from Instagram group discovery to confirmed posting and Partner delivery. Reuse the existing two-minute Debian collector, GCP data source and Grafana IRM contact. Do not create a second watchdog, business scheduler or direct notification service. No borrower names, bank details, payment amounts, references, image URLs or credentials belong in telemetry.

Business policies remain: ordinary payment automatic; overpayment requires a signed, linked approval by a current AI Reviewer; closure manual; successful posting informs all enabled Partners, IG first/email backup; no group messages. Monitoring must never retry a payment, manufacture an approval, clear journal state or invoke a business cycle.

## Existing integration points — verified 25 September

| Asset | Identity |
| --- | --- |
| Grafana | https://monitor.mw-credit.com |
| Performance dashboard | `/d/mw-resource-performance` |
| GCP data source UID | `mw-gcp-monitoring` (Infinity, backend JQ) |
| GCP project / instance ID | `clever-oasis-508610-n7` / `8223265527494214160` |
| Debian VM | `vm-mw-credit-agent`, `asia-southeast1-a` |
| Collector | `/opt/mw-resource-monitoring/debian-health.py` |
| Collector units | `mw-resource-health.service` / `.timer`, every two minutes |
| Worker environment | `/opt/mw-integration-agent/.venv`; config `/etc/mw-integration-agent/config.json` |
| Collector source | `project/scripts/monitoring/debian-health.py` |
| Current Debian alert | UID `afz3o5cmmfabkb`, `MW | Debian component unhealthy` |
| Alert group / folder | `Performance 2m` / `f9w88d` |
| IRM route | Contact `MW Performance IRM`; integration `MW Performance Monitoring`; escalation `MW owner mobile push` |

Use Chrome's **mw-credit.com** profile, signed into `welct0407@mw-credit.com`; browser IDs can change. Grafana profile was Welct MW Credit. The saved setup API token returned HTTP 401; do not assume API access works. The existing UI session works. Do not print/reuse an expired token, create wider access without authorization, or automate Instagram in a browser.

The existing alert was read without saving changes. Baseline UI version history: version 1, dated 23 September 2026 15:38:36 SGT; detail page also showed an update timestamp of 25 September 17:44:27 SGT. Recheck the current rule before editing. It evaluates every two minutes, waits four minutes, has a ten-minute query window, uses Last → above 0, and routes directly to MW Performance IRM. All 12 instances were Normal. Existing missing/stale/Unknown values and no-data/errors do not page (KeepLast). This is a known visibility gap, not already fixed monitoring.

## Prepared worker interface and collector patch

`mw_integration_agent.receipt_health.inspect(config)` is a read-only journal query returning only numeric values. It does not call Instagram, AppSheet, Codex, or messaging. It runs on the existing worker identity, using the existing `mw_agent` journal database. No schema/grant change is needed. `assess(...)` contains deterministic tests.

The maintained collector file in `project/` contains a **prepared but undeployed patch**: combine receipt service/timer health with `inspect()` status; inspection failure becomes Down; excessive receipt runtime becomes Degraded after ten minutes; export a same-sample snapshot as `custom.googleapis.com/mw_resource_monitoring/receipt_pipeline`, label `field`, INT64 GAUGE. Existing health metric component `receipts` receives the combined state. All other source/service behavior stays unchanged. Deploy only after the installed worker contains `receipt_health` and the owner's monitoring task is underway. The patch has not been verified against live GCP export.

Status values: 0 Down, 1 Healthy, 2 Degraded, 3 Paused, 4 Unknown. If paused or inspection fails, missing queue values must display Unavailable, **never zero**. Counts are a current snapshot, not selected-period totals. The completed count is retained journal POSTED records, not money received today.

| Field | Meaning / alert contribution |
| --- | --- |
| `status` | Combined collector service/queue state; worker `inspect()` alone returns 1 or 2 |
| `pending_images` | Images waiting for extraction or retry |
| `validated_receipts` | Validated receipts waiting for proposal/decision routing |
| `held_receipts` | Internal REVIEW holds needing manual investigation; not executable approvals |
| `pending_reviews` | PENDING proposals awaiting a linked reviewer reply |
| `approved_payments` | APPROVED proposals awaiting guarded execution |
| `completed_payments` | Retained POSTED review records; historical total, not period throughput |
| `oldest_pending_seconds` | Age of oldest PENDING/VALIDATED job; 0 when the observed queue is empty |
| `stalled_jobs` | PENDING/VALIDATED over 10 min; REVIEW_REQUESTED with no review over 5 min; APPROVED over 10 min |
| `unnotified_holds` | REVIEW over 5 min with no accepted IG or sent email hold notice to any reviewer |
| `unconfirmed_postings` | POSTING or UNKNOWN; reconciliation only, never repeat Add |
| `undelivered_reviews` | PENDING over 5 min without an accepted IG or sent informational fallback |
| `overdue_reviews` | PENDING over 2 hours, even if notified; proposals expire after 24 hours |
| `failed_notifications` | Unresolved Partner result deliveries over 5 min; counts each undelivered recipient, or 1 for a missing result event; disabled Partner suppression excluded |
| `inspection_failed` | Collector-only value 1 on queue inspection failure; other queue fields unavailable |

Age is measured from existing job/proposal `created_at`; it is not an exact duration in the current sub-stage. No new database timestamps were introduced. A proposal approved after waiting may therefore already meet the execution age threshold until processed. Provider acceptance is not proof a human read the message. A sent fallback email is delivery for health purposes but **cannot approve a review**. Accepted old UNKNOWN-result notices do not hide missing POSTED-result delivery after reconciliation. A resolved/terminal review does not keep its earlier failed notice active.

## Proposed Grafana visual group

Preserve all existing panels, owner layout and unrelated queries. Capture a fresh dashboard export/version first. Add one row, “Payment processing — Instagram to recorded payment”, with these parallel visuals:

| Visual | Source / presentation |
| --- | --- |
| Overall pipeline health | Existing `health` components `polling` and `receipts`, shown separately; never combine into a misleading healthy average |
| 1 · Group scanning | Reuse panel 63's `worker_timing` selector: health, last completed scan and running/idle; timestamps in SGT, preferably minute display |
| 2 · Receipt extraction | `pending_images`, `oldest_pending_seconds`, plus `stalled_jobs`; positive normal queue is neutral, aged backlog is warning |
| 3 · Validation | `validated_receipts`, `held_receipts`, `unnotified_holds`; holds differ from extraction backlog |
| 4 · Reviewer decisions | `pending_reviews`, `undelivered_reviews`, `overdue_reviews`; normal awaiting decision is not worker failure |
| 5 · Payment posting | `approved_payments`, `unconfirmed_postings`; any unconfirmed outcome highlighted red with “reconcile; do not retry” |
| 6 · Partner notifications | `failed_notifications`; explain IG first/email backup and informational-only review email |
| Queue trend | Time series of pending images, held receipts, pending reviews and unconfirmed postings; no sum across overlapping stage/error counts |

Use six-minute freshness and same-sample alignment. Current cards must query a recent window ending now regardless of the historical trend range, or visibly explain unavailable current data. `nextPageToken`, malformed numeric/status values, missing expected fields and clock-skewed timestamps must not become green or zero. No interpolation of missing telemetry into healthy counts. The existing `worker-timing.jq`, query helpers and Metabase panel patcher show classic/V2 dashboard patterns; extend the maintained builder and saved definitions so regeneration retains this section.

## Alert changes to implement

Reuse the existing Debian component rule/contact rather than create duplicate receipt paging. Keep fresh Down/Degraded behavior for its 12 component labels. For **receipts and polling**, missing/stale (over six minutes), Unknown or invalid telemetry should also produce an unhealthy value. Fresh Paused remains nonpaging only for an intentional supported activation switch. Keep stable component labels; avoid identifiers in labels or annotation values.

Do not retain KeepLast as a silent success on a completely failed receipt-monitor query: configure and test an appropriate no-data/error alert path to the same IRM contact. Preserve the two-minute evaluation/four-minute pending period unless the owner chooses otherwise. Update annotations to direct the operator to the new group, distinguishing failed business work from unavailable telemetry. A full collector/VM outage must be detectable by Grafana independently of the worker. The public webhook rule is complementary and does not establish group-poll health.

Suggested normal incident path: inspect relevant stage → inspect private worker journal/log → reconcile business state → use only the maintained explicit reconsideration command when eligible. Never manually clear UNKNOWN/POSTING or replay Add as alert recovery. A hold already notified remains visible as a count; only missing notice or overdue work contributes to degraded health. IRM owns acknowledgement/escalation, not a second IG escalation loop.

## Implementation and acceptance checklist

1. Read applicable AGENTS and monitoring references; preserve unrelated repository work. Record current Git/collector/dashboard/rule rollback points. No AppSheet app or business database change is required.
2. Verify installed runtime revision 21 and import/execute `receipt_health.inspect` read-only; record only counts. Verify current queue counts rather than assuming the dated observations below remain true.
3. Test the collector patch with `test_debian_health.py`, module-import failure, read-only DB failure and missing/paused queue snapshots. Back up and replace only the existing collector file; preserve its mwagent permissions. Leave all business schedules unchanged. Start only the monitoring service to verify export.
4. Confirm the custom metric descriptor and all field samples exist in GCP with the existing VM identity. Verify collector hash and timer health. Do not install another service account/key or scheduler.
5. Add the visual group to a fresh dashboard definition, preserve existing content, update canonical query/build files, then visually verify desktop layout and each field's actual values/freshness.
6. Modify the existing alert safely. Test selectors against synthetic healthy/recent-waiting/stuck/unknown-posting/failed-recipient/stale/missing/malformed/pagination fixtures. Preview real data; do not manufacture financial writes or a business outage. If a mobile push test is desired, use the existing IRM test mechanism under scoped authorization, not a fake failed payment.
7. Verify readback-failure and ordinary queued-work semantics match the worker tests. Verify one Partner's successful notification does not mask another's failed result. Explicitly document live rule and contact readback; do not claim phone delivery without evidence.
8. Update `Documents/Resource_Monitoring_Dashboard_Guide.md` in the same batch (panel IDs, groups, meanings, freshness, thresholds and limitations), plus `Documents/Resource_Monitoring.md`, monitoring README and a change log. Publish intended sanitized source/evidence. Link this handover's completion; do not rewrite historical observations as current proof.

Rollback: restore only the backed-up collector and affected Grafana definition/rule; preserve worker journals, business configuration, posted financial records and unrelated panels/rules. Reverting monitoring does not undo worker improvements.

## Dated observations and known limits

Read-only candidate inspection during this audit found two historical unnotified internal holds and one overdue review, with no stuck extraction/proposal jobs or unconfirmed postings. The worker change surfaces those holds without reprocessing their payments. Recheck deployment evidence for delivered outcomes.

Worker deployment verified at 21:35 Bangkok, 25 September: revision 21, both receipt/polling timers active and last cycles successful. Both old hold warnings are now IG ACCEPTED; unnotified holds and failed results are zero. Two notified holds and one overdue pending review remain visible; assessment returns Degraded because of the overdue review. Retained POSTED count stayed 19. The collector source was prepared but not installed at that time; it now lives in `project/scripts/monitoring/`. Use these as dated handoff facts, not future runtime assumptions.

Bank-reference deduplication cannot identify a manual payment with no bank reference. A simultaneous manual write between the final reference check and AppSheet Add remains a concurrency window; closing it requires a separately reviewed database/API idempotency change. No schema change was authorized or made here. Model extraction can misread a receipt; deterministic checks, conservative holds and readback reduce this risk but do not verify an actual bank credit. The API only exposes what Meta returns; successful polling cannot prove receipt of a group message missing from Meta's API response.
