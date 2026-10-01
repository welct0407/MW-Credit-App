# Cloud-first development readiness - 30 September 2026

## Scope and authority

The owner requested cloud-first development with VM-01 as an optional fallback. This documentation-only patch records verified routes, reversible DEV save tests and remaining blockers, and narrowly revises browser routing to permit the authenticated cloud browser as primary with the same intended service identities. It does not establish full cloud development or deployment readiness.

The owner authorized the reversible DEV Design Details tests and subsequently selected PROD for minimal read-only API probes because PROD APIs were already enabled. Notification isolation is owner-attested. No notification test is claimed here.

## Changed files and preservation

- [AGENTS.md](../AGENTS.md): cloud-primary browser routing and identity checks; existing VM browser/account fallback safeguards retained.
- [Service account and browser mapping](../Documents/Service_Account_Browser_Mapping.md): the same 17 account assignments and authentication notes; VM fallback browsers retained.
- [Environment inventory](../Documents/Environment_Inventory.md): current restored DEV versions and a linked partial-readiness checkpoint. Earlier dated release observations remain historical evidence.
- This coherent readiness log.

Prepared in a new standalone clone under `C:\Users\MWCredit\Documents\Codex\2026-09-30\task\cloud-readiness-docs`, branch `docs/cloud-first-readiness-20260930`, from fresh GitHub `master` at `7a23d62c4da3886d130bc40fc4fdb187cefcb9c4`. The checkout required long-path support in this isolated clone; no global Git, ACL or security setting changed. The dirty primary `C:\GitHub\AppSheet-Loan-Project` is preserved. No product code, migrations, dictionary objects or release records are changed. R050 remains the sole Open release; R051 is not opened or reserved. Prepared for review; not yet committed or pushed.

## Verified evidence and practical limits

Evidence below comes from actual browser checks and VM command results on 30 September 2026. Browser observations and command results were verified separately. This log records those observations without manufacturing raw exports, screenshots or private data.

| Component | Verified operation/result | Limit |
| --- | --- | --- |
| DEV OLTP | App `500b27b6-884a-41e8-a9ec-df801b0110ad`: empty Design Details at 1.000157; temporary marker saved at 1.000158; exact empty value restored at **1.000159**. Reload: No issues found; Save/Undo disabled. | Reversible editor save test; no business workflow or data-write test. |
| DEV OLAP | App `9f3422be-bc87-4a5a-a42a-67528ee80393`: empty Design Details at 1.000045; temporary marker saved at 1.000046; exact empty value restored at **1.000047**. Reload: No issues found; Save/Undo disabled. | Same limited scope; no data, bot or API change. |
| PROD OLTP API | App `93844270-6aa5-420b-a960-bcdf08abd357`, 08:45:50 UTC: HTTP 200, zero rows. | VM-01 existing credential route only; no cloud access or mutation capability tested. |
| PROD OLAP API | App `e74dd368-654f-44d7-bccf-83cf361d1cdb`, 08:45:53 UTC: HTTP 200, zero rows. | Same limit. |
| Cloud browser | AppSheet, Metabase, Grafana and Railway authenticated browser/admin routes verified with their intended service identities. | Browser access does not establish cloud shell startup, API credentials or deployment readiness. |
| Cloud SQL | 06:59:52-53 UTC: authenticated SSL read-only identity/history checks reached `loan_manager_dev` and `loan_manager_prod` on `34.21.174.215`, instance `appsheet-pg-prod-20260914`; both at successful V56. | VM route; no cloud connectivity, migration or financial-record test. |
| Metabase / Railway APIs | Metabase health and authenticated source 2 metadata passed. Railway project-scoped read succeeded at 07:09:19 UTC for MW Credit Metabase. | Metabase source 2 is PROD; no isolated DEV reporting destination or deployment test claimed. |
| Grafana | Health database ok at 07:00 UTC; authenticated browser admin route verified separately. | Existing VM setup-token dashboard search returned 401 at 07:04:38; browser access does not validate that token. |
| GCS receipts | Existing gcloud identity read receipt bucket metadata by 07:12:36 UTC: `mw-payment-receipts-prod-508610-n7`, `ASIA-SOUTHEAST1`. | Object permissions and cloud-browser GCP/GCS access were not verified. |
| Debian runtime | Trusted SSH using case-sensitive **MWCredit** at `100.71.171.91` passed at 07:36:38 UTC. SQL proxy, webhook, Cloudflare tunnel, chart service, resource-health timer and Tailscale active; local webhook health passed. | Existing VM administration route only; no new cloud SSH identity or network route provisioned. |
| Debian deployment | At 07:38:40 UTC, clean source `07b53cd1707ce9210477a959e3536a3ef4d67acd`, installed package 0.1.0, all 49 Python files matching source, deployed catalogue revision 24; six timers present. | Runtime stays on Debian. No worker invocation, restart, deployment or message was triggered. |

The API probes used an in-memory Python standard-library transport with `allowWrites:false`, redirects blocked and only `Action: Find`, `Rows: []`, selector `Top(Filter(Partners, FALSE), 1)`. Existing VM credential files were read in place; no key was exposed, copied, generated or transferred. The audit-decorated production runtime helper was not invoked. Zero-row responses verify authentication and bounded Find transport, not financial correctness or write readiness.

## Remaining blockers and assignment

**Not ready for complete cloud coding takeover.** Cloud browser work can use the verified routes; VM-01 remains an available fallback and Debian remains the production runtime.

| Work / blocker | Intended assignment and next evidence |
| --- | --- |
| Cloud coding startup | The original three-repository environment, same-three-repository A/B, bare existing DailyUse single-repository environment and brand-new private [dummy README repository](https://github.com/welct0407/cloud-launch-smoke-20260930) environment were all published; each fresh task failed with exactly `Unable to determine project root for task`. No task was admitted. No experiments remain pending; the cause is unknown. A successful task must independently verify its environment, checked-out roots and intended revisions. |
| Support | Original case escalated to a specialist at 09:00 UTC; no case ID supplied and an email response is expected. Minimal-test and new-repository addenda were confirmed posted at 10:07:50 and 10:19 UTC respectively. The cause remains unknown; no fix or successful startup is claimed. |
| Cloud API / SQL access | Secure cloud credential provisioning and actual bounded connection checks remain pending. VM PROD API and SQL success do not establish cloud access. Do not enable DEV, copy existing keys or provision identities as a side effect of this patch. |
| GCP/GCS and Cloudflare UI | Cloud GCP/GCS browser route unavailable; Cloudflare blocked by a CAPTCHA loop. Use established authorized VM fallback only when available and identity-verified; do not bypass challenges or change accounts/security. |
| Portable tooling | Cloud code/tests should use an isolated checkout and configurable runtime/credential paths rather than hardcoded Windows paths. Confirm supported Node/Python/PostgreSQL/Flyway tools once cloud startup works. No runtime installation or product-code portability edit is included here. |
| Debian administration / deployment | VM fallback SSH is verified with the existing key and exact username MWCredit, strict host checking. Cloud live SQL/SSH operations need a separately designed supported approach and their own authorized read-only verification; adding Tailscale and a key does not establish that capability. No secret transfer is authorized by routing policy. Existing release/deployment safeguards continue to govern writes. |

The [official cloud-environment private-networking documentation](https://learn.chatgpt.com/docs/environments/cloud-environments) states that built-in Tailscale supports private HTTP/HTTPS and IPv4 subnet routes, but does not support native database protocols or SSH. This is a documented product constraint, verified separately from live tests. The current VM SQL/SSH fallback is verified; no network or security changes are included here.

## Checks, rollback and status

Local documentation checks passed: exactly four intended files; no staged content; all 17 service-register rows and authentication notes preserved; AGENTS.md unchanged outside the browser-routing bullet; restored DEV versions 1.000159/1.000047 recorded; added relative links resolve; Release_Tracker.md and release-helper instructions unchanged; Git whitespace check passed. These checks validate documentation only, not cloud runtime access. Release helper source/instructions were reviewed; no checklist is generated and unchanged helpers need no regression run for this documentation-only patch.

Rollback for the patch is to discard/revert only these four documentation changes while preserving later work. The DEV test markers were already removed by their save/restoration sequence; there is no remaining marker to roll back. App restore would be a separate authorized action, not part of documentation rollback. No live deployment, financial write, API/bot setting change or notification was performed by this patch.

Status: prepared for review; not yet committed or pushed. Cloud startup, credential provisioning and inaccessible provider routes remain open. Updating this log or browser routing does not mark a release Ready or Released.
