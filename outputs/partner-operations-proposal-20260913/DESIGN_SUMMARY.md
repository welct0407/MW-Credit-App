# Partner Operations Agent — implementation design

Updated 13 September 2026 after the owner's second design round. Requirements below describe the intended implementation, not a deployed system. Proposed project name: MW-Partner-Operations.

## Intended behavior

1. **Collection source:** read the existing collection dashboard or its backing slice. Reuse its filtering and prepare messages only for borrowers with payment due today or overdue as of today. Verify the live object, full result retrieval and partner-specific visibility; do not maintain a second collection filter or enrollment list.
2. **Partner identity:** add Instagram account information to the existing Partner table and bind verified Instagram sender identity to its stable partner key. Reuse the email already stored there. No separate partner list. Verify exact fields and the minimum account-binding storage during implementation.
3. **Partner commands:** accept Instagram instructions for any supported end-user OLTP app GUI operation the partner is permitted to perform, including non-collection workflows. Prefer observed GUI controls. Keep app definitions, database administration, direct backend changes, credentials and privilege changes outside this channel. Preserve financial history and verify saved results before claiming completion.
4. **Daily briefing:** prepare at 11:00 Asia/Bangkok. For each eligible borrower send a partner context message (name, city, workplace and collection amounts), then a clean Thai borrower draft for manual forwarding. Finish with names grouped by location, counts, subtotals and an overall total. Add sourced Pattaya afternoon/evening weather and useful local notices when available.
5. **Physical collection:** remove bank-transfer details and all direct automated borrower interaction. Adapt the existing friendly Thai template. Deadline, fee and closure wording remain an explicit open business decision; do not silently inherit automatic fees from the old runtime.
6. **Email fallback:** if Instagram cannot deliver, send the full briefing in one email to that partner's stored email, including all context/draft pairs and the final location/weather summary. On partial/unknown Instagram delivery, stop unsent parts and label the email as the complete briefing that may repeat already-visible content. Deduplicate both channels and reconcile uncertain sends before retrying. Failed command responses also fall back to email without repeating the underlying operation. Inbound email commands are outside this design.

## Implementation sequence

1. Establish the approved new project/repository and its instructions, service policy, documentation, tests and disabled runtime defaults.
2. Inspect the live dashboard/slice, Partner fields, current app permissions and supported GUI workflows. Record verified data mappings and remaining limitations.
3. Record rollback versions, implement the requested Partner Instagram account information, and update the AppSheet model overview, data dictionary and change log together. Do not add unrelated columns/tables.
4. Implement partner authentication, GUI execution with durable action journals/readback, and the 11:00 briefing generator with source reconciliation.
5. Implement Instagram primary delivery and one-email fallback using the same briefing content and a durable cross-channel journal. Add nonblocking weather enrichment.
6. Run synthetic regression tests, then authorized new-GUI acceptance checks. Cover source parity, account mapping, permissions, financial duplicates/unknown saves, message order/totals, fallback completeness, partial/unknown sends and absence of borrower automation.
7. After acceptance and activation approval, cut over deliberately from overlapping old services. Keep a documented rollback and reconcile pending operations without replay.

Every coherent repository change includes applicable documentation, a Markdown change log, appropriate checks, scoped Git commit and normal push with remote verification. Source publication is separate from live activation. Runtime data and credentials need separate verified backups.

## Remaining implementation decisions

- Confirm final project/repository identity and visibility when creating it.
- Inspect actual schema, dashboard/slice names and partner permissions; these are not yet verified live.
- Confirm physical-collection deadline/fee/closure wording and missed-run behavior.
- Configure the email sender and verified Instagram bindings; existing Partner email is the destination source.
- Agree safe acceptance recipients and old-runtime cutover before activation.

Detailed rules: [AGENTS.md](AGENTS.md). This design revision changes no live schema, app workflow, schedule, account or financial record.
