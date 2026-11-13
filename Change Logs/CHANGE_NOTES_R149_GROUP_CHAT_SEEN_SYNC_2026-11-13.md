# Change notes — Group chat seen sync (R149), 13 November 2026

## Purpose
Owner request of 13 November 2026: the new-message mark on the Collection list should be synced across devices signed in with the same account, so the owner does not see the mark again on each other device. Since R146 the seen state is per device (a `localStorage` map). Owner authorization: a new table, one last-seen time per user and borrower, and PROD once tested. Nothing is deployed.

## Changes
As built.
- `database/migrations/V147__group_chat_seen.sql`: table `public.pwa_group_chat_seen` (primary key `borrower_id, partner_id`; foreign keys to Borrowers and Partners on delete cascade; `seen_last_message_at`, `updated_at`; index on `partner_id`) and `pwa_mark_group_chat_seen_v1(actor jsonb, borrower text, seen timestamptz)` returning `{kind stored|unchanged|ignored, seenAt}` (invoker, owner `postgres`; actor recheck 42501, unknown borrower P0002, no summary gives `ignored`, the value is clamped to the summary's `last_message_at`, forward-only upsert so an equal or older value changes no row and writes no change-log row). V97 row-change triggers (tracked tables 20 to 21); grants to `mw_app_<env>` with PUBLIC and `mw_integration_agent` revoked; `database/current/public-functions.sql` regenerated; `Test-GroupChatSeen.sql` and changes to the access-matrix, row-change, trigger-order and `Test-StatementBatch.sql` tests, and `ledger-owner-operator-independent.test.mjs`.
- Reader: columns `borrower_id`, `partner_id` and `seen_last_message_at` in `scripts/production/reader-capability-contract.json` and `scripts/configure-dev-read-role.py` (an operator grant step in DEV and PROD; until it is applied the read omits `chatSeenAt` and devices behave as in R146). `scripts/chat/build-schema-digest.mjs`: the table is excluded from the chat schema digest (the chat image is a touched component).
- Command service (`services/payment-command/handler.mjs`, `store.mjs`): `POST /api/collection/{borrowerId}/chat-seen`, body exactly `{lastMessageAt}`; the partner comes from the server actor only; capability read (own row only); no notification wake; replies 200, 400, 403, 404, 409 `command_busy`, 415, 503.
- Read and offline (`services/api/collection-read-contract.mjs`, `borrower-read-store.mjs`, `services/business/offline-dataset-delta.mjs`, `offline-dataset-chunks.mjs`): list items gain `chatSeenAt` for the caller's partner (omitted when the table or grant is missing); the table is an optional source of the `collection` domain keyed `borrower_id`, with no version bump; each seen write is one targeted collection delta on every device, including the other user's.
- PWA (`apps/pwa/src/chat-seen.ts`, new `chat-seen-sync.ts`, `CollectionRecords.tsx`): the mark shows only when `chatSummaryAt` is within 72 hours and newer than the server seen value, the page's session memory and the device's local value; `chat-seen-sync.ts` posts once per newly shown version, keeps unsent values in `localStorage` `mw-credit.chat-seen-unsent:<scope>` and flushes them on mount, online, visibility and render; 401, 409, 429, 5xx and network errors keep the value, 400, 403 and 404 drop it; a reader-only shell sends nothing.
- Documents (Dewey): this note, the release tracker, `database/README.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `docs/Development_Read_Service.md`, and the Data Dictionary `human-api.yaml` and `application.yaml`; the relation and routine records are captured from PROD at closure.
- Review corrections (Byte, after Chase's review): an `ownerTesting` gate copied into `markChatSeen` was removed for this route only (it is a store-wide build switch, always true in the DEV and PROD environment store, so it never fired there); unit tests cover a read-only partner getting 200 and writing only its own row, and a member without read or an unknown email getting 403. `chat-seen-sync` no longer resends an accepted value when storage refuses writes, and every 4xx except 401, 408, 409 and 429 is dropped.
- Order in PROD: V147 before the new command image (otherwise the command answers 503 and devices keep their unsent values).
- Not changed: the agent and the summary generation.

## Checks
| Command | Result |
| --- | --- |
| Byte's `mw-db-ci` migrations group | Exit 0 |
| Byte's `Test-GroupChatSeen.sql` | Pass |
| Byte's offline collection lab | 4 pass, 1 skipped |
| Byte's `npm test` | 1352 pass, 1 skipped (before the review corrections; CI's run is authoritative) |
| Byte's `npm run typecheck`, `npm run lint` and `npm run build` | Clean |
| Byte's e2e `chat-seen-sync` and `chat-summary` | 8 passed on each of three Chromium projects; 4 passed on WebKit |
| Chase's review | Pass. Endpoint: the partner comes only from the server actor, the body and path cannot name another partner, a query string is refused, CORS ok. SQL probe on a fresh V147 cluster: a wrong partner id for the email, an uppercase email or an extra actor key gives 42501 with the other partner's row untouched; the reader cannot EXECUTE; grants only to `mw_app_<env>`; not a definer; an equal or older value gives `unchanged` with `xmin` unchanged and no change-log row; a future time is clamped; 24 parallel transactions end at the maximum value with 6 stored, 18 unchanged, 6 change-log rows and no deadlocks. The read query filters `partner_id` server-side; offline is collection-only and optional |
| After Byte's corrections: `group-chat-seen` and `chat-seen` unit tests | 19 pass |
| After Byte's corrections: typecheck, lint and build | Clean |
| After Byte's corrections: `chat-seen-sync` e2e (mobile and desktop Chromium) | 2 passed |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request, DEV migration, reader grant and deploy | Pending |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- The faketime day-change offline case (needs the faketime lab).
- DEV migration, the DEV reader grant and deploy, and every PROD step: pending.

## Recovery
Revert the pull request; Hosting rollback to the previous version (in the environment inventory); the table may stay. Until the reader grant is applied, devices behave as in R146.

## Open questions
None.

## Remaining work
Chase's review, CI, DEV deploy and owner review, then PROD (authorized by the owner on 13 November 2026 once tested).
