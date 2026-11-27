# Change notes — R188 Payments moves to the menu, 27 November 2026

## Purpose
Owner request of 27 November 2026 (verbatim): "I hardly use the payment page in the bottom buttons. Let's move it to menu, leave only 4 at the bottom". On a phone the bottom tab bar becomes Dashboard, Collection, Borrowers and Chat, and Payments moves into the menu drawer. The desktop sidebar and the tablet rail are unchanged. Status: Released to DEV and PROD on 27 November 2026 (PWA Hosting only; PR #394, package `3fdc2ebf`; tag `R188` pending confirmation); owner acceptance pending.

Production instruction: the owner, 27 November 2026: "Push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. Deploy set: PWA Hosting only (`frontend-only`); the services stay on R187; no SQL, no backup.

Team: Byte (implementation), Echo (a quick visual check), Chase (a light review), Dewey (records). Archie: not applicable (a straightforward navigation change). Forge: applicable for the deployment only (DEV and PROD Hosting).

## Changes
Baseline `0178d511` (`main`, R187 closed). Scope:
- Phone bottom tab bar: Dashboard, Collection, Borrowers, Chat; the Payments tab leaves it.
- Menu drawer: a Payments entry.
- Behaviour note: the iPad portrait layout uses the bottom bar, so it now also shows four tabs with Payments in the drawer, in line with the owner's request.
- Unchanged: the desktop sidebar and the iPad landscape rail (they list every route); no API, SQL or service change. The drawer order is Payments, Referrers, Expenses, Upcoming, Cash, Management; the `aria-current` logic is unchanged.
- Files: `apps/pwa/src/live/LiveHeader.tsx` (one flag: `frequent:false` for payments); the `openPayments` helper in `tests/e2e/live-controls.ts`; the specs `phase5-final-ui-independent`, `rebate-offset-independent` and `chat.spec`.
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | lint, type check, live-dev build | Pass | `796e62a6` |
| Byte | `npm test` | 1,447 passed, 1 skipped | `796e62a6` |
| Byte | desktop-chromium and mobile-chromium specs, including the Thai bottom-bar fit at 320, 375 and 412 px; the mobile-webkit drawer path | 10/10; drawer path passes | `796e62a6` |
| Chase | review: one flag changed (`frequent:false` for payments in `LiveHeader.tsx`); the desktop sidebar and tablet rail list every route; the drawer order is Payments, Referrers, Expenses, Upcoming, Cash, Management; the `aria-current` logic is unchanged | Pass, no defects | `796e62a6` |
| Echo | iPhone visual check (local build, WebKit): iPhone 440 px, four tabs of 110 x 63 px in English and Thai, nothing clipped (the three-tab build gives 147 px tabs); Payments is the first drawer entry with the same icon and a 48 px row, shows the current-page mark when open, and no bottom tab is active; Back from a payment record works; the iPad landscape rail is unchanged | OK, no findings | `796e62a6` |
| CI | pull request `Development checks`, [run 45971787534](https://github.com/welct0407/MW-Credit-App/actions/runs/45971787534) (the one broad run on the head `cc5574d8`, merged as `3fdc2ebf` with an equal tree) | Success, all 17 jobs on the first attempt | `cc5574d8` |
| Forge | PROD runner reused evidence: Terraform run 44874582128 and database run 45947820575 | Reused (no `infrastructure/**` or SQL change) | – |
| Dewey | `npm run check:docs` at closure | 0 failures, 0 warnings | – |

## Not run
- Real iPhone and the iPhone Home Screen app; the PROD bottom bar is seen only after deployment.
- Database and service groups: no SQL or service input changed.

## Recovery
Git baseline `0178d511` (R187 closed). A frontend-only revert restores the five bottom tabs. No SQL, no backup.

## Open questions
- Owner acceptance of R188 in PROD, written into the next release's closure or product pull request.

## Remaining work
The pull request and its Development checks, the merge, the DEV deploy, the PROD promotion (Hosting only), the R188 tag and the closure pull request.
Owner acceptance of R188. Follow-up: the first real use of the new bottom bar on the owner's iPhone (no real-iPhone check was made).

## DEV deployment record (Forge, 27 November 2026 UTC)
Authority: the owner's "Push all the way to prod" (DEV first). Package: `main` `3fdc2ebf10a19b8bf6288b2613bdc97ebd0b954e` (PR #394); its tree equals the tested head `cc5574d8`; CI run 45971787534 passed all 17 jobs. Hosting only (`frontend-only`: the diff since R187 `e55efc50` touches only `apps/pwa`, `tests` and `project/` docs and outputs); the services stay on R187 `e55efc50`. No SQL: read-only readback at 09:33:38Z, V155, 155 rows, 0 failed.

| Step | Result |
| --- | --- |
| Build and deploy | Web build 09:28:49Z to 09:29:04Z (env file shredded); `--check` 17 files; deployed 09:29:04Z to 09:29:12Z: Hosting `0c7a947171d862a4`, release `1795771751881000` |
| Verified | The three origins serve R188 (index and entry 200, the entry contains `3fdc2eb`, `sw.js` no-store). WebKit check at iPhone 17 Pro Max (440 x 763), write-guard probe blocked, no writes: the bottom bar is exactly Dashboard, Collection, Borrowers, Chat; Payments is first in the drawer and opens; About shows R188 `3fdc2eb` |

Rollback: Hosting back to `603945c00ccda057`.

## PROD promotion record (Forge, 27 November 2026 UTC)
Authority: the owner, 27 November 2026: "Push all the way to prod". Scope: PWA Hosting only; no service image, SQL, backup, authenticated PROD read, financial write or notification.

Freeze (pinned here): package `main` `3fdc2ebf10a19b8bf6288b2613bdc97ebd0b954e` (PR #394, tree equal to the tested head `cc5574d8`); baseline tag R187 `e55efc50`; next unused number R190. The runner reused Terraform evidence from run 44874582128 and database evidence from run 45947820575. Package manifest (outside Git): `/root/.mw-private/MW-Credit-App/promotion/r188/promotion-package.json`, sha256 `c9d9be3b24b83c7443fa43219609873753c080b54679b1b5a3dd95f303a52748`, with a copy and the receipt in the operator-private bucket. The Hosting version is in the [Environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Hosting | Runner `--check` 18 files; `--apply` 09:34:23Z to 09:35:01Z: version `3250649b8b4fba9a`, release `1795772093747000` |
| Verified, read-only | The three origins serve R188 with `3fdc2eb`, `sw.js` no-store; `/health` of the services still reports R187 `e55efc50`; requests without a token get 401; no ERROR, 42501 or response of 409 or higher from the five services between 09:32:43Z and 09:35:14Z; no authenticated PROD read, financial write or notification |

Rollback: Hosting back to `d12cef58ba4c96a1` (release `1795760709542000`). The services were not changed.

## Tag record (Dewey, 27 November 2026)
Pending: the Release tag workflow for `R188` on `3fdc2ebf10a19b8bf6288b2613bdc97ebd0b954e` was dispatched; the run and the tag object are recorded here once received.

## Closure records (Dewey)
- Component versions: pending the tag (`derive --release R188 --commit 3fdc2ebf`, then `render --write` and `render --check`). Drift (`drift --env all`) is run by Forge; its result is recorded here when received.
- Environment inventory: the R188 Hosting rows for DEV and PROD (the R187 Hosting rows are now previous); the Cloud Run and Flyway rows are unchanged (services on R187, no SQL).
- Released wording: the R188 clause of the Solution design says Released.
- Pruned at closure (Open R189 has no note, plus the three newest Released: R188, R187, R186): `Change Logs/CHANGE_NOTES_R185_UIUX_REVIEW_FIXES_2026-11-25.md`, with its inbound links (release tracker, Development Changes, environment inventory, Solution design) repointed to permalinks at `3fdc2ebf`. R188's entry in Development Changes became its follow-up row.
