# Contained MCP RPC diagnostics — 3 October 2026

Diagnostic-only revision `mw-grafana-events-00007-4zn` is Ready at 100% traffic. The browser can now Refresh tools. This deployment closes an observation gap; it does not claim to fix the host's No tools available result.

## Change and verification

Runtime source pin: `8056710464bbc68a4ad00fc06a5afc3fa86f5884` on `feat/grafana-mcp-events`, draft PR 3. The [image pin](image.json) is digest `sha256:aa05ca2fb15d7be2e127644a17a53a8ab7c7783a16b4f00361e64cac275c67b1`; dependencies, protocol handling and authentication are unchanged.

The outgoing JSON/SSE observer logs only `mcp_rpc_result`, a fixed allowlisted method label (unknown values become `unknown`), boolean `success`, safe integer `error_code` for a JSON-RPC error, and relevant `tool_count`/`event_count` for list results. It does not log raw envelopes, bodies, params, IDs, identities, tokens, headers, URLs, callback data, exception text or tool arguments. The method label comes from `Mcp-Method`; the strict modern SDK checks its agreement with the request envelope. Observations exceeding 64 KiB or malformed observations are skipped, while original response bytes continue unchanged. Notifications are ignored; observing a terminal RPC result stops further observation. Logger failures cannot change RPC handling.

[Focused checks](tests.json): TypeScript build passed; diagnostic/application/OAuth/security tests passed 23/23. New regression coverage verifies exact JSON/chunked UTF-8 SSE bytes, redaction, success/list counts, JSON-RPC errors inside HTTP 200, unknown methods, bounded/malformed observations, logger failures, auth rejection and empty-allowlist subscription denial. Four diagnostic tests passed again after a test-only cleanup. [Fresh public HTTPS checks](https-acceptance.json) passed 5/5 with normal TLS: health, both protected-resource routes, authorization metadata and unauthenticated MCP rejection. No Google login, grant, subscription or delivery was performed by these checks.

## Containment and rollback

[Before](before.json), [candidate](staged.json) and [after](after.json) confirm the image-only change in the compared runtime template fields. Five secret mounts retain Google version 2 and all other versions 1. Exact private owner pins were verified and redacted from evidence. Callback hosts remain empty/deny-all; Scheduler is absent. No secret payload, credential, IAM, DNS, network, Scheduler, Grafana, plugin or subscription change occurred.

Baseline revision `mw-grafana-events-00006-qm4` remains Ready with its original image and working Google-secret-2 configuration. If rollback is required, restore 100% traffic to that exact revision through the existing fixed GCP adapter; do not rotate credentials or change callbacks.

## Live server discovery passes; host catalog exposure pending

[Prior connection/refresh evidence](prior-discovery-evidence.json) shows three authenticated MCP HTTP 200 responses in each window and no OAuth/MCP adapter error events. The owner-reported host was Connected but had no available tools. Local pinned-source discovery advertised tools/events, `tools/list` returned two tools and `events/list` returned one event. HTTP 200 alone could not distinguish success from a JSON-RPC error.

After the browser Refresh tools, read only the new revision's `mcp_rpc_result` entries, projecting timestamp plus the permitted fields. A successful two-tool/one-event result with a still-empty host catalog points to a host ingestion gap; a numeric RPC error identifies a server/protocol diagnosis target. Do not make speculative protocol changes. Callback hostnames remain deliberately unobservable; callback activation requires separately verified host metadata and authority. Scheduler/Grafana/event round-trip acceptance is outside this contained diagnostic step. R050 remains Open.

The parent-triggered Refresh tools at **08:56:16 UTC** produced [three successful live RPC results](refresh-085616.json): `server/discover` at 08:56:21.605018, `tools/list` at 08:56:21.898254 with two tools, and `events/list` at 08:56:21.960060 with one event. No RPC error code appeared in these results. This closes the live server discovery gap. The parent UI was still pending at its handoff; final host catalog exposure is not independently verified. If it remains empty, the remaining diagnosis belongs to host ingestion/catalog exposure. No speculative protocol change is supported.

## Subscription rejection and proposed hostname capture

The parent subsequently confirmed that the actual automation event source and `grafana.alert.transition` schema are available. Its single synthetic creation attempt at **08:59:44 UTC** returned an unexpected task service error, not success. [Sanitized diagnostics](subscribe-085944.json) show `events/subscribe` failed at 08:59:46.477669 with `-32015`; `events/unsubscribe` followed at 08:59:47.820650 and also returned `-32015`. Parent task-state checking remains necessary before any retry; these logs do not prove that no partial host task exists.

The empty callback allowlist rejects at `callbackUrl` before signing-secret handling, subscription state access/writes, DNS or callback challenge; unsubscribe also rejects before its state transaction. Existing RPC diagnostics intentionally exclude callback data. Inbound Cloud Run request metadata cannot identify the outbound target, and this rejected subscription did not persist its URL. No hostname can be recovered from this evidence without a new, expressly scoped observation. No secret payload, stored URL or exception detail was read.

**Proposed change only; not implemented or deployed:** add one dedicated reject-time observer around callback validation in authenticated `Bridge.subscribe`. Gate it to an explicit temporary diagnostic flag, an empty callback allowlist, the existing event name and the exact synthetic test filters (`alert_names=[MW Grafana Bridge Synthetic Test]`, `statuses=[firing,resolved]`). Run it only for `SafeError('callback_not_allowed')`, before the existing signing-secret handling and state/outbound operations, then rethrow the original error unchanged.

The observer would emit one fixed event name, `callback_host_rejected`, with only canonical lowercase `URL.hostname`. Require HTTPS/443, no userinfo or fragment, and a bounded valid DNS hostname; omit any log on invalid input. Never emit the full URL, port, path, query, fragment, filters, request/response, IDs, identities, tokens, headers, signing secret, arguments or exception text. Use a dedicated typed projection rather than expanding the general-purpose logger. Cap capture per process; do not claim global single-shot behavior across Cloud Run instances. DNS lookup, outbound challenge, state writes and allowlist changes remain absent.

Before deployment, regression tests must prove exact hostname-only output for a synthetic URL carrying sentinel secrets in path/query, rejection/redaction of malformed URLs/userinfo/fragments/IPs, flag/filter gating, unchanged `-32015`, and zero DNS/send/subscription writes. A narrowly approved diagnostic rollout would preserve the current image's owner/auth/secret pins and retain `00007-4zn` as rollback. Only after the parent reconciles task state and authorizes one new synthetic attempt would capture be exercised; no automatic repeat creation. Capturing a hostname would not approve it for callback delivery or change the empty allowlist.

The reviewed hostname-capture proposal was subsequently implemented and tested under explicit scoped authority. [Current temporary capture readiness and rollback](../grafana-callback-host-diagnostic-20261003/README.md) supersede the proposal status above; callback allowance remains empty.
