# Separate borrower and reviewer accounts — 2026-09-09

Status: Implemented and verified through live API readback and runtime routing. Awaiting normal inbound-message acceptance.

## Scope and purpose

User authorized moving borrower Tommy to a separate Instagram account and retaining the former account solely as reviewer. Updated only the existing Borrowers row ctyq1RAYyu456aLHq3b086: Instagram Username, profile link in Instagram Conversation URL, and cleared Instagram Verified At to avoid carrying verification from another identity. API resolution independently verified the new conversation. Exact account details are retained in the private change evidence rather than this public log.

The existing configurable routing already supports this separation. Refreshed generated borrower-routes.json and reviewer-routes.json; reviewer definitions and English language preference are preserved. No account identity was hardcoded into runtime source. Updated collection-agent/REVIEWERS.md to describe the dedicated-account arrangement. The private one-time migration script is collection-agent/local/remap-tommy-20260909.py.

## Rollback point

Before mutation, saved the affected row fields and route/reviewer configuration in collection-agent/local/before-tommy-account-20260909/. The mutation ran under the shared collection lease. This is an existing data-row change, not an AppSheet definition, schema, or Looker change; AppSheet version backup and data-model documentation updates are not applicable.

## Validation and downstream behavior

- Read current production row and checked that the destination username was not assigned to another borrower.
- Performed one API Edit and independently read back the row.
- Borrower Name, Communication Name, AI Collection Enabled and Late Penalty Enabled matched their prior values. Loans, charges and payments were not edited.
- Refreshed authenticated Instagram conversations: new borrower account mapped successfully; no setup gaps.
- Confirmed the previous account is absent from borrower routes, remains an active English reviewer, and resolves without a borrower ID.
- Confirmed the new account resolves to the existing borrower ID and is absent from reviewer authority.
- Runtime reloads profile/reviewer mappings; no service restart or schedule change required. Historical events, payment evidence and existing holds remain intact; no historical receipt replay or verification message was sent.

## Manual acceptance and rollback

Use the new borrower account for the next ordinary payment promise or receipt; use the existing reviewer account to reply to a review message. Existing genuine holds may still prevent collection or payment posting under their normal rules.

To revert, restore only the saved Instagram profile fields through the AppSheet API under the shared lease, then refresh routes from authenticated conversations. Do not restore an old generated route file or database snapshot over current activity. Reverting the profile would deliberately restore overlapping roles, so do so only on explicit request.
