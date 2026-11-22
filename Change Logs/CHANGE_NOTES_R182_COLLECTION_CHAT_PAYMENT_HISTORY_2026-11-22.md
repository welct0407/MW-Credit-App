# Change notes — R182 collection, chat and payment history changes, 22 November 2026

## Purpose
Owner request of 22 November 2026, with three iPhone screenshots (the chat thread menu offering only Rename and Archive; the Collection Overdue group whose tiles say only "Overdue"; a borrower's Collection detail with a tall, sparse Payment history list whose automatic note line is cut off at the screen edge): "Make a few changes in the next release:
1. When I'm in the collection page, if I tap collection button at the bottom again, go to the top of the list
2. In collection overdue category, show the same last payment date like long overdue
3. In the chat list, when I click the three dots, allow me to delete old chats. If I swipe individual chat to left, also show a delete button in red to allow me delete it
4. At the end of the chat response, show how much time it took to answer this question, also show the date and time it was responded.
5. Revamp the payment history list when I click it, let echo review and propose a better UX for the list. And if I click the payment history button again, the list show be hidden."
The owner then asked to engage the team. Built and verified locally, not deployed; PROD promotion needs the owner's "move to production".

## Changes
Commits `69a209d`, `e18cfa3`, `2d2ab93`, `d5003c4`, `f3e5423`, `b8971e7` on `main` `a5e84cb` (R181); not pushed.
- Item 1 (`apps/pwa/src/CollectionRecords.tsx`, `live-main.tsx`): tapping the active Collection tab again returns to page 1 and the top with the search kept; on the stacked layout (1050px and below) an open borrower detail returns to the board top; nothing happens while a child page, payment form or busy state is open. Collection only; other tabs unchanged. PWA only.
- Item 2 (`services/api/collection-read-contract.mjs`, `CollectionRecords.tsx`): no migration. The inline board SQL emits `since_days` and `never_paid` for the overdue rank when the days are 0 to 7, else both null; `projectCollection` accepts that. Items carry `sinceLastPaymentDays` and `neverPaid`. Tile text: "No payment for N days" (2 or more), "Last paid yesterday", "Last paid today", "Never paid · N days", plain "Overdue" when no usable date. Days rather than a date, to match Long overdue (8 or more, unchanged); Echo recommended this reading of "last payment date". The offline dataset uses the same projection.
- Item 3 (migration `database/migrations/V154__chat_thread_soft_delete.sql`, `services/chat/handler.mjs`, `services/chat/assets/schema-digest.json`, `database/current/public-functions.sql`, `apps/pwa/src/chat/ChatThreads.tsx`, `ChatWorkspace.tsx`, `chat-client.ts`, `chat-protocol.ts`, `chat-text.ts`): a soft delete, because the V104 triggers forbid DELETE and proposals, history, tool calls and notification events reference the thread. V154 widens the CHECK `pwa_chat_threads_status_check` to allow `'deleted'` and patches six existing functions in place (`pwa_chat_thread_update_v1`, `pwa_chat_thread_v1`, `pwa_chat_messages_v1`, `pwa_chat_message_v1`, `pwa_chat_turn_begin_v1`, `pwa_chat_models_default_v1`); no table, column, new function or grant. `PATCH /api/chat/threads/:id {status:'deleted'}` returns 200 (also on repeat), 400 with any other key, 409 `turn_in_progress` (a claim under 5 minutes old) or `proposal_executing` (a proposal executing or unknown), 404 afterwards; pending proposals are cancelled as `superseded`; the deleted thread is `not_found` on every read and on turn begin, and ignored for the default model. No HTTP DELETE, no CORS change. PWA: "Delete…" in the ⋯ menu of both lists, a red swipe-left Delete button on touch devices, one confirmation, one thread at a time.
- Item 4 (`ChatMessage.tsx`, `chat-text.ts`, `chat.css`): PWA only. Every committed reply already carries `usage.latencyMs` (server turn time; excludes service wake-up and network) and `createdAt`, so old replies show the footer too: "took 14 s" or "took 1 min 12 s" (omitted at 0) and the Bangkok date and time "22-Nov 14:05" (with the year in another year). None on provisional or client-only failed replies.
- Item 5 (`apps/pwa/src/PaymentHistory.tsx`, `live-style.css`): Echo's revamp: two-line rows reusing the Payments page row idiom, month headings, "Posted" not shown and only exceptions flagged, a one-line note with ellipsis, a Receipt marker, the whole row opens the payment. The button toggles the list in every state; reopening loads page 1. Closing with a payment open acts like the panel's Back, which has no unsaved-input guard, so typed correction input is discarded (orchestrator decision on Echo PH-TGL-04).
- Echo codes implemented: PH-UX-01 to 07 and 09, PH-TGL-01 to 03, CHAT-DEL-01 to 05, CHAT-META-01 and 02, COL-OVD-01, COL-TOP-01.
- Infrastructure (Forge): none. The allowed methods live in the chat service code; no rewrite, IAM, secret, environment variable or Terraform change; no Grafana panel or job reads thread status. Promotion deploy set, the same in DEV and PROD: a verified PROD backup; V154 through the guarded runner with the chat owner window only; the rebuilt chat schema digest; the read and chat Cloud Run services on the new image (command too if the image is shared); Hosting.
- Known and accepted: a reply that finishes after the 5-minute claim can still be committed into a deleted thread and may raise a notification that opens to "thread gone"; a notification already queued is still delivered with the thread title; terminal proposals of a deleted thread stay readable through the proposal routines; `pwa_chat_thread_create_v1` with a deleted id answers `created:false` (the PWA always creates with a fresh UUID); the Grafana chat cost panels still count deleted threads' turns (the cost was spent).
- Documents updated: `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Solution_Design.md`, `project/Documents/PWA_Data_Model_Overview.md`, `database/README.md`. The Data Dictionary is not changed yet: its entries for the six routines and the CHECK are PROD captures and V154 is not applied; refresh them after promotion, as for V153. Environment Inventory unchanged (nothing deployed).

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Clean (Byte, `b8971e7`, clean tree) |
| `npm run typecheck` | Exit 0 (Byte, `b8971e7`) |
| `npm test` | 1,421 pass, 1 skipped (Byte, `b8971e7`) |
| `mw-db-ci -Group migrations` | Exit 0 (Byte, `2d2ab93`): 154 migrations, Test-Chat, access matrix, public-functions match, nine concurrency suites, nine historical upgrade runs; C collation only |
| Chromium: `chat.spec.ts`, `payment-history.spec.ts` (new), `collection-read.spec.ts` | 87 pass, 1 skipped, the swipe test on desktop (Byte, run before the PWA commits on the same content) |
| `npm run check:docs` | 0 failures, 0 warnings (Dewey; final pass pending) |
| Chase verification | Pending |
| Echo build review | Pending |

## Not run
- The wide local browser suite (by rule), the `en_US.UTF-8` collation variant of the migrations group (not installed in the session; CI covers it), a DEV deploy, any PROD action and a real iPhone. A skipped check is not a pass.
- Pre-existing, local-only: 3 of 26 cases in `tests/integration/collection-postgres.test.mjs` fail identically on `e307371` (stale fixture expectations: `chatSummaryAt`, `prepaidPaymentDate`); Byte reports that no workflow runs that file; Chase is confirming.

## Recovery
Git baseline `main` `a5e84cb` (R181). PWA and service changes revert by redeploying the previous build (the previous chat service never sends `'deleted'`). V154 is forward-only like every shared migration: a thread marked deleted stays in the table and can be shown again only by a later reviewed migration or an owner-authorized correction. There is no undo in the app.

## Open questions
None.

## Remaining work
Chase's verification and Echo's build review; the owner's "move to production", then promotion (verified PROD backup, V154, the chat schema digest, the read and chat images, Hosting), the Data Dictionary refresh and owner acceptance. Recorded, not implemented: 10 payments per page (PH-UX-08), a server-supplied source label instead of the automatic note (PH-UX-03; payment rows have no method or source field, so it needs a server change), Collection top on the other tabs (COL-TOP-02 and 03), bulk chat delete.
