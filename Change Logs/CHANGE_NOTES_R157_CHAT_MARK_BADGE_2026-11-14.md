# Change notes — Chat mark badge (R157), 14 November 2026

## Purpose
Owner request of 14 November 2026: "the new summary icon is not obvious enough. let's update it's color, and maybe size as well, so it can be visible easily." The owner chose Echo's variant B ("B: blue circle badge") and said "Yes, straight to PROD", which approves the release to PROD.

## Changes
As built (Byte): CSS only, in `apps/pwa/src/live-style.css` and `apps/pwa/src/style.css`. The first version (a 22px inline badge with `vertical-align:-4px`) made the mobile-chromium tile 2px taller on CI fonts (`Development checks` run 43585417572 on `7d745eea` failed), because the badge grew the line box. Fix: `margin:-4px 0 -4px 6px; vertical-align:middle` in both files, so the badge counts as 14px for the line but still draws 22×22, centred on the last word; a new e2e check confirms the badge is not clipped. PWA Hosting only: no SQL, services, agent or data change.
- The Collection list's new-summary mark goes from a 16px grey (`#555`) outline chat icon to a 22px filled blue (`#0b57d0`) circle with a white chat icon (stroke 2.5). The blue is the same as the card's Open chat link. Tile heights are unchanged, contrast is 6.4:1 and the screen-reader text is unchanged. The mark's rule is unchanged.
- Variants considered: A (a 20px blue outline icon) and C (the badge plus a Thai "new" pill; rejected because it adds a line on long names and misaligns the Thai baseline).
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `Development_Changes.md`, `Solution_Design.md` (the R150 statement that the list mark colour is unchanged is superseded).
- Not changed: SQL, services, the agent, the Data Dictionary and the inventory (pins at closure).

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey) | Pass |
| e2e `collection-chat-summary` and `collection-chat-seen-sync`, desktop-chromium, mobile-chromium and mobile-webkit | 24 passed, 0 failed. New asserts: background `rgb(11,87,208)`, white icon, 50% radius, 2.5px stroke, 4px padding, 22×22 size, tile height unchanged within 1px against a tile without the mark. The "mark on the last word's line" check now uses the icon's vertical centre within the word's line, because the 22px circle overhangs the text box by 1px (accepted by the orchestrator) |
| `Development checks` run 43586671406 on `221cf15d` | Green (check, lint, 3 Chromium and 3 iPhone WebKit e2e) |
| PROD verification | Pass, see the PROD promotion record |
| `Development checks` run 43585417572 on `7d745eea` | Failed: the mobile-chromium tile with the badge was 2px taller on CI fonts; fixed as described above |
| Font matrix (DejaVu, Liberation, Noto, serif, monospace, system-ui) on three projects (temporary probe, removed) | Equal tile heights |
| `npm run typecheck`, `npm run lint` | Typecheck clean; lint 1 pre-existing info |
| Review | Echo designed the variant and reviewed screenshots; no separate review round, and Chase is not needed for a CSS-only change |

## Not run
The pull request's `Development checks` and the PROD smoke follow the promotion.

## Recovery
Git baseline `ec0812da` (R156 closure). PWA only: redeploy the R156 Hosting version recorded in the environment inventory.

## DEV deployment record (Forge, 14 November 2026 UTC)
Authority: the owner's request, "the new summary icon is not obvious enough. let's update it's color, and maybe size as well, so it can be visible easily.", the choice "B: blue circle badge (Recommended)" and the release approval "Yes, straight to PROD (Recommended)". Package `a4b27e0e62f51ef8c615ba23fae4b668a1be028b` (merge of PR #324), deployed from a clean worktree (git archive); CSS only. CI: `Development checks` run 43586671406 on `221cf15d` (check, lint, 3 Chromium and 3 iPhone WebKit e2e; terraform skipped); the earlier failed run 43585417572 on `7d745eea` was fixed by `221cf15d`. No image was rebuilt (DEV read, command and chat stay on the R155 image `e1a30fff…`).

| Item | Record |
| --- | --- |
| Hosting | Build R157 `856b579a3d7246b819247c82`, version `f0e4616d655e9b77`, release `1794654028006000`, 11:00:19Z to 11:00:28Z |
| Smoke | Three origins R157; `sw.js` no-store; unauthenticated 401 |

Rollback: Hosting `8a1142ca2d1c548f` (R156).

## PROD promotion record (Forge, 14 November 2026 UTC)
Authority: the same owner request and approval. Frontend only: no SQL, backup, image, agent or data write. Freeze 11:00:39Z, package `a4b27e0e`, baseline R156 `04ae87b5`. Resulting versions: PWA R157; read, command and chat R155; notify and jobs R144; schema V149; agent R153.

| Step | Result |
| --- | --- |
| Baseline | Flyway 149 (verify 11:01:38Z clean); read `00061-n4n`, command `00066-njp`, chat `00045-7gr` (R155 image `9c14d2d6…`); notify and jobs R144; Hosting `91da4b928cdc9f62` (R156) |
| Hosting | The generic runner, frontend-only. Receipts: run 43586671406 (check, e2e), the terraform job of run 43567610544 and the database groups of run 43567594376 (no infrastructure or database input changed since); `--check` passed (18 files); `--apply` 11:02:07Z to 11:02:44Z: version `d7d294ca31f8048a`, release `1794654157162000`, build R157 `9a2f8d0074ced5c14148a27c` |
| Smoke | Three origins R157; `sw.js` no-store; unauthenticated 401; the services' `/health` R155 `44efb437` (unchanged); no ERROR logs after 11:00Z |
| Tag | `R157` on `a4b27e0e` (Release tag run [43588140248](https://github.com/welct0407/MW-Credit-App/actions/runs/43588140248), 11:02:57Z to 11:03:22Z; tag object `7e64ef21…` peels to `a4b27e0e`) |
| Closure | Components: PWA R157; read, command and chat R155; schema R154 at V149; agent R153; notify and jobs R144. Drift 11:03:25Z: 0 drift, 2 unverified (Grafana, Metabase). No dictionary capture |
| Pruned | `Change Logs/CHANGE_NOTES_R154_GROUP_INVITE_LINK_2026-11-14.md` (R154 is outside the three most recent Released releases; inbound links in the tracker, inventory, Development Changes and `database/README.md` repointed to the permalink at `a4b27e0e`) |

Rollback: Hosting `91da4b928cdc9f62` (R156). No database or service step.

Limitations: the owner checks that the mark is easy to see on the devices in use.

## Open questions
None.

## Remaining work
Owner acceptance.
