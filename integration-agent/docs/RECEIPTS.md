# Current receipt evidence — 27 September 2026

The [receipt evidence implementation](RECEIPT_EVIDENCE.md) supersedes terminal-image deletion and SQLite deployment descriptions below for newly archive-enabled jobs. Production state uses `mw_agent`; normal current receipt posting/review policy is owned by [the service catalogue](../SERVICE_CATALOGUE.md) and [Partner review](PARTNER_REVIEW.md). Earlier summary-only/manual-only descriptions below are dated implementation history, not current posting policy. Original archive and metadata projection do not expand posting or messaging authority.

# Current review behavior — 21 September 2026

Owner correction: receipt currency defaults to THB when no currency is printed. Explicit non-THB and unreadable amount have separate review reasons. Current charge comparison sums same-day unpaid charges across loans; request text uses the AppSheet Loan Key. The shared receipt-reconsider command supports explicit correction of unexecuted cases while preserving earlier evidence and invalidating old proposals.

New validated receipts enter [Partner review](PARTNER_REVIEW.md). Ordinary payments require an exact linked approval; loan closures and overpayments are manual-only. This supersedes the earlier summary-only and pending-posting descriptions below, which describe the previous implementation. Shared extraction, receipt validation and duplicate checks remain applicable.

# Incoming payment receipt summaries

Owner scope, 21 September 2026: restore receipt handling using the retired MW AI Collection implementation as a reference. The owner promoted AppSheet R011 / PostgreSQL V29 and populated Cash Accounts Alternative Account Number before authorizing this implementation. Run on the current Linux webhook owner only. Do not start either retired Windows runtime.

## Processing

1. Signed Instagram messages are durably captured before HTTP acknowledgement. Image attachment URLs are retained in the private ingress database. Text, audio, video, shares and other non-image content receive no business action or reply.
2. `receipt-cycle` processes only events with both event time and capture time at/after the immutable activation cutoff. A SQLite cursor handles bounded batches, and a process lock allows one worker. Delayed retries from before activation are excluded.
3. Match the signed sender ID to the current account's conversation/group participant ID. Use that participant's Instagram username to match Borrowers.Instagram Username, requiring exactly one AI Collection Enabled=true borrower. The owner authorized this existing conversation-to-master binding on 21 September; no profile endpoint or extra profile consent is required. Conflicting IDs/usernames and incomplete pagination fail closed. Disabled or ambiguous mappings receive no image extraction or email.
4. Download only approved HTTPS Meta CDN image URLs, with bounded redirects, image bytes and pixels. Codex sees the sanitized image and a fixed extraction prompt, never database credentials, borrower masters, account numbers to guess from, or delivery addresses. User configuration/rules, shell, subagents, web search, local image tools and apps are disabled. Output is schema constrained; the host independently validates extracted data. Image instructions have no authority.
5. Require a successful bank/PromptPay receipt, positive THB amount to two decimal places, readable transaction reference, and Bangkok date today or yesterday with a readable transfer time. Convert Buddhist dates during extraction. The same destination can match either Cash Accounts Account Number or Alternative Account Number; the displayed bank name does not split Lisa's combined account or Dad's bank/PromptPay mapping. Only Active accounts match. Masks require equal total length, at least four visible digits, and one unique Cash Account across all candidates. Unknown/ambiguous/truncated numbers fail closed.
6. Reject bank references already in Payments or this agent's accepted receipts. Canonical image pixels also detect exact-image reuse independent of file metadata. Journal uniqueness is global across borrowers, messages and restarts. This is basic duplicate validation, not bank authenticity verification or a guarantee against a modified fraudulent slip.
7. Reserve receipt duplicate keys, then durable Partner notices. All Partner notifications start with Instagram in the Partner's Language Preference. Reuse unique Partner IG mapping, opt-in and signed-ingress messaging-window checks. Unavailable or uncertain Instagram delivery falls back to that Partner's current Email. No receipt image or full account number is included. Successful IG delivery suppresses email.
8. Re-read Partner delivery settings before dispatch. Changed settings hold the notice for review. Commit UNKNOWN before every provider call. Unknown IG never retries; it can use email fallback. Unknown email never retries. Definitely rejected email retries after five minutes, at most three attempts. The shared OAuth refresh lock remains. Legacy direct-email outbox entries are superseded only if definitely unsent; SENT/UNKNOWN history remains unchanged. The new notification cutoff excludes historical summary replay.

The current notice says a payment **receipt** was received and explicitly says the payment has not been recorded. It includes Borrower, amount, receiving Cash Account and receipt date/time to the minute. `partner_notice.py` also defines a localized **Payment processed** template with a payment ID, reserved for a future verified posting caller. No AppSheet mutation or durable PostgreSQL DML exists in this path yet. The owner authorized one real loan-close test, but its reusable posting/readback service is still pending; do not claim it has executed. Neither notice replies to the borrower/group.

## Standard operator preparation

Use `mw-integration-agent receipt-prepare --config ... --catalogue ... --borrower-id ... --date YYYY-MM-DD [--message-id ...]`. It selects one borrower image from official Instagram history, resolves the same conversation identity, and reuses the webhook extractor/account/date/duplicate validation. Ambiguous selection stops. Candidate evidence is private under `state/receipt-candidates/`; it is not forged as a webhook capture and does not create a payment or send a notice. No borrower-specific program or special allocation shortcut is maintained.

Invalid receipts and exhausted processing retries remain in private REVIEW state, without notifying borrowers or claiming a received bank credit. Nonreceipts and disabled/unmapped borrowers are IGNORED. Operator inspection is required for REVIEW/UNKNOWN and exhausted REJECTED cases; there is no automatic exception email channel. Image blobs are removed at terminal processing; validation metadata and delivery/dedup records are retained. Ingress URLs are private, signed references and must never be exported to source control.

## Installation and activation

Use `scripts/deploy-runtime.py` on the verified VM as root ([Operations](OPERATIONS.md#deploying-a-reviewed-commit)). Its `freeze` step backs up the installed package, config/catalogue and units under `/var/lib/mw-integration-agent/rollback`; timers are paused only during package installation and resumed after the receiver is verified. The one-off receipt-summary deploy script (SQLite era) is retired.

Sign in as mwagent with `CODEX_HOME=/var/lib/mw-integration-agent/codex-runtime` using `codex login --device-auth`; do not copy old Windows credentials. This private directory is mode 0700. Run `scripts/verify-receipt-extraction.py` as mwagent for an actual model extraction against a synthetic image and alias through the cycle's configured provider; it sends no mail and writes no payment. `--time codex,gemini` instead times a real run per provider on six synthetic slips and prints per-slip results (see [Receipt recognition API](#receipt-recognition-api)). The receipt timer and cutoff are already active; the one-off activation script is retired. Never reset the cutoff or automatically replay older captures.

Inspect `systemctl status mw-receipt-summary.timer mw-receipt-summary.service` and `journalctl -u mw-receipt-summary.service --since today`. The command reports status counts only. Private journals are `/var/lib/mw-integration-agent/state/instagram-ingress.db` and `receipt-processing.db`; summaries do not print message contents, account numbers or addresses. The existing daily statement and retry timers remain owned by their current service.

## Recovery

Stop/disable `mw-receipt-summary.timer`, wait for its current service to finish, and set `receipt_summary_enabled=false` to halt this scope. Retain receipt-processing.db: never restore an older ledger over email effects. The additive ingress column is backward-compatible because the backup includes the former installed code; before running that old code, note it used positional INSERTs, so prefer the patched ingress with processing disabled. A full package rollback must preserve the updated `journal.py` or remove the attachments column only after backing it up and stopping ingress. Do not replay uncertain emails. Restore old code/config only from the recorded private snapshot, reconcile the SQLite compatibility point, and restart the receiver. Cash statement activation flags and timers must stay as recorded.

## Verification status

Installed and active from 2026-09-21 02:50:41 Bangkok. The cutoff is `2026-09-20T19:50:41.429637+00:00`. All 42 Linux tests pass, including receipt rules, authorization, prior Payments references, webhook and image deduplication, transactional restart recovery, unknown sends, bounded definite retries, shared bilingual mail, URL restrictions, and additive ingress migration. Actual synthetic Codex extraction passed both directly and under the production service restrictions. Signed loopback ingress rejected an invalid signature, captured one image reference despite duplicate delivery, and excluded the pre-cutoff test from processing. Both private journals passed integrity checks. The first authentic eligible borrower receipt and actual Partner email review remain outstanding. See the [change log](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_SUMMARIES_2026-09-21.md).

Codex interface reference: [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) and [configuration controls](https://learn.chatgpt.com/docs/config-file/config-reference). Meta media host handling also follows the inspected legacy `collection-agent/agent/media.py`; direct Meta webhook documentation was rate-limited during this change.

## Existing transaction time fields — R013

The owner chose existing fields, without new audit columns. Extraction preserves the printed Bangkok transfer time, including seconds when present; missing/invalid time goes to REVIEW. Summary metadata prepares `Payment Date` and `Created At` for a future Payments write, but this service remains summary-only. The AppSheet repository R013/V30 copies Payments.Created At into new system-payment Cash Ledger.Created At, with current-time fallback for older clients that supply no timestamp. Its existing statement Sort Timestamp/Statement Time then carry that value to OLTP and the 00:15 image. R013 is deployed to production. Existing payments and accepted receipt journals are not backfilled.

Scheduled [conversation API intake](CONVERSATION_POLL.md) also feeds these same receipt jobs, with a separate cutoff and shared message/attachment IDs. It does not create signed webhook events or refresh Partner messaging windows.

Manual-payment guard: `payment_match.py` reads current Payments after image extraction and again before queuing or dispatching a receipt notice. A Posted payment matching borrower, amount, account and date, with either matching bank reference or matching receipt minute, stops as already recorded. Same borrower/date/amount with uncertain details, multiple candidates or unfinished posting stops for review. Missing reference or a different manually entered time never permits an automatic duplicate attempt. The shared operator preparation command uses the same guard. Future financial posting must apply it again immediately before dispatch and reconcile uncertain writes; current code still performs no financial writes.

## Optional notifications and processing health — 2 October 2026

Intake, validation and financial processing run before the optional result-delivery phase. Notification exceptions appear in `notification_failures`; processing failures remain in `failures` and retain the nonzero service exit. At most two eligible notices are dispatched per cycle, ordered by retry timestamp and ID. Unexpected recipient preparation/delivery errors defer that notice for five minutes so another queued notice can progress. The shared OAuth credential lock is nonblocking: contention is definitely unsent and follows the existing at-most-three, five-minute email retries. Unknown provider acceptance never automatically retries.

A master-read failure before processing one image now records a five-minute backoff without spending extraction attempts or discarding source evidence, allowing the next image to proceed on the next scheduled cycle. Existing archive, identity, freshness, duplicate and reviewer checks remain authoritative. Missing review delivery cannot authorize a payment; informational email cannot approve it.

`failed_notifications` retains its unresolved result count, including historical failures. `notification_status` is 2 when that count is nonzero. Processing `status` excludes only that optional-result count; stalled receipts, undelivered required reviews, unnotified holds, overdue reviews and uncertain postings remain degraded. This is a health classification change, not acknowledgement, deletion, successful-delivery marking or replay of a failed notification. Retain the original row and audit history when investigating an incident.


### Operator acknowledgement of exhausted optional confirmations

`scripts/acknowledge-receipt-notices.py inspect --config <existing-service-config> --notice-id <exact-id>` emits a bounded, read-only plan containing row digests and status metadata. Run under the existing service identity only with explicit operational authorization. Store the plan privately; no payload or credential output. `acknowledge --config ... --plan-file ... --operator ... --reason ... --authorization ...` rechecks and locks the exact rows before atomically appending an operator RECONCILE operation and `optional_notification_acknowledged` event per notice.

The command accepts only POSTED-result notices whose review still proves a payment ID, IG is UNAVAILABLE without an accepted message ID, and email is REJECTED after exactly three attempts. At most ten unique exact IDs; stale observations or changed state reject the whole transaction. Repeating the same reviewed acknowledgement is idempotent. Required review requests, UNKNOWN delivery/posting and successful notices are refused. Original notice fields, payment/review state and earlier failed audit operations remain unchanged. Acknowledgement is `ACKNOWLEDGED_UNDELIVERED`, never successful delivery, and does not reset `failed_notifications` or schedule a resend. If commit acknowledgement is lost, inspect the deterministic acknowledgement operation/event before doing anything further.

## Receipt recognition API

Source, 18 October 2026 (catalogue revision 29); implemented, not enabled. The command services' payment receiving page sends an uploaded slip here for a suggestion; the agent's Instagram receipt cycle uses the same extraction module.

**Providers.** `receipt_image.py` keeps the shared prompt, JSON schema, image canonicalisation and host-side shape check (exactly the schema keys and types). `receipt_provider_codex.py` is the existing isolated `codex exec` call (model reported as `default`). `receipt_provider_gemini.py` makes one Vertex AI `generateContent` call: canonical PNG inline, the shared prompt, temperature 0, JSON response mode with the schema in Vertex's dialect, the least thinking the model allows (Gemini 3 and later: `thinkingLevel` `LOW`; Gemini 2.x Flash and Flash-Lite: `thinkingBudget` 0; Gemini 2.x Pro: none), 12 s per attempt and one retry on 429, 5xx, timeout or connection error, only while at least 4 s of the request remain. It signs in with the VM service account's access token from the metadata server; there is no API key. `gemini_model` must be a fixed version: a stable GA id such as `gemini-3.8-flash` or a suffixed one such as `gemini-2.0-flash-001`; ids containing `latest`, `preview` or `exp` are rejected. `gemini_location` is a Vertex region or `global`. The owner chose `gemini-3.8-flash` (GA 2 September 2026), which Vertex serves only from `global`, `us` and `eu`, not `asia-southeast1`; the configuration uses `global` (host `aiplatform.googleapis.com`).

| Setting | Meaning |
| --- | --- |
| `receipt_extraction_provider` | Instagram receipt cycle provider, `codex` (default) or `gemini`. Changing it is its own owner authorization. |
| `receipt_recognition_enabled` | Recognizer switch; the catalogue entry `receipt_recognition_api` must also be enabled. Both are read per request. |
| `receipt_recognition_provider` | Recognizer provider, `gemini` (default) or `codex`. |
| `receipt_recognition_listen_host`, `_listen_port` | The VM's private VPC IPv4 address (never loopback, wildcard or public) and port: `10.148.0.2`, `8790`. |
| `receipt_recognition_audience` | The recognizer URL the callers use as ID-token audience, pinned in Terraform: `http://10.148.0.2:8790/v1/receipt-recognition`. |
| `receipt_recognition_callers` | One to four `{email, subject}` service-account identities: `mw-credit-app-command-dev` and `mw-credit-app-command-prod`. Subjects are the accounts' numeric unique ids (`103101724082491419570` DEV, `101534018806498664588` PROD). |
| `gemini_project`, `gemini_location`, `gemini_model` | Vertex AI target and pinned model: `clever-oasis-508610-n7`, `global`, `gemini-3.8-flash`. |

Enabling requires the PostgreSQL audit backend. The service needs Vertex AI enabled with `roles/aiplatform.user` on the VM identity, direct VPC egress from the command services and a firewall rule to the VM's service account on the port (infrastructure stage).

**Contract.** `POST /v1/receipt-recognition` with `Authorization: Bearer <Google ID token>`, `Content-Type: image/png` or `image/jpeg`, `X-Content-SHA256: <64 lowercase hex of the body>` and the raw image (at most 5,242,880 bytes). The token must be RS256-signed by Google with issuer `https://accounts.google.com` (or `accounts.google.com`), the configured audience, verified email and the exact email and numeric subject of an allowed caller.

| Status | Body |
| --- | --- |
| 200 | `{"status":"recognized","provider","model","durationMs","imageSha256","result":{...schema fields}}`; shape checked, not business validated |
| 400 | `{"status":"rejected","reason":"invalid_image\|hash_mismatch\|unsupported_type"}` |
| 401 / 403 | `{"status":"denied"}` (missing or invalid token / caller not allowed) |
| 413 | `{"status":"rejected","reason":"too_large"}` (refused before the body is read) |
| 503 | `{"status":"unavailable","reason":"disabled\|busy\|timeout\|provider_error"}` |

`GET /healthz` returns `{"status":"ok","enabled":bool}` without a token and calls no provider. At most two extractions run at once; a third request gets `busy`, and a slot is freed only when its extraction really ends. Each request is bounded to 18 s (the provider stops at 17 s), under the PWA client limit (20 s) and the command route timeout (25 s). Recognition is stateless: the image is canonicalised in memory and never stored, no business database is read and account matching stays with the command API. Each authenticated request writes one audit operation `receipt_recognition_api` (caller email, image SHA-256, provider, model, duration, outcome) on audit route `internal` for either provider (the provider is in the plan); a result whose audit row cannot be written is withheld (503). The journal gets one line per request without image, token or result fields.

**Rollout.** Catalogue revision 29 needs the same two-step route as revision 28: `deploy-runtime.py` refuses a live catalogue whose revision or service names differ from the repository, and the installed validator rejects the unknown name `receipt_recognition_api`. First install code that knows the name while the live catalogue stays at revision 28, then add the key (disabled) by the config-only route; the owner chooses the exact route at activation.

**Recovery.** Set `receipt_recognition_enabled=false` or disable the catalogue entry (effective on the next request), then `systemctl disable --now mw-receipt-recognition.service`. Callers treat any failure as "recognition unavailable" and the form continues manually.
