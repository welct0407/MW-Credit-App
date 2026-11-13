# Change notes — Group chat card style (R150), 13 November 2026

## Purpose
Owner requests of 13 November 2026 on the group chat summary card: (1) a different colour for each speaker role on the tags, (2) the "Last message" role colour-coded too, and all card times in the browser's local time zone instead of Bangkok time, (3) no "Show more / Show less": the card always shows the whole summary. Owner authorization: "Yes, deploy to PROD" (Hosting, after CI). PWA only; nothing is deployed.

## Changes
As built.
- `apps/pwa/src/CollectionChatSummary.tsx`, `CollectionRecords.tsx`, `main.tsx`, `live-style.css`, `style.css` and the e2e spec (Byte): speaker tags are outline pills coloured per role through custom properties on `.collection-chat-summary` (classes `chat-role chat-role-<role>`): borrower `#1d5fa8` blue, other borrower `#4a4fb0` indigo, partner `#6a6200` olive, referrer `#a3336f` magenta, MW Credit `#0b6b7a` teal, other `#666666` grey, all at least 5.7:1 on white, payment-status colours avoided; the last-message role is the same colour at weight 600. The expander (Show more / Show less) and its state are removed: the card always shows the headline, up to four points and the last-message line. All card times (Updated, the last-message time, the stale "Last conversation <date>" and the today test) use the browser's local time zone; the rest of the app still shows Bangkok business time. The list mark colour is unchanged; light theme only.
- Rule change: R146 said tags are neutral and never reuse the payment-status colours, and UX-CHAT-01 kept the expander. Now tags take role colours and there is no expander; the payment-status colours stay off-limits.
- Echo's visual review (real WebKit iPhone 17 Pro Max and desktop Chromium, English and Thai): UX-CHAT-10 taken (the Borrower and Partner colours were too close, ΔE 10.6, now 51.4); UX-CHAT-11 (distance from the status colours fine), 13 (card height 341 px worst case on a phone, accepted) and 14 (Thai tags fine) need no change; UX-CHAT-12 (stale tags keep full colour) not taken, because the owner asked for role colours.
- Documents (Dewey): this note, the release tracker (R150 scope), `Solution_Design.md` (card rules) and `application.yaml` (the card entry).
- Not changed: SQL, the agent, the command and read services.

## Checks
| Command | Result |
| --- | --- |
| Byte's `npm run typecheck` and `npm run lint` | Clean (before the colour swap) |
| Byte's `npm test` | 1355 pass, 1 skipped (before the swap) |
| Byte's `npm run build` | ok |
| Byte's `collection-chat-summary`, `chat-seen-sync` and `collection-read` specs, mobile and desktop Chromium | 18 passed (before the swap) |
| Byte's chat-summary spec on real WebKit (`mobile-webkit`), including Los Angeles and Tokyo time-zone tests | 5 passed (before the swap) |
| Byte's chat-summary spec rerun after the colour swap | Pass: 10 passed on mobile and desktop Chromium and 5 on `mobile-webkit`; typecheck, lint and build clean. The CI e2e shards on `9d78cd0e` (run 43432655880) ran it too |
| Echo's visual review | Done, see Changes |
| Chase | Not applicable: a text, style and layout change, covered by Byte's checks and Echo's visual pass under the proportional validation |
| CI on the pull request | Pass: `Development checks` run 43432655880 on `9d78cd0e` (six e2e shards, including iPhone WebKit) |
| PROD Hosting verification | Pass, see the PROD promotion record |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- A dark theme: the card is light theme only.

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's answer of 13 November 2026, "Yes, deploy to PROD" (R150, PWA only), relayed by the orchestrator as the scoped PROD approval for the R150 Hosting deploy and its technical records. No SQL, image, agent or Terraform change; no data was written. No secret value or token appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Freeze | 13:32:32Z; package `98b3ef68e04af2ea45840779d9c86e5d5e32c5bc` (merge of PR #309); baseline R149 `011d89d9`. Next unused number R151 (opened by the closure pull request) |
| CI | `Development checks` run 43432655880 on `9d78cd0e` (check, lint, three Chromium and three iPhone WebKit e2e shards); the generic runner reused the terraform job of run 43186898321 and the database groups of run 43420099934 (no input change since) |
| Package | Generic runner, `kindRule: generic-v1`, scope `frontend-only`: it derived no runtime input and no migration (only PWA, test, Data Dictionary and document files changed). PROD Flyway 147 read back 13:33:02Z (147 successful rows); the five services on their pins (read `00058-c4b`, command `00063-ccp`, chat `00042-m9q` on `3cf271c1...` (R149); notify `00030-285`, jobs `00030-29l` on `63e5b48f...` (R144)). DEV Hosting was not required by the runner or the rule and stays on R149 |
| Hosting | Build `live-prod` with release R150 (public configuration equal to the live one): build-version `4b20f6aa77f0c854e5bd7027`, entry `/assets/index-BWSb0W_q.js`, 18 files. `--check` passed; `--apply` as `mw-credit-unattended-admin` 13:33:29Z to 13:34:04Z: version `e658d9d1cc67cb27`, release `1794576838989000`, package sha256 `6c9cf2f0...` |
| Smoke (read-only) | `lm.mw-credit.com` 200 with the R150 marker; read, command and chat `/health` unchanged (R149, `011d89d9`) and every service on its pinned revision; no ERROR logs on the five PROD services after 13:30Z |
| Tag | `R150` on `98b3ef68e04af2ea45840779d9c86e5d5e32c5bc` (the package commit), created by the Release tag workflow, run [43434929623](https://github.com/welct0407/MW-Credit-App/actions/runs/43434929623) (success, 13:35:10Z to 13:35:41Z); confirmed with `git ls-remote --tags origin R150` on 13 November 2026 at about 13:37Z (the peeled tag points to `98b3ef68`) |
| Components | `render --write` after the tag: the PWA frontend is R150 (changed); every other component keeps its earlier release |
| Rollback | Hosting `55e0ff3a841029d5` (R149); redeploy to roll back |

### Prune at closure
Deleted (inbound links repointed to commit `98b3ef68`): `integration-agent/Change Logs/CHANGE_NOTES_R147_GROUP_CHAT_SUMMARY_BACKFILL_2026-11-13.md`, outside the window of the Open release and the three newest Released releases (R150, R149, R148); its links in the release tracker, `Development_Changes.md` and the environment inventory now point at the permalink. No section of `Development_Changes.md` belonged to an older released release (the R150 follow-up row was added), and no evidence became uncited (`npm run check:docs` reports no warning).

## Recovery
Revert the pull request; Hosting rollback to the previous PROD version (in the environment inventory).

## Open questions
None.

## Remaining work
PROD Hosting done (record above); tagged R150 and closed by the closure pull request. Open for the owner: acceptance (the check of the card); R148 and R149 acceptance are also still pending.
