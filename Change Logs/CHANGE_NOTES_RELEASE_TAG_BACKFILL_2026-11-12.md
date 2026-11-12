# Change notes — release tags R001 to R058 restored, 12 November 2026

## Purpose
The owner asked to refill the release tags before R059, since R001, with release dates as accurate as possible and not as if released today. The merged repository had tags from R059 only.

## Changes
- 53 annotated tags created on `main` history: R001 to R058 without R012, R016, R026, R055 and R056. Each has a GitHub Release whose first line states the release date.
- R009 to R058 (45 tags) copy the tags of the archived `AppSheet-Loan-Project` repository: same commit, same message, and the tag date set to the original tag time. The archived `MW-Integration-Agent` tag R058 points at a commit that is not in this repository's history, so the project tag was used.
- R001 to R008 (8 tags) never had a tag. Each is on the commit that closed the release and carries that commit's time: R001 `90db4d37`, R002 `cde65669`, R003 `1e7acaf0`, R004 `a6a7821c`, R005 `52078f3c`, R006 `233d382b`, R007 `7fea96e7`, R008 `ddd48886`. The owner approved this list.
- No tag for R012 (cancelled, merged into R011), R016, R055 and R056 (listed under Releases requiring action) and R026 (closed with partial deployment, never tagged).
- Thirteen tags (R009 to R011, R013 to R015, R017 to R023) were first created through the normal Release tag workflow and so carried the date 12 November 2026. With the owner's approval they and their GitHub Releases were deleted and recreated on the same commits with the original dates. No tag points at a different commit than before.
- Mechanism: a temporary backfill job in `.github/workflows/release-tag.yml`, `scripts/promotion/backfill-release-tags.sh` and its manifest, added in commit `20b99d0c` on branch `claude/kind-rubin-6uskg7`, run from that branch (runs 43227000444 dry run, 43227179045 real) and reverted in `a48b262f`. The owner chose the branch run; `main` never carried the job. The [manifest](https://github.com/welct0407/MW-Credit-App/blob/20b99d0c4d38079676d13a12443003d57ff32370/scripts/promotion/backfill-release-tags.json) lists every tag, commit, date and message.
- `project/Documents/Release_Tracker.md`: the R058 row's tag is `R058`; one line records the restored tags.
- GitHub limit: a Release page shows the day it was published, 12 November 2026, and that cannot be set. The release list is ordered by the tag date, so R001 to R058 sort in release order before R059.

## Checks
| Command | Result |
| --- | --- |
| Backfill script against a local copy of the remote with a stub `gh` | 53 tags created, 13 of them replacements; dates, commits and messages equal the manifest; a second run changed nothing |
| Workflow dry run 43227000444 | Success: every commit found and on `main`, the 13 existing tags accepted as approved replacements |
| Workflow run 43227179045 | Success |
| Tags fetched from `origin` compared with the manifest | 53 checked, 0 mismatches (tag date, commit, message) |
| GitHub Releases list | 140 releases (87 before); R009 `created_at` 2026-09-19T15:02:54Z, the original tag time |
| `npm run check:docs` | Pass, 0 failures (local, before commit) |

## Not run
No application, database or agent checks; nothing deployable changed. `component-versions.mjs derive` was not run for the restored tags, so their GitHub Releases have no Component versions section.

## Recovery
Tags are not moved or deleted. If one is wrong, the owner decides; the original tag objects remain in the archived `AppSheet-Loan-Project` repository.

## Open questions
None.

## Remaining work
None.
