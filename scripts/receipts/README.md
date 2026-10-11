# Native DEV receipt reconciliation

Run `node scripts/receipts/reconcile-native.mjs --input <absolute-private-input.json> --output <absolute-private-catalog.json> --evidence <sanitized-evidence.json>` after acquiring authenticated source evidence. Input, media and catalog must be outside both repositories; existing outputs are never overwritten. No secret publication, deployment, database/storage writes or remote reads occur in this offline command.

The operator must first perform a bounded read-only query against the verified current DEV database and retrieve the receipt for that exact Payment row/reference from authenticated DEV AppSheet. Capture the exact GCS object generation separately. Acquire all three in the same reconciliation session and repeat source capture if the reference/object changed. A filename match, object listing, or media hash without its AppSheet row/reference binding is insufficient. Supplied capture assertions are trusted operator evidence: this tool does not independently authenticate their origin or establish that SQL/AppSheet remains unchanged after capture.

Input JSON uses `schemaVersion: 1`, `environment: "dev"` and `entries: [...]`. Each entry contains:

| Object | Required fields |
| --- | --- |
| `database` | `database: "loan_manager_dev"`, `instance: "clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914"`, `host: "34.21.174.215"`, `table: "Payments"`, `column: "Uploaded Receipt"`, `readOnly: true`, ISO `capturedAt`, exact `rowId`, exact stored `reference` |
| `appsheet` | `appId: "500b27b6-884a-41e8-a9ec-df801b0110ad"`, `method: "authenticated-appsheet-media"`, same exact `rowId` and `reference`, ISO `capturedAt`, absolute private `mediaPath`, observed `mimeType`, media `sha256` |
| `gcs` | `bucket: "mw-payment-receipts-prod-508610-n7"`, exact `key`, decimal string `generation`, observed `mimeType`, integer `sizeBytes`, media `sha256`, ISO `capturedAt`, absolute private `mediaPath` for that generation |

Both captured media files must have identical bytes/hash/size/MIME and pass real image decoding. Keys must be under the fixed native DEV AppSheet directory, outside its PWA subdirectory. New entries never infer an object key by changing a filename. Duplicate reference/key mappings and conflicting legacy pins fail closed. Exact copies of the two previously verified legacy pins may bootstrap their private exact keys.

The private output is the complete catalog to review before adding a Secret Manager version and pinning that numeric version through Terraform. Preserve all intended existing catalog entries when preparing a replacement; the runtime automatically retains only the two legacy fallback descriptors. The sanitized output contains hash/generation/content pins and the trust limitation, with no reference, row ID, private path or object key. The runtime accepts catalog JSON through `RECEIPT_NATIVE_CATALOG_JSON`; absent configuration retains legacy behavior, while malformed configured JSON aborts startup.

Limits: catalog 64 KiB / 256 entries, input capture file 1 MiB, each PNG/JPEG/WebP at most 5 MiB. Runtime access still requires an authorized Payment row and verifies pinned generation, metadata, content hash, size and decoding. Unknown mappings remain unavailable pending trusted reconciliation.
