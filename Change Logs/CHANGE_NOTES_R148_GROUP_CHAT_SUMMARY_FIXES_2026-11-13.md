# Change notes — Group chat summary fixes, PWA (R148), 13 November 2026

## Purpose
Owner report of 13 November 2026, with a screenshot: several group chat summary cards from different borrowers stack on one borrower's Collection detail in PROD. The partner account is not affected. Owner decision: "Yes, deploy to PROD" (Hosting, after CI). The agent half (hide groups with nothing collection-relevant) is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R148_GROUP_CHAT_SUMMARY_RELEVANCE_2026-11-13.md). Nothing is deployed.

## Changes
As built.
- Cause: `apps/pwa/src/CollectionRecords.tsx` renders `CollectionChatSummary` and the owner-testing `CollectionNote` as siblings with the same React key (`selected.id`). With `ownerTesting` on, React leaves the previous borrowers' cards mounted. The e2e test ran without `ownerTesting`, so it did not see it.
- Fix (Byte): the card key is `'chat-summary:'+selected.id` and the note key `'note:'+selected.id` in `CollectionRecords.tsx`; the sample app card key in `main.tsx` is prefixed too. A new owner-shell e2e (`tests/e2e/collection-chat-summary.spec.ts`) opens five borrowers with `ownerTesting`: before the fix desktop failed (the headline locator resolved to 2 elements) and the phone showed the duplicate-key console warning; after the fix it passes, with one card per borrower, none for a borrower without a summary and no warning.
- Documents (Dewey): this note, the release tracker (R148 scope), `Solution_Design.md` and the application dictionary entry (no card when nothing is relevant; distinct keys).
- Not changed: SQL, the command service, the read path and infrastructure.

## Checks
| Command | Result |
| --- | --- |
| Byte's `npm run typecheck` and `npm run lint` | Clean |
| Byte's `collection-chat-summary`, `collection-read` and `collection-loading-shift` specs, mobile and desktop Chromium | 16 passed |
| Byte's chat-summary spec on real WebKit (`mobile-webkit`) | 3 passed |
| Byte's `npm run build` | ok |
| Chase's review | Pass: the only keyed siblings in the detail fragment are `'chat-summary:'+id` and `'note:'+id`, with no other collision; the e2e really runs with `ownerTesting` (it asserts one `.collection-note` per visit) and fails on any same-key warning |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request | Pass: `Development checks` run 43375458596 and `Agent tests` run 43375458591 on `23a5491d` |
| PROD verification | Pass, see the PROD promotion record |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- The agent lab and database CI: no SQL change.

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's answers of 13 November 2026, "Yes, deploy to PROD" (PWA Hosting after CI) and "Hide them" ("Agent change, ships with R148"), relayed by the orchestrator as the scoped PROD approval for R148: PROD Hosting, the agent deploy, one `--mark-all` re-run and the technical records. No SQL, image or Terraform change; no payment, notification or job was forced; no manual cycle, model call or post. No secret value, token, chat text or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | `b2ec95dcd63068bdece98c1deabf776fd70bfbd3` (merge of PR #305; baseline R147 `a2fc30ab`). CI on the head `23a5491d`: `Development checks` run 43375458596 (check, lint, three Chromium and three iPhone WebKit e2e shards) and `Agent tests` run 43375458591 (test, lab); the generic runner reused the terraform job of run 43186898321 and the database groups of run 43291437377 (no input change since) |
| Hosting | Frontend-only generic package (`kindRule: generic-v1`, scope `frontend-only`; the runner derived no runtime input and no migration; PROD Flyway 146 read back 06:11:23Z; the five services on their pinned revisions). Build `live-prod` with release R148: build-version `c9de154a9cd4f1d2fe017c0a`, entry `/assets/index-B9pURppO.js`, 18 files. `--check` passed; `--apply` as `mw-credit-unattended-admin` 06:12:12Z to 06:12:46Z: version `fde9cd8546c21116`, release `1794550360546000`, package sha256 `8675ce67...`. `lm.mw-credit.com` 200 with the R148 marker. Rollback: Hosting `17a2c9d3cef2e6e8` (R146) |
| Tag | `R148` on `b2ec95dcd63068bdece98c1deabf776fd70bfbd3` (the package commit), created by the Release tag workflow, run [43379890550](https://github.com/welct0407/MW-Credit-App/actions/runs/43379890550) (success, 06:36:36Z to 06:36:59Z); confirmed with `git ls-remote --tags origin R148` on 13 November 2026 at 06:37Z (the peeled tag points to `b2ec95dc`) |
| Components | `render --write` after the tag: the PWA frontend and the integration agent are R148 (changed); every other component keeps its earlier release |
| Agent | Deployed with this release; see the [agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R148_GROUP_CHAT_SUMMARY_RELEVANCE_2026-11-13.md#prod-promotion-record-forge-13-november-2026-utc) |

### Prune at closure
Deleted (inbound links repointed to commit `b2ec95dc`): `Change Logs/CHANGE_NOTES_R145_DRIFT_CLOSURE_WINDOW_2026-11-12.md`, outside the window of the Open release and the three newest Released releases (R148, R147, R146); its link in `Development_Changes.md` now points at the permalink (the release tracker already used one). No section of `Development_Changes.md` belonged to an older released release (the R148 follow-up row was added), and `npm run check:docs` reports no uncited evidence.

## Recovery
Revert the pull request; Hosting rollback to the previous PROD version (in the environment inventory).

## Open questions
None.

## Remaining work
PROD done (record above); tagged R148 and closed by the closure pull request. Owner-accepted in PROD on 13 November 2026 ("i accept R148, 149, 150").
