# Change notes — R090 in-app chatbot design, 23 October 2026

## Purpose
The owner wants the Partner conversation moved from Instagram into the PWA (fifth bottom-menu item, chat history, user-selectable model, independent of the Debian VM) and the Instagram conversation decommissioned afterwards. This batch records the approved high-level plan and the detailed design the six-agent team implements next; no code, infrastructure or database changes yet.

## Changes
- New design document (owner go-ahead 23 October 2026): [`project/outputs/r090-pwa-chatbot/DESIGN.md`](../project/outputs/r090-pwa-chatbot/DESIGN.md). It holds the owner's five decisions (three models `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.5-flash`; writes as a later batch; SSE streaming; stop the Instagram conversation at implementation start and decommission after the owner's PROD test; a separate Cloud Run service `mw-credit-app-chat-{env}`), the API and streaming contract, the Node port map of the `integration-agent/` conversation engine, the V104 tables, roles and functions, the PWA screen spec, the Terraform scope, the phase 0 switch, the test plan, the delivery waves and the phase 3 decommission checklist.
- Records: [Development Changes](../project/Documents/Development_Changes.md) outstanding-work row and the R090 sentence of the [Release Tracker](../project/Documents/Release_Tracker.md#current-development-release) now point to the design.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | 0 failures, 1 warning that predates this batch (`project/outputs/collection-monitor-design-20260924/DESIGN.md` uncited), on the commit that carries this note (documentation-only batch; no product CI) |

## Not run
Product CI, Terraform, database and browser checks: nothing executable changed.

## Recovery
Revert the commit; nothing is deployed.

## Open questions
None. Implementation items that are not owner decisions are listed in the design's section 14.

## Remaining work
Implementation by the team under R090 in the waves of the design's section 11, starting with phase 0 (stop the Instagram conversation, config-only) and wave 1 (infrastructure, service, migration).
