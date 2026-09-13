# Partner Operations Agent — implementation design

Updated 13 September 2026 after the owner's third design round. Production table setup and location loading are authorized first; agent implementation remains deferred until review. Proposed project name: MW-Partner-Operations.

## Intended behavior

1. **Collection source:** read Collection / Todays Collection Board and reuse its filtering. Prepare messages only for borrowers with payment due today or overdue as of today AND existing AI Collection Enabled set to TRUE. Preserve existing flag values; no second borrower opt-in. City and Working Location come from the borrower record, initially loaded from the owner's Borrower Locations spreadsheet with blanks and uncertainty preserved.
2. **Partner identity and preferences:** store Instagram Username, Language Preference and IG Integration Enabled in Partners and reuse its existing Email. No separate partner list. Only explicit TRUE enables any partner communication, including email fallback; defaults remain off. Partner communication uses the selected language while borrower drafts retain their approved Thai wording. Verify sender/account ownership before accepting operational commands.
3. **Partner commands:** accept Instagram instructions for any supported end-user OLTP app GUI operation the partner is permitted to perform, including non-collection workflows. Prefer observed GUI controls. Keep app definitions, database administration, direct backend changes, credentials and privilege changes outside this channel. Preserve financial history and verify saved results before claiming completion.
4. **Daily briefing:** prepare at 11:00 Asia/Bangkok. For each eligible borrower send a partner context message (name, city, workplace and collection amounts), then a clean Thai borrower draft for manual forwarding. Finish with names grouped by location, counts, subtotals and an overall total. Add sourced Pattaya afternoon/evening weather and useful local notices when available.
5. **Physical collection:** remove bank-transfer details and all direct automated borrower interaction. Adapt the existing friendly Thai template. Deadline, fee and closure wording remain an explicit open business decision; do not silently inherit automatic fees from the old runtime.
6. **Email fallback:** if Instagram cannot deliver, send the full briefing in one email to that partner's stored email, including all context/draft pairs and the final location/weather summary. On partial/unknown Instagram delivery, stop unsent parts and label the email as the complete briefing that may repeat already-visible content. Deduplicate both channels and reconcile uncertain sends before retrying. Failed command responses also fall back to email without repeating the underlying operation. Inbound email commands are outside this design.

## Implementation sequence

Production setup is now reconciled across OLTP **3.000050** and OLAP **1.100031**. **Partner management belongs to OLAP**: its existing partner form/detail expose the new controls, while borrower locations are editable in OLTP and visible read-only in OLAP. Rollback versions are OLTP 3.000045 and OLAP 1.100028. Agent implementation remains deferred pending owner review.

1. Establish the approved new project/repository and its instructions, service policy, documentation, tests and disabled runtime defaults.
2. Inspect the live dashboard/slice, Partner fields, current app permissions and supported GUI workflows. Record verified data mappings and remaining limitations.
3. Review completed production setup: OLTP 3.000050, rollback 3.000045; three Partner controls and two Borrower location fields are in place. Thirty location cells across 18 borrowers are loaded, both model documents updated, and all partner integration flags off. No additional table setup is required for these requested fields.
4. Implement partner authentication, GUI execution with durable action journals/readback, and the 11:00 briefing generator with source reconciliation.
5. Implement Instagram primary delivery and one-email fallback using the same briefing content and a durable cross-channel journal. Add nonblocking weather enrichment.
6. Run synthetic regression tests, then authorized new-GUI acceptance checks. Cover source parity, account mapping, permissions, financial duplicates/unknown saves, message order/totals, fallback completeness, partial/unknown sends and absence of borrower automation.
7. After acceptance and activation approval, cut over deliberately from overlapping old services. Keep a documented rollback and reconcile pending operations without replay.

Every coherent repository change includes applicable documentation, a Markdown change log, appropriate checks, scoped Git commit and normal push with remote verification. Source publication is separate from live activation. Runtime data and credentials need separate verified backups.

## Remaining implementation decisions

- Confirm final project/repository identity and visibility when creating it.
- Production schema and Collection / Todays Collection Board are inspected in the setup task; effective runtime partner permissions and verified account binding still require implementation checks.
- Confirm physical-collection deadline/fee/closure wording and missed-run behavior.
- Configure the email sender and verified Instagram bindings; existing Partner email is the destination source.
- Agree safe acceptance recipients and old-runtime cutover before activation.

Detailed rules: [AGENTS.md](AGENTS.md). The separate production setup task has added the requested fields and loaded borrower location data; owner acceptance is pending. It does not activate a schedule, agent communication or financial operations.
