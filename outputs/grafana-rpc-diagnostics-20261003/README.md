# Contained MCP RPC diagnostics — 3 October 2026

Diagnostic-only revision `mw-grafana-events-00007-4zn` is Ready at 100% traffic. The browser can now Refresh tools. This deployment closes an observation gap; it does not claim to fix the host's No tools available result.

## Change and verification

Runtime source pin: `8056710464bbc68a4ad00fc06a5afc3fa86f5884` on `feat/grafana-mcp-events`, draft PR 3. The [image pin](image.json) is digest `sha256:aa05ca2fb15d7be2e127644a17a53a8ab7c7783a16b4f00361e64cac275c67b1`; dependencies, protocol handling and authentication are unchanged.

The outgoing JSON/SSE observer logs only `mcp_rpc_result`, a fixed allowlisted method label (unknown values become `unknown`), boolean `success`, safe integer `error_code` for a JSON-RPC error, and relevant `tool_count`/`event_count` for list results. It does not log raw envelopes, bodies, params, IDs, identities, tokens, headers, URLs, callback data, exception text or tool arguments. The method label comes from `Mcp-Method`; the strict modern SDK checks its agreement with the request envelope. Observations exceeding 64 KiB or malformed observations are skipped, while original response bytes continue unchanged. Notifications are ignored; observing a terminal RPC result stops further observation. Logger failures cannot change RPC handling.

[Focused checks](tests.json): TypeScript build passed; diagnostic/application/OAuth/security tests passed 23/23. New regression coverage verifies exact JSON/chunked UTF-8 SSE bytes, redaction, success/list counts, JSON-RPC errors inside HTTP 200, unknown methods, bounded/malformed observations, logger failures, auth rejection and empty-allowlist subscription denial. Four diagnostic tests passed again after a test-only cleanup. [Fresh public HTTPS checks](https-acceptance.json) passed 5/5 with normal TLS: health, both protected-resource routes, authorization metadata and unauthenticated MCP rejection. No Google login, grant, subscription or delivery was performed by these checks.

## Containment and rollback

[Before](before.json), [candidate](staged.json) and [after](after.json) confirm the image-only change in the compared runtime template fields. Five secret mounts retain Google version 2 and all other versions 1. Exact private owner pins were verified and redacted from evidence. Callback hosts remain empty/deny-all; Scheduler is absent. No secret payload, credential, IAM, DNS, network, Scheduler, Grafana, plugin or subscription change occurred.

Baseline revision `mw-grafana-events-00006-qm4` remains Ready with its original image and working Google-secret-2 configuration. If rollback is required, restore 100% traffic to that exact revision through the existing fixed GCP adapter; do not rotate credentials or change callbacks.

## Host verification still pending

[Prior connection/refresh evidence](prior-discovery-evidence.json) shows three authenticated MCP HTTP 200 responses in each window and no OAuth/MCP adapter error events. The owner-reported host was Connected but had no available tools. Local pinned-source discovery advertised tools/events, `tools/list` returned two tools and `events/list` returned one event. HTTP 200 alone could not distinguish success from a JSON-RPC error.

After the browser Refresh tools, read only the new revision's `mcp_rpc_result` entries, projecting timestamp plus the permitted fields. A successful two-tool/one-event result with a still-empty host catalog points to a host ingestion gap; a numeric RPC error identifies a server/protocol diagnosis target. Do not make speculative protocol changes. Callback hostnames remain deliberately unobservable; callback activation requires separately verified host metadata and authority. Scheduler/Grafana/event round-trip acceptance is outside this contained diagnostic step. R050 remains Open.
