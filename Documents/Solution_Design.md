# MW Credit solution design

A two-user financial operations PWA using the existing PostgreSQL financial engine. AppSheet is not a runtime, scheduler or API dependency.

| Component | Responsibility |
| --- | --- |
| PWA | Mobile/desktop operations, management, analytics, online posting, contextual drafts and durable saved-change synchronization |
| Native read/command APIs | Authentication, authorization, validation, idempotent commands and private receipt access |
| PostgreSQL | Financial records, allocations, cash effects, constraints and analytical providers |
| Debian integration agent | Receipt capture/review and messaging under its service catalogue |
| Notification worker | Web Push from persisted events, with safe recovery |
| Job worker | Daily charges and recent analytics through existing SQL routines |
| Metabase | Governed reporting; separate service, no PWA Reporting link |
| Grafana | Observations, alerts and controlled recovery |

## Data and financial behavior

PWA and agent payments converge on native API/SQL command handling. Do not duplicate allocation logic in clients. Preserve source identity, idempotency, audit and reconciliation; resolve uncertain outcomes before retrying.

Use [data model](PWA_Data_Model_Overview.md) and [dictionary](Data%20Dictionary/README.md). Heavy reusable computation belongs in SQL. Preserve grain, unknown/null values, signed corrections, date rules and provenance. Operational reads can display owner-scoped cached responses immediately while revalidating through live providers; completed-day analytics use governed snapshots. DEV and the PROD prepare complete owner-scoped read bundles and authorized receipt media in background, prioritizing foreground reads so unvisited views can query prepared data offline. Persistent bundles are separate from the evictable response cache. Bounded resumable chunks replace an existing complete bundle only after traversal finishes, using actor/day-scoped cursors and local mutation revision guards; traversal is not one global database snapshot. After initial completion, recurring content-hash manifests reuse unchanged DTO content and detect other-user changes; main-domain source fingerprints avoid unchanged provider evaluation, while protected recipient notifications scan manifests. Dataset/checkpoint commit guards preserve local mutations and pending edits. The header shows refresh/failure and active online cycle progress; polling coalesces with in-flight preparation to preserve cursor continuity; applied writes invalidate read revisions. Financial command validation and action previews remain network-authoritative. Historical corrections require rebuilding affected dates.

Principal, interest, capital, expenses and settlements remain distinct. Do not silently change reporting formulas in UI work. Partner identity/roles control access; delivery addresses are not authentication. Reviewed R062 settings let Delivery Email vary independently of Login Email, retaining role/capability checks; defaults never rewrite existing nullable flags. Cash-view changes are temporary until explicitly saved, distinct from immediately persisted language. Candidate SQL/source verification and DEV delivery are pending. DEV delivery stays isolated. Unfinished forms restore in their original context and require Save/Confirm before synchronization. The DEV and PROD saved-change coordinator reconciles durable queued requests by request ID before posting on startup/reconnect/foreground wake or manual Sync now, serializes tabs and retains rejected/conflicting changes for review. Submitted actions require no second sync approval; known failures expose stable specific reasons and retained details. Direct Loan Delete submits online immediately without a confirm/pending-queue stage and uses owner/environment/loan-scoped UUID/version session recovery; reopen checks status, and only explicit unresolved retry can repost the same request. Backend constraints remain unchanged. Manual and automatic synchronization share the same engine; short retries back off while durable requests remain, and abandoned-tab locks recover without changing request identity. Released R059 enables owner-authorized one-time note-draft migration and automatic synchronization in PROD.

## Receipts, push and jobs

Receipt originals/manual uploads remain private in the existing GCS bucket. Preserve exact paths, generations and access checks; never guess filenames or revive AppSheet for compatibility.

Successful PWA/agent commits wake the notification worker centrally. Persisted event/delivery records allow minute recovery without re-posting payments. Subscriptions are per device with account preferences; iPhone enrollment uses the installed Home Screen app. No always-on database listener.

One native scheduler owns each job/environment. Daily charges run at 00:05 and recent analytics hourly, Asia/Bangkok. SQL job keys/locking prevent duplicate work.

## Operations

This repository owns coordination/business references; MW-Credit-App owns PWA/API/SQL/infrastructure; MW-Integration-Agent owns Debian. DEV/PROD share Cloud SQL but use separate business databases, API identities and routes.

Use Secret Manager and unattended/workload identities. Terraform owns adopted infrastructure; Azure VM controller remains excluded. Follow [delivery policy](Rules/PWA_Orchestration.md) and [recovery](Rules/Release_Recovery_Runbook.md). Runtime identities/pins belong in [environment inventory](Environment_Inventory.md).