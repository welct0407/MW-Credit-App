# Shared Instagram account: collection relevance — 2026-09-09

Status: Implemented and running; user acceptance pending.

## Requested behavior and implementation

The human uses the same account for ordinary conversations. Manual outbound messages no longer create automatic human_hold flags. Unknown sends remain guarded by outbox status independently. Known decorative GIF/sticker/emoji-only inbound events are retained as IGNORED_SOCIAL without entering AI work; captions and quoted replies remain actionable, and unknown image URLs are never discarded as decorative.

The structured classifier now explicitly returns collection_relevant. New social content is ignored regardless of old open cases. Nonfinancial images are classified as irrelevant; possible unreadable receipts remain subject to review. General chat acknowledgments are removed. Relevant receipts, promises and collection questions retain the normal workflows. Responses to collection questions are suppressed when a manual outbound follows the target inbound. A 900-second configurable manual_chat_quiet_seconds interval defers scheduled messages during recent human activity, without pausing fees/payments or creating review requests.

No AppSheet schema/configuration or financial record changed. Typing in chat alone does not edit financial terms in the app. Existing financial exceptions are not dismissed by this policy.

## Changed files

collection-agent/agent/chat_relevance.py (new), store.py, ai_job.py, event_worker.py, reply.py, portfolio.py; decision.schema.json; tests/test_agent.py, test_worker.py, test_integration.py, test_review_language.py; PORTFOLIO.md and REVIEWERS.md. Runtime config records the reminder quiet interval. Local chat_policy_migrations audits removal of legacy manual-chat flags (0 flags needed removal in this deployment).

## Rollback

Before-change agent/config/schema/runbook copies: collection-agent/local/before-chat-relevance-20260909/. Temporarily disable processing, restore those files and restart installed worker/receiver before restoring processing state. Preserve current databases, payment/outbox audit evidence and subsequent events. No AppSheet/Looker version rollback is applicable.

## Validation

36 Python tests passed, including no-hold manual chat, social-result no-send/no-case, GIF-host boundary, preservation of receipt images and captions, direct review replies, receipt/fee/dispatch checks. The former general-ack send test now exercises a payment-promise reply instead. Live configured Codex classifier returned GENERAL_REPLY, collection_relevant=false, requires_human=false, requires_reply=false for synthetic casual conversation with an old held receipt. No messages or financial writes were made for this classifier check.

Installed worker and receiver restarted at 01:10:28 Bangkok, both Running, health HTTP 200. Processing restored. One runtime script invocation used the wrong working directory and failed imports before changing state; rerun from collection-agent completed successfully.

## Manual acceptance and limits

Send GIFs/casual conversation and verify there is no agent reply or review. Then send a real collection question, promise or receipt and verify normal handling. While the human replies in the same chat, verify the agent does not duplicate the reply; scheduled messages defer for 15 minutes after manual activity. Arbitrary nonfinancial images still require an initial classification, while recognized decorative messages skip it. Genuine financial ambiguities, duplicate receipts, uncertain API sends and actual payment disputes remain protected.
