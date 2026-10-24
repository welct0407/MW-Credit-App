# In-app chatbot (R090) — detailed design

Owner go-ahead: 23 October 2026 (Asia/Bangkok), on the high-level plan reviewed the same day. That go-ahead approves this document, the three new business-database tables below and the stop of the Instagram Partner conversation at implementation start. It does not approve a PROD deployment; promotion follows the [release workflow](../../Documents/Rules/Release_Workflow.md) on a later owner instruction.

This is the design the six-agent team implements. Archie resolves any ambiguity it leaves inside the batch's change note; Byte, Chase, Dewey, Echo and Forge take the waves in [Delivery](#11-delivery-waves-and-owners). Nothing here is deployed yet.

## 1. Scope and owner decisions

Partners stop asking the business questions over Instagram and ask them inside the PWA instead. The conversation engine moves from the Debian VM (`integration-agent/`, Python, Instagram webhook) to a Cloud Run service in Node that the PWA calls directly. The receipt recognizer, Instagram receipts and reviews, the daily cash statement and the webhook stay on the VM and are not touched.

| Decision (23 October 2026) | Design consequence |
| --- | --- |
| Three models in the picker: `gemini-4-argon` (default), `gemini-3.8-flash`, `gemini-3.5-flash` | Server-side allowlist in the chat service configuration ([§3.2](#32-configuration)); the PWA never hard-codes a model. Forge confirms `gemini-3.5-flash` answers on Vertex AI location `global` with function calling before it is listed (the R084 live test, repeated); if it does not, it is listed `available:false` with the reason and the picker shows it disabled. |
| Writes come later, as a separate batch | First release is read-only: no `api_action`, `verify_operation`, `database_*` tools. The engine keeps a tool registry so the later batch adds the write tools without a redesign ([§13](#13-later-batch-writes)). |
| Streaming | Server-Sent Events from the chat service; reply text streams as provisional tokens and is committed after the number-grounding check ([§3.5](#35-streaming-protocol)). |
| Stop the Instagram conversation at implementation start; decommission after the owner's PROD test | Phase 0 is a config-only switch on the VM ([§9](#9-phase-0-stop-the-instagram-conversation)); the decommission checklist is [§12](#12-phase-3-decommission-checklist). |
| Separate Cloud Run service | `mw-credit-app-chat-{dev,prod}`, fifth service from the existing API image, own identity with the Vertex AI role ([§3](#3-chat-service) and [§8](#8-infrastructure)). |

Out of scope: voice, attachments or receipt upload in the chat; borrower-facing chat; Claude as a provider (no Vertex quota); any change to receipts, the webhook or the recognizer; cancelling a turn in flight (the turn runs to completion and is journaled; a Cancel button is a later addition if wanted).

## 2. Architecture

```
PWA (Firebase ID token, Accept: text/event-stream)
   │ https://mw-credit-app-chat-{env}-737787224638.asia-southeast1.run.app
   ▼
Cloud Run mw-credit-app-chat-{env}   services/chat/server.mjs (same image as the other four services)
   ├─ verifyFirebaseClaims → Partners membership (capability policy, `read`) → actor {issuer, subject, partnerId, loginEmail}
   ├─ pwa_chat_*_v1 RPCs on loan_manager_{env}  (threads, messages, turn claim, replay history, tool-call journal)
   ├─ Vertex AI streamGenerateContent?alt=sse, location global, model = the thread's model   (service-account token, no key)
   │     tool loop: data_catalogue · read_records · sum_field · sql_query · loan_payoff   (read-only, concurrent reads per round)
   │     number grounding on the final text (R088 rules, ported)
   └─ usage per turn on the assistant message row (prompt, output, thoughts, cached tokens; rounds; latency)
```

- No Debian dependency and no Meta dependency anywhere in the path. The chat service does not call the VM recognizer and has no VPC egress.
- The command service, the reader and the workers are unchanged. The chat service reuses their libraries: `services/lib/firebase-claims.mjs`, `services/lib/http-boundary.mjs`, `services/lib/pool.mjs`, `services/lib/budget.mjs`, `services/production/business-principal.mjs`, `services/production/business-policy.mjs`, and the read providers under `services/agent-conversations/` for the native data tools (in process, not over HTTP).
- One Cloud Run request per turn (POST message → SSE until done). Cloud Run timeout 300 s; the turn deadline is 240 s so the service always answers before the platform cuts the request.

## 3. Chat service

### 3.1 Process and role

- Entry `services/chat/server.mjs`, modelled on `services/production/business-server.mjs`: `createChatRuntime(process.env, dependencies)` from `services/chat/runtime.mjs`, `http.createServer`, `/health` for the startup probe. The HTTP server's `requestTimeout` and `headersTimeout` come from a new `BUDGET.chat` entry in `services/lib/budget.mjs` (request timeout 290 s, headers 10 s, statement timeout for the RPC pool 9 s as `command`, SQL tool statement timeout 20 s).
- `services/production/business-config.mjs` `loadBusinessConfig` gains the role `chat`: `FOUNDATION_ROLE=chat`, `DB_USER` and `RUNTIME_SERVICE_ACCOUNT` must be `mw-credit-app-chat-{env}@clever-oasis-508610-n7.iam[.gserviceaccount.com]`, receipts, notifications and the agent APIs are refused for this role (fail closed, as the existing checks do), and the new `CHAT_MODELS_JSON` is parsed and validated only for this role. `services/production/business-runtime.mjs` branches `serviceRole==='chat'` to `createChatHandler` and never installs the command, notification or agent handlers on it.
- Runtime identity: service account `mw-credit-app-chat-{env}`, IAM database user of the same name, `roles/cloudsql.client`, `roles/aiplatform.user` (project level, this identity only), the existing custom `read_auth_user` role for Firebase token verification, `secretmanager.secretAccessor` on `mw-credit-app-{env}-capability-policy`. No API key and no new secret.

### 3.2 Configuration

`CHAT_MODELS_JSON` is a plain environment variable set by Terraform (not a secret: it holds no credential), validated on start:

```json
{"version":1,"location":"global","default":"gemini-4-argon","thinkingLevel":"MEDIUM",
 "maxRounds":24,"requestTimeoutSeconds":120,"turnTimeoutSeconds":240,
 "historyTokenLimit":150000,"seedChars":40000,"maxOutputTokens":16384,
 "models":[{"id":"gemini-4-argon","label":"Gemini 4 Argon","available":true},
           {"id":"gemini-3.8-flash","label":"Gemini 3.8 Flash","available":true},
           {"id":"gemini-3.5-flash","label":"Gemini 3.5 Flash","available":true}]}
```

Rules: `id` matches `^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$`, 1 to 8 models, unique ids, `default` listed and available, `thinkingLevel` in `LOW|MEDIUM|HIGH|MAX` (always sent; `thinkingBudget` never, as `gemini-4-argon` rejects it), bounds as in `gemini_conversation.BOUNDS` (`maxRounds` 4 to 40, `requestTimeoutSeconds` 30 to 240, `historyTokenLimit` 50,000 to 400,000, `seedChars` 0 to 200,000), `turnTimeoutSeconds` 60 to 240 and at least `requestTimeoutSeconds`. Grounding mode is fixed to `enforce` (no switch; the owner's R088 decision).

Adding or retiring a model is a Terraform change of this variable plus `project/scripts/monitoring/model-prices.json` for cost, not a PWA change: the PWA reads `GET /api/chat/models`.

### 3.3 Authorization

Every route: `Authorization: Bearer <Firebase ID token>`; `beginRequest` from `services/lib/http-boundary.mjs` with the environment's two web origins, methods `GET, POST, PATCH`, headers `Authorization, Content-Type, Accept`; `verifyFirebaseClaims` (google.com sign-in, verified email; revocation checked on POST and PATCH); `createBusinessMembership(config).resolveActor(client, principal, 'read')` resolves the Partner. A principal without a `Partners` row or without `read` in the capability policy gets 403, which the PWA shows with its existing access-denied card. No new capability: both Partners already hold `read`, and the owner's R085 decision gave the conversation full read access. A dedicated `chat` capability can be added later by extending the policy allowlist in `business-policy.mjs` and issuing new policy versions; it is not needed for two users.

Every thread and message is scoped to `partnerId`: an id that belongs to another Partner answers 404 (no existence leak between the two accounts).

### 3.4 Routes

All paths exact, JSON unless stated. Errors: `{error:'invalid_request'|'not_found'|'unauthorized'|'access_denied'|'model_unavailable'|'turn_in_progress'|'unavailable'}` with 400/404/401/403/409/503. Ids are client-generated UUID v4 (`UUID_V4` from `services/lib/ids.mjs`). Text is well-formed UTF-16, no C0 controls other than newline and tab.

| Method and path | Body | Answer |
| --- | --- | --- |
| `GET /health` | — | `{ok:true}` (startup probe; no auth) |
| `GET /api/chat/models` | — | `{version:1, default, models:[{id,label,available,reason?}]}` |
| `GET /api/chat/threads?status=active|archived&before=<cursor>&limit=1..50` | — | `{items:[{id,title,model,status,createdAt,lastMessageAt,messageCount}],nextCursor}` newest `lastMessageAt` first |
| `POST /api/chat/threads` | `{id, model, title?}` | 201 `{item}`; the same id again by the same Partner answers 200 with the existing item (idempotent); `model` must be listed and available |
| `PATCH /api/chat/threads/:id` | subset of `{title (1..120 chars), model, status:'active'|'archived'}` | `{item}`; a model change applies from the next turn |
| `GET /api/chat/threads/:id/messages?before=<seq>&limit=1..50` | — | `{items:[message],nextCursor}` oldest first within the page; `message = {id,seq,role:'user'|'assistant',text,status:'ok'|'failed'|'pending',model?,createdAt,usage?:{promptTokens,outputTokens,thoughtsTokens,cachedTokens,rounds,latencyMs},tools?:[{name,count}],errorCode?}` |
| `GET /api/chat/threads/:id/messages/:messageId` | — | `{user:message, assistant:message|null}` — the outcome of one turn (used after a dropped stream) |
| `POST /api/chat/threads/:id/messages` | `{id, text (1..4000 chars), model?}` | With `Accept: text/event-stream`: the SSE stream of [§3.5](#35-streaming-protocol). With `?stream=0`: one JSON `{user, assistant}` after the turn (tests and fallback). `model` here only overrides this thread's model for this and later turns (same as PATCH then POST). |

Limits: one turn in flight per thread (`409 turn_in_progress`); request body 64 KB; a thread holds at most 2,000 messages (then the UI suggests a new chat); the PWA sends a `X-MW-Wake-Deadline` header as the other services expect, set to now + 250 s.

### 3.5 Streaming protocol

Content type `text/event-stream`, `Cache-Control: no-store`, a `: ping` comment every 15 s while waiting on the model, and `X-Accel-Buffering: no`. Events, in order, each `event: <name>` with a JSON `data` line:

| Event | Data | Meaning |
| --- | --- | --- |
| `accepted` | `{messageId, seq, model}` | The user message is journaled and the turn is claimed. |
| `round` | `{n}` | A model request started (n from 1). |
| `tool` | `{callId, name, state:'running'|'ok'|'error', ms?, summary?}` | One tool call of the round; `summary` is the short label shown under the reply (for example `"Loans, Payments"` for `read_records`, `"2 rows"` for `sql_query`). |
| `delta` | `{text}` | Provisional reply text as Vertex streams it. The client appends it in the provisional style. |
| `retract` | `{reason:'ungrounded'|'too_long', attempt}` | The provisional text failed a host check; the client clears it and shows "Checking the figures again…". The model retries (at most 3 grounding attempts, as in R088). |
| `message` | `message` (assistant row, `status:'ok'`) | The committed reply: journaled, grounded, with `usage` and `tools`. Replaces the provisional text. |
| `error` | `{code, message?}` | The turn failed; an assistant row with `status:'failed'` and `errorCode` is journaled and the user sees the localized failure text. Codes: `MODEL_UNAVAILABLE`, `MODEL_TIMEOUT`, `TOOL_ROUNDS_EXCEEDED`, `GROUNDING_EXCEEDED`, `TURN_TIMEOUT`, `PROMPT_BLOCKED`, `INTERNAL`. |
| `done` | `{}` | Always last. |

A dropped connection does not abort the turn: the service finishes it and journals the result, and the client reads the outcome with `GET …/messages/:messageId` (poll every 3 s while `assistant` is `null` and the turn is younger than 5 minutes, then show "Reply not received. Open the thread again." and stop). A reconnect never re-sends the message id; a re-POST of the same id while the turn is still claimed answers `409`, and after the turn completed answers the journaled outcome as `{user, assistant}` (idempotent).

Why provisional text instead of waiting: the model's final answer is plain text (no `finish` tool in the app, see [§4.2](#42-what-changes-from-the-instagram-engine)), so its tokens can be shown as they arrive; the grounding check needs the whole text, so the UI marks it provisional until the `message` event. The PWA renders provisional text in a lighter style with a small "checking figures" label; a committed reply looks normal.

## 4. Conversation engine (Node port of `integration-agent/`)

### 4.1 Port map

| Python (integration-agent/src/mw_integration_agent/) | Node (services/chat/) | Notes |
| --- | --- | --- |
| `conversation_session.py` loop, retries, epochs, seeding, `transcript()` | `engine.mjs` | Same round loop, nudges (`FINISH_NUDGE` becomes "Answer now in plain text; do not call more tools"), `ROUND_NUDGE`, retry classes 429/503/529 ×2, 500/502/504 and network ×1, deadline from `turnTimeoutSeconds`. |
| `gemini_conversation.py` body, parse, schema mapping, `coerce` | `gemini.mjs` | `streamGenerateContent?alt=sse` instead of `generateContent`; chunks are merged into one `content.parts` list (adjacent `text` parts concatenated, `functionCall` parts kept whole, `thoughtSignature` kept on its part) and stored verbatim for replay. Token from `google-auth-library` `GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']})`. Project and location from configuration, never from the request. |
| `ASSISTANT_INSTRUCTIONS` | `prompt.mjs` | Same FAST PATHS, COMMON QUESTIONS, signs and definitions; the REPLY FORMAT and Changes sections replaced as in [§4.2](#42-what-changes-from-the-instagram-engine). |
| `assets/conversation-business-rules.md`, `assets/schema-digest.json`, `scripts/build-schema-digest.py` | `services/chat/assets/` (copies), `scripts/chat/build-schema-digest.mjs` | The agent keeps its own copies until it is decommissioned; one change note lists both when the rules change. The digest builder reads the same disposable rebuild as the database CI. |
| `conversation_tools.py` read tools (`data_catalogue`, `read_records`, `sum_field`), `READ_TOOLS`, `call_many` | `tools.mjs` | Same JSON schemas (exact argument keys, `additionalProperties:false`, Vertex uppercase types). `data_catalogue` and `read_records` call `createConversationReadProvider` in process with the Partner as actor (no OIDC, no HTTP). Reads of one round run concurrently, at most 4. |
| `conversation_sql.py` tokenizer guard, cursor, caps | `sql-guard.mjs`, `sql-tool.mjs` | Identical deny lists, 8,000-character limit, one `SELECT`/`WITH`, row cap through a server-side cursor fetching one more than the cap, result and cell caps (R092 lowered the caps to 100 rows and 32 KB; the decommissioned agent's 500 rows and 256 KB no longer apply), `READ ONLY` repeatable-read transaction with `SET LOCAL ROLE mw_chat_read_{env}`, statement timeout 20 s, always rolled back, `current_user` and `current_database()` asserted. The Python tests (`tests/test_conversation_sql.py`, 282 lines) are ported as `tests/unit/chat-sql-guard.test.mjs`. |
| `conversation_sql.py` `payoff()` → `loan_close_calculation_v83` | `sql-tool.mjs` `loanPayoff` | Same function call and eligibility answer. |
| `conversation_grounding.py` (456 lines, pure) | `grounding.mjs` | Rule-for-rule port; `tests/test_conversation_grounding.py` (446 lines) ported as `tests/unit/chat-grounding.test.mjs` with the same vectors. Mode `enforce`, 3 attempts. |
| `conversation_store.py` epochs, `runtime.conversation_messages` | `store.mjs` over `pwa_chat_history` | Same epoch rules: a new epoch when the thread's model, the prompt digest or the tool set changes, or when the last turn's prompt tokens exceed `historyTokenLimit`; the new epoch opens with the seed transcript ([§5.3](#53-functions-security-definer-owner-mw_chat_owner_env-execute-for-mw_chat_api_env-only)). |
| `model_rounds` audit event | columns on `pwa_chat_messages` | No separate audit schema; the two Partners' usage is small. |

Not ported: `api_action`, `verify_operation`, `database_*`, `appsheet_delete`, the Codex and Claude providers, Instagram delivery, email fallback, the wake path.

### 4.2 What changes from the Instagram engine

- **Final reply is text, not a `finish` tool.** A model response with no function call is the reply. The host runs the length check (hard limit 4,000 characters; the prompt aims for about 1,200) and the grounding check on it; a failure goes back to the model as a user message with the rejection text (as `ConfigurationError` text does today), up to 3 grounding attempts, then `GROUNDING_EXCEEDED`. `VERIFIED/CLARIFY/REFUSE` are gone: a clarifying question that needs an earlier figure must re-read it with a tool, which the instructions already require.
- **Reply format for the app** (replaces the Instagram plain-text rules): a Markdown subset — paragraphs, `**bold**`, `- ` bullets, a pipe table for a breakdown with more than three lines, blank lines between blocks; no headings, links, images, code blocks or HTML. Same money (`฿10,600`, no decimals), date (English `21-Oct-2026`, Thai `21-ต.ค.-2569`), time, percent, sign and "As of … Bangkok, live data" rules. Language: the language of the current message, else the Partner's "Language Preference" (passed as `partner_language`). Borrower names follow the reply language (R092, as V105's push rule): an English reply uses `"Borrowers"."Description"` with the Thai name as fallback, a Thai reply `"Borrower Name"` with the English name as fallback, one name per borrower.
- **History is per thread**, not per Instagram binding. The earlier-conversation seed of a new epoch is built from `pwa_chat_messages` (user and committed assistant `text`), newest exchanges within `seedChars`, same header text as `transcript()`.
- **Identity**: the Firebase principal resolved to a Partner at the start of the turn serves every read (R085 rule); it is checked again before the reply is committed. No Instagram opt-in, cutoff or sender check.
- **Tool result sizes**: tool results are journaled in full on `pwa_chat_tool_calls` (256 KB cap each) for the audit trail the Instagram journal has today. From R092 a `sql_query` result is at most 100 rows and 32 KB (the model aggregates in SQL), so the journal cap is no longer reached by that tool.

### 4.3 Tool declarations (read-only release)

`data_catalogue(app, table)`, `read_records(app, table, keys, match_field, match_text, filter, columns, offset, limit)`, `sum_field(observation, field, group_by)`, `sql_query(sql)`, `loan_payoff(loan_id)` — descriptions copied from `conversation_tools.py` with the `api_action`/reviewer wording removed. The registry is a list in `tools.mjs` so the writes batch appends to it.

## 5. Data

Migration `V104__pwa_chat.sql` (next after V103; confirm the head in `database/migrations/` when the batch starts). It follows the V78/V86/V88/V103 conventions: `pwa_` prefix, client UUID v4 ids with the regex CHECK, `REVOKE ALL … FROM PUBLIC`, `COMMENT ON … 'mw-access: …'` boundary tags, immutability triggers raising `55000`, `SECURITY DEFINER` functions with a pinned `search_path` owned by a closed NOLOGIN role, `EXECUTE` revoked from `mw_integration_agent` (PROD default privileges, see the database README). Dictionary records are added with the helper at implementation.

### 5.1 Roles

| Role | Kind | Holds |
| --- | --- | --- |
| `mw_chat_owner_{env}` | closed NOLOGIN | Owns the three tables and the `pwa_chat_*_v1` functions; the only writer. Opened on Cloud SQL with `owner-authority-cli.mjs prepare --owner mw_chat_owner_{env}` around the migration, then `restore`. |
| `mw_chat_api_{env}` | NOLOGIN | `EXECUTE` on `pwa_chat_*_v1` only. The IAM user `mw-credit-app-chat-{env}@clever-oasis-508610-n7.iam` is a member (granted by the operator as for `mw_notify_api_{env}`). |
| `mw_chat_read_{env}` | NOLOGIN | The SQL tool role: `SELECT` on every table and view in `public` and `EXECUTE` on the business functions (the R085 "whole database" decision, as `mw_integration_agent` holds today), minus `SELECT` on `pwa_chat_threads`, `pwa_chat_messages`, `pwa_chat_history`, `pwa_chat_tool_calls` (one Partner's threads are not readable through the other's `sql_query`). The IAM user is a member; the tool runs `SET LOCAL ROLE mw_chat_read_{env}` inside its read-only transaction. Grants are applied by the operator script outside Git like the agent role's, and `Test-AccessMatrix.sql` pins the matrix. |

### 5.2 Tables

```sql
CREATE TABLE public.pwa_chat_threads (
  id uuid PRIMARY KEY,                       -- client UUID v4
  partner_id text NOT NULL,                  -- Partners."Row ID"
  title text NOT NULL CHECK (octet_length(title) BETWEEN 1 AND 480),
  model text NOT NULL CHECK (model ~ '^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_message_at timestamptz,
  message_count integer NOT NULL DEFAULT 0 CHECK (message_count BETWEEN 0 AND 2000)
);
-- editable only through pwa_chat_thread_update_v1 (title, model, status); no DELETE (trigger 55000)

CREATE TABLE public.pwa_chat_messages (
  id uuid PRIMARY KEY,                       -- user: client UUID v4; assistant: server UUID v4
  thread_id uuid NOT NULL REFERENCES public.pwa_chat_threads(id),
  seq integer NOT NULL,                      -- 1.. per thread; UNIQUE (thread_id, seq)
  role text NOT NULL CHECK (role IN ('user','assistant')),
  text text NOT NULL CHECK (octet_length(text) <= 16384),   -- display text (user message or committed reply)
  status text NOT NULL CHECK (status IN ('ok','failed')),
  model text, thinking_level text,
  rounds smallint, attempts smallint, prompt_tokens integer, output_tokens integer, thoughts_tokens integer, cached_tokens integer,
  latency_ms integer, error_code text,
  claimed_at timestamptz,                    -- user rows: when the turn was claimed; cleared by completion
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((role='user') = (model IS NULL))    -- usage columns belong to assistant rows
);
-- append-only: UPDATE allowed only on claimed_at of a user row by the owner function; DELETE/TRUNCATE refused (55000)

CREATE TABLE public.pwa_chat_history (       -- model replay journal (the V8 runtime.conversation_messages pattern)
  thread_id uuid NOT NULL REFERENCES public.pwa_chat_threads(id),
  epoch integer NOT NULL, seq integer NOT NULL,
  message_id uuid NOT NULL REFERENCES public.pwa_chat_messages(id),   -- the user message of the turn
  role text NOT NULL CHECK (role IN ('user','model')),
  content text NOT NULL CHECK (octet_length(content) <= 1048576),      -- exact Gemini content JSON (text, not jsonb: byte-identical replay)
  prompt_sha256 text NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  input_tokens integer,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (thread_id, epoch, seq)
);
-- append-only (55000)

CREATE TABLE public.pwa_chat_tool_calls (
  message_id uuid NOT NULL REFERENCES public.pwa_chat_messages(id),
  call_id text NOT NULL CHECK (octet_length(call_id) BETWEEN 1 AND 256),
  round smallint NOT NULL, name text NOT NULL,
  arguments text NOT NULL CHECK (octet_length(arguments) <= 16384),
  result text CHECK (octet_length(result) <= 262144), error text, ms integer,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (message_id, call_id)
);
-- append-only (55000)
```

Indexes: `(partner_id, status, last_message_at DESC)` on threads; `(thread_id, seq)` is the messages key; `(thread_id, epoch DESC, seq)` is the history key.

### 5.3 Functions (`SECURITY DEFINER`, owner `mw_chat_owner_{env}`, `EXECUTE` for `mw_chat_api_{env}` only)

`actor jsonb` is `{issuer, subject, partnerId, loginEmail}` from `canonicalActor`; every function re-resolves it against `Partners` (unique trimmed lower-case "Login Email" = `partnerId`) as `pwa_notify_actor_v1` does and raises `42501` otherwise.

| Function | Does |
| --- | --- |
| `pwa_chat_models_default_v1(actor)` | Returns the model of the Partner's most recent thread (the "last choice" default), or NULL. |
| `pwa_chat_threads_v1(actor, status text, before timestamptz, lim int)` | One page of the Partner's threads. |
| `pwa_chat_thread_create_v1(actor, thread jsonb)` | Inserts `{id, model, title}`; an existing id of the same Partner returns the row (idempotent); another Partner's id raises `42501`. |
| `pwa_chat_thread_update_v1(actor, id uuid, patch jsonb)` | Title, model, status; bumps `updated_at`. |
| `pwa_chat_messages_v1(actor, thread uuid, before int, lim int)` | One page of messages with usage and the tool summary (`name, count` aggregated from `pwa_chat_tool_calls`). |
| `pwa_chat_turn_begin_v1(actor, thread uuid, message jsonb)` | In one transaction: refuses a thread with a user row claimed less than 5 minutes ago and no assistant row (`turn_in_progress`); inserts the user row `{id, text}` with `seq = message_count + 1` or, for an existing id, returns `{state:'completed', assistant}` when its assistant row exists or re-claims it when the claim is stale; sets `claimed_at`; returns the thread's model, the Partner's language, the latest history epoch rows (`pwa_chat_history`) and, when a new epoch is needed, the seed exchanges. The service decides the epoch from `prompt_sha256` and the token limit, as `converse()` does. |
| `pwa_chat_turn_complete_v1(actor, message_id uuid, assistant jsonb, history jsonb, tool_calls jsonb)` | In one transaction: inserts the assistant row (status `ok` or `failed` with `error_code`), the history rows of a finished turn (none for a failed turn, as today), the tool-call rows, clears `claimed_at`, updates `message_count`, `last_message_at` and, when the thread title is still the placeholder, sets it from the first user message (first 120 characters, first line). |

### 5.4 Cost and monitoring

`monitoring.pwa_chat_recent_questions_v1(n int)` (owner `postgres`, `EXECUTE` for the Grafana reader) returns the last n questions with model and the four token counts, the shape the Cost page's panel 50 reads from the agent database today; the Cost page switched to it in R091. R093 (V108) adds `monitoring.pwa_chat_recent_turns_v1` and `monitoring.pwa_chat_usage_v1` (outcome, rounds, turn time, per-model month usage) for the Cost page, and the chat service's `chat_turn` log feeds log-based metrics for the Now, PWA & APIs and Infrastructure dashboards; see the R093 change note. `project/scripts/monitoring/model-prices.json` gains `gemini-3.5-flash` from the billing export once it has usage.

## 6. PWA

### 6.1 Navigation

- `apps/pwa/src/live/LiveHeader.tsx`: `LiveView` gains `'chat'`; `workspaceViews` gains `{id:'chat',en:'Chat',th:'แชท',icon:'chat',frequent:true}` as its last entry; `liveTitle` returns `t('Chat','แชท')`.
- `apps/pwa/src/Icon.tsx`: new `chat` path (a speech bubble, same 24-unit grid as the other icons).
- `apps/pwa/src/live-main.tsx`: `changeView` and the `view` state accept `'chat'`; `navigation()` shows `chat` whenever `chatEnabled` (the build has `VITE_CHAT_API_ORIGIN`), independent of `businessWorkspace`; the header search button hide-list gains `'chat'`; the render ternary adds `view==='chat' ? <ChatWorkspace access={chatAccess} thai={thai}/>` loaded with `React.lazy` like the Management chunk, inside the existing `Suspense`; `data-workspace="chat"` on `main`.
- `apps/pwa/src/environment.ts`: `chatOriginAllowed(value)` (host `^mw-credit-app-chat-{env}-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$`, https, exact origin); `liveConfiguration` validates `VITE_CHAT_API_ORIGIN` when present and exposes `chatOrigin: string|null`. When absent the menu item is hidden, so Hosting can ship before or after the service and a rollback is one build variable.
- `apps/pwa/src/read-cache.ts` `allowed()`: the chat origin and `GET /api/chat/(models|threads)` paths are cacheable reads (last opened thread and the list show offline, read-only); turn POSTs go through `fetch` directly.
- Bottom bar: five `flex:1` buttons fit the existing `.live-bottom-nav` rules; Echo checks the 320 px width in Thai (the longest labels) and the 1051 px sidebar.

### 6.2 Screen

Files under `apps/pwa/src/chat/`: `ChatWorkspace.tsx` (state, turn driver), `ChatThreads.tsx` (list sheet/pane), `ChatMessage.tsx` (one message, markdown subset), `ChatComposer.tsx`, `chat-client.ts` (fetch, SSE reader, outcome polling), `markdown.ts` (renderer), `chat.css` (imported by `live-style.css`).

Mobile (≤ 1050 px):

```
┌ app header: ☰  Chat · <thread title>   ⟳ ┐    (shared header; refresh reloads the thread)
├ chat toolbar ────────────────────────────┤
│ [≡ Threads]            [Model: Gemini 4 Argon ▾] │
├──────────────────────────────────────────┤
│ (assistant) …                            │  scrolling message list, newest at the bottom
│                         (you) … ▶        │
│ (assistant, provisional) … · checking figures │
│ Checked: database (2 queries), loan payoff│  sources line under a committed reply
├──────────────────────────────────────────┤
│ [ Ask about loans, payments, cash…    ][➤]│  composer, sticks above the bottom bar
├──────────────────────────────────────────┤
│ Dashboard │ Collection │ Payments │ Borrowers │ Chat │
└──────────────────────────────────────────┘
```

Desktop (≥ 1051 px): the thread list is a left pane (280 px) beside the conversation; the toolbar keeps only the model picker and a "New chat" button; Enter sends, Shift+Enter inserts a line break.

- **Threads**: "New chat" first, then threads newest first, each with title, model label and relative time; long-press or a ⋯ button offers Rename and Archive; an "Archived" toggle shows archived threads (read-only until unarchived). Opening a thread loads the last 50 messages and lets the user load earlier ones.
- **Messages**: user right-aligned, assistant left; assistant text rendered by `markdown.ts` (paragraphs, `**bold**`, `- ` bullets, pipe tables, line breaks; everything else is shown as plain text; no HTML injection path, the renderer builds elements, never `innerHTML`). Amounts arrive formatted by the model under the prompt rules; the UI does not reformat them. A failed assistant message shows the localized reason and a "Retry" that re-sends the same user text as a new message id.
- **Composer**: textarea, 1 to 4,000 characters with a counter past 3,500; disabled while a turn is in flight or offline (the existing offline notice explains); the draft is kept per thread in component state only.
- **Model picker**: a `<select>` with the models from `/api/chat/models`; unavailable models are listed disabled with their reason; a change calls `PATCH` (optimistic, reverted on failure) and shows a one-line note "Applies to your next message".
- **Empty thread**: short welcome and three example questions as buttons that fill the composer: EN "What is due today?", "Payoff for <borrower> today?", "Profit this month"; TH "วันนี้มีอะไรครบกำหนดบ้าง", "ปิดยอดของ <ผู้กู้> วันนี้เท่าไร", "กำไรเดือนนี้".
- **Progress**: under the last user message, a status row "Round n · checking Loans, Payments…" from the `round` and `tool` events, then provisional text, then the committed reply.
- **Access and errors**: 401 and 403 go through `access.authFailure` (existing expired/denied cards); 503 or network: "The assistant is unavailable. Try again."; `MODEL_UNAVAILABLE`: "This model is unavailable right now. Choose another model."; `TURN_TIMEOUT`: "The question took too long. Ask a narrower question."
- **Refresh**: `useContextRefresh(visible, t('Refresh chat','รีเฟรชแชท'), reload)` and `useAppUpdateBlock(turnInFlight)` so an app update waits for the reply.

### 6.3 Client

`chat-client.ts`: `fetch` with `Authorization`, `Accept: text/event-stream`, `cache:'no-store'`, `credentials:'omit'`, `redirect:'error'`; the body is read through `ReadableStream` and parsed line by line (`event:`/`data:`; `EventSource` cannot send the token). A stream that ends without `done` switches to `GET …/messages/:id` polling. All ids are `crypto.randomUUID()`.

## 7. Prompt and assets

`services/chat/prompt.mjs` exports `instructions(partnerLanguage)` built from the ported sections; `services/chat/assets/conversation-business-rules.md` and `schema-digest.json` are read once and cached, and their SHA-256 enters `prompt_sha256` with the model, the system text and the tool declarations (a change starts a new epoch, as today). The digest builder `scripts/chat/build-schema-digest.mjs` runs against the disposable rebuild the database CI makes, and `tests/unit/chat-schema-digest.test.mjs` fails when the committed digest is older than the migration head.

## 8. Infrastructure

Forge owns this section; the DEV stack first, PROD gated.

- `infrastructure/dev/chat-service.tf`: `variable "chat_image"` (same digest validation as `command_image`), `google_service_account.chat_runtime` (`mw-credit-app-chat-dev`), `google_sql_user` IAM user on `mw-credit-pg-20261017`, `google_project_iam_member` for `roles/cloudsql.client`, `roles/aiplatform.user` and the custom `read_auth_user` role, `google_secret_manager_secret_iam_member` on `capability_policy`, `google_cloud_run_v2_service.chat_api` (`mw-credit-app-chat-dev`, `INGRESS_TRAFFIC_ALL`, `invoker_iam_disabled`, timeout `300s`, concurrency 10, min 0, max 2, CPU 1 / 512Mi, `startup_cpu_boost`, env = `local.business_env` + `FOUNDATION_ROLE=chat`, `DB_USER`, `RUNTIME_SERVICE_ACCOUNT`, `CHAT_MODELS_JSON = jsonencode(var.chat_models)` + the `DEV_CAPABILITY_POLICY_JSON` secret ref), output `chat_api_url`. `variable "chat_models"` holds the object of [§3.2](#32-configuration) with validation. Test `tests/chat-service.tftest.hcl` (mocked: identity, role bindings, timeout, env keys, no VPC access, no receipt or agent variables).
- `infrastructure/production/`: the same behind a default-off `chat_authorized` variable (the PROD README gate convention), added to `README.md` and `READINESS_INVENTORY.md`; the image comes from `mw-credit-app-prod/api`.
- Vertex AI: `aiplatform.googleapis.com` is already enabled (DEV stack owns APIs). No `generativelanguage` API, no key.
- Hosting: `scripts/hosting-headers.mjs` ORIGINS gains the chat URL per mode; `firebase.json` mirrors DEV; `connect-src` therefore lists three Cloud Run origins. `scripts/production/build-business-candidate.mjs` and `tests/unit/production-build-environment.test.mjs` carry `VITE_CHAT_API_ORIGIN` the way they carry `VITE_COMMAND_API_ORIGIN`.
- Image: no new image name; the chat service runs the existing API image with a different entry file, so Cloud Build is unchanged and the promotion pins one digest for five services.
- Environment Inventory gains a row per environment for the chat service (revision, image, identity, `CHAT_MODELS_JSON` summary) once deployed.

## 9. Phase 0: stop the Instagram conversation

Owner decision 4, done at implementation start by the orchestrator or Forge over the documented SSH/IAP route, recorded in the batch's change note and in the Environment Inventory row "Partner conversation provider (R084)":

1. Back up `/etc/mw-integration-agent/config.json` to a dated root-only copy (the R085 practice).
2. Set `partner_conversations_enabled: false`; keep `conversation_provider`, the SQL switch and the timers as they are (they no-op without the switch; nothing else is removed until phase 3).
3. Run the agent's configuration check and restart `mw-partner-conversation.service` units per [OPERATIONS.md](https://github.com/welct0407/MW-Credit-App/blob/feca47b2849dbdc881ac881cb58ce7ff91862c9f/integration-agent/docs/OPERATIONS.md#partner-conversation-provider-activation-and-rollback); confirm `/ready`.
4. Tell the other Partner that questions move to the app; Instagram messages get no automatic reply from this point (no auto-reply is built).

Rollback of phase 0 is restoring the backed-up config and restarting.

## 10. Test plan (compact, for Chase)

Unit (`npm test`, `node:test`):
- `chat-config.test.mjs`: `CHAT_MODELS_JSON` accepted and refused cases; `loadBusinessConfig` role `chat` refuses receipts, notifications, agent variables and the wrong identities.
- `chat-sql-guard.test.mjs`, `chat-grounding.test.mjs`: the ported Python vectors, all passing.
- `chat-engine.test.mjs` with a fake Vertex transport: one-round text reply; tool round with two concurrent reads; `FINISH`/`ROUND` nudges; grounding rejection then success; three rejections → `GROUNDING_EXCEEDED`; 429 retried twice then `MODEL_UNAVAILABLE`; deadline → `TURN_TIMEOUT`; epoch restart on model change and on token limit; streaming chunk merge keeps `thoughtSignature`.
- `chat-handler.test.mjs`: every route's 400/401/403/404/409; idempotent thread create and message re-POST; SSE event order; `?stream=0` shape; other Partner's ids → 404; CORS preflight.
- `chat-schema-digest.test.mjs`: digest freshness.

Database (`scripts/database/Test-CI.ps1` groups and the Linux route): `Test-Chat.sql` for the four tables (append-only triggers, idempotent turn begin, stale-claim re-claim, title from first message, `message_count` cap), `Test-AccessMatrix.sql` for the three roles (api role cannot read tables directly; read role cannot see `pwa_chat_*`; owner function `EXECUTE` revoked from `mw_integration_agent`), `Test-ProdDefaultPrivileges.sql` replay, `public-functions.sql` regenerated.

Playwright (`tests/e2e/chat.spec.ts`, Desktop Chrome and Pixel 7, stubbed chat origin): fifth bottom item present and last; Chat hidden when `VITE_CHAT_API_ORIGIN` is absent; new thread → send → `round`/`tool`/`delta`/`message` rendered in order with the provisional style then committed; `retract` clears provisional text; model switch calls PATCH and the badge updates; offline composer disabled; dropped stream → polling → reply shown; access denied card on 403. Update `phase5-final-ui-independent.spec.ts` lines 147, 148, 152 and 153 (five labels ending with `Chat`, count 5, drawer without the five).

Terraform: `terraform fmt -check`, `validate`, `test` for `infrastructure/dev` and `infrastructure/production` in the `Development checks` run.

DEV end to end (one pass, after the DEV deploy): the three models answer the three example questions on synthetic DEV data with a committed reply, `usage` filled and tool-call rows present; one ungrounded case forced through a test prompt shows the retract/retry path; the Cost function returns the rows.

## 11. Delivery waves and owners

| Wave | Worker | Scope (one writer per path) |
| --- | --- | --- |
| 1 | Forge | `infrastructure/dev/chat-service.tf` and test, PROD gated stack, hosting headers and `firebase.json`, build env plumbing, the `gemini-3.5-flash` live check, phase 0 on the VM. |
| 1 | Byte | `services/chat/**`, `business-config.mjs` role `chat`, `business-runtime.mjs` branch, `budget.mjs`, `V104__pwa_chat.sql`, `scripts/chat/build-schema-digest.mjs`, unit and SQL tests. |
| 1 | Archie | Reviews the ported prompt and grounding against R085/R088 behaviour, resolves open items in the change note, confirms the test plan. |
| 2 | Byte | `apps/pwa/src/chat/**`, `LiveHeader.tsx`, `Icon.tsx`, `live-main.tsx`, `environment.ts`, `read-cache.ts`, `chat.css`, e2e spec and the four assertions. |
| 2 | Echo | Review of the chat flow at 320 px (EN/TH), Pixel 7 and 1440 px: bottom bar with five items, thread sheet, provisional text contrast, composer above the bar, picker labels. Coded findings, one pass. |
| 3 | Chase | Adversarial review of the diff against this document and the test plan; runs only what Byte cannot supply; checks the change note's tables. |
| 3 | Dewey | Change note (template), Solution Design current state, Data Dictionary records for the four tables and functions, Environment Inventory rows, Release Tracker R090, Development Changes, `database/README.md` current state, `docs/Development.md` service list, the agent docs' note that the conversation is stopped (phase 0). |

One push per verified batch; the pull request's `Development checks` run is the broad run; DEV deploy after it passes; owner review on `dev-lm.mw-credit.com`.

## 12. Phase 3: decommission checklist

After the owner's PROD test. A separate change note under `integration-agent/Change Logs/` with the root note; scoped owner authorization for the removals; agent catalogue revision bump.

Remove (conversation-only pieces):
- systemd `mw-partner-conversation.service/.timer` and `mw-conversation-wake.path`; the `partner-conversation-cycle` CLI; `partner_conversation.py`, `conversation_session.py`, `gemini_conversation.py`, `claude_conversation.py`, `codex_conversation.py`, `conversation_tools.py`, `conversation_sql.py`, `conversation_grounding.py`, `conversation_store.py`, `conversation_write.py`, `conversation_dml.py`, `conversation_api.py`, `conversation_schema.py`, their tests and assets; config keys `partner_conversations_enabled`, `conversation_writes_enabled`, `reviewer_dml_enabled`, `conversation_provider`, `conversation_sql_read_enabled`, `conversation_grounding`, `partner_conversation_cutoff`, `gemini_conversation_*`, `claude_*`, `codex_home`.
- Catalogue entries `persistent_codex_conversation`, `gemini_partner_conversation`, `claude_partner_conversation`, `conversation_sql_read`, `operational_data_api`, `reviewer_database_dml` (keep `instagram_delivery`, `conversation_poll`, `partner_authentication` for receipts, review and the cash statement).
- Cloud Run `/internal/agent/(catalogue|query|commands)` routes: `services/agent-conversations/handler.mjs`, `policy.mjs`, `runtime.mjs`, `command-provider.mjs` (keep `read-provider.mjs`, `catalogue.mjs`, `defaults.mjs`, `query-filter.mjs`, `relationships.mjs`, `virtuals.mjs`, `command-metadata.mjs`, which the chat tools use); Terraform `agent_conversation_api` variables, the `mw-credit-app-{env}-agent-conversation-policy` secret containers and accessors; the `AGENT_CONVERSATION_*` variables.
- Database: `pwa_submit_agent_operation_v1` (V90) by a new migration (expand/contract: after no caller remains); the R085 widened grants of `mw_integration_agent` (operator script, record the before and after), `monitoring.recent_questions_v1` in `mw_agent` (agent migration V11) and the Grafana datasource `mw-agent-questions` plus PDC when the Cost page reads `monitoring.pwa_chat_recent_questions_v1` instead.
- Monitoring: Cost page rows 49 and 50 re-pointed; `mw-agent` dashboard conversation panels removed; the `model_rounds` alert or panel references.
- Documents: `integration-agent/docs/PARTNER_CONVERSATIONS.md` (delete; keep the business rules reference in `services/chat/assets/`), `OPERATIONS.md` provider section, `POSTGRESQL_OPERATIONS.md` V8 note, `SERVICE_CATALOGUE.md`, `integration-agent/README.md` current state, `Solution_Design.md`, `Environment_Inventory.md` rows 87 onward, the Data Dictionary system guide for the agent.

Keep: the webhook receiver, `instagram.py` delivery, the receipt cycle, the receipt recognizer on `10.148.0.2:8790` with its Vertex role, the email fallback, the audit relay, retention and the Cloud SQL proxy.

## 13. Later batch: writes

When the owner opens it: the write tools `api_action` and `verify_operation` are ported from `conversation_write.py` onto the existing command contracts (`services/agent-conversations/command-provider.mjs` logic in process, the actor being the signed-in Partner who holds `command`), the reviewer check becomes `Partners."AI Reviewer"` as today, a write needs the Partner's explicit instruction in the current message, and the UI shows a confirmation card before the turn may call a write tool (the model proposes, the Partner confirms, the tool runs). The reviewer DML tools are not ported; a demonstrated API gap gets a native command instead.

## 14. Implementation notes and open items (not owner decisions)

- Forge: confirm `gemini-3.5-flash` on `global` (200, function calling, `thinkingLevel` accepted). If only `thinkingBudget` is accepted on that model, add a per-model `thinking` field to the configuration rather than special-casing the engine.
- Byte: `google-auth-library` is already a dependency; no AI SDK is added. SSE parsing on both sides is hand-written (about 40 lines each).
- Byte: the `read_records` provider runs on the command pool with a 9 s statement budget; the chat service uses the same `statementTimeoutSql('command')` for RPCs and `20s` for `sql_query`.
- Archie: the seed transcript uses committed replies only; failed turns appear as "Notice" lines as today.
- Dewey: this file stays while a current document links it (Release Tracker R090 and Development Changes do); at R090 closure it is pruned or kept per the retention rule.
