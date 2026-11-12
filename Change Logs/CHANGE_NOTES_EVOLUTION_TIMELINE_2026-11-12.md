# Change notes — MW Credit Evolution timeline page, 12 November 2026

## Purpose
The owner asked for a graphic timeline of the loan app and its ecosystem from the AppSheet era to today, and then to save the HTML file in the repository.

## Changes
- New `project/Documents/MW_Credit_Evolution.html`: one self-contained page (inline CSS and JavaScript; only the fonts load from Google Fonts). It has a to-scale swimlane chart of 13 ecosystem parts with commits and releases per day, a then-and-now table, and about 55 dated milestones in five eras, filterable by category.
- Sources: this repository's full commit history (which contains the imported AppSheet-Loan-Project and MW-Integration-Agent histories), the archived MW-AI-Collection and MW-Partner-Operations repositories (read-only), the release tracker at earlier commits, and the change notes. Commit counts exclude merges. Release dates are the dates on the Git tags.
- `project/Documents/README.md`: one line links the page as a dated snapshot outside the per-batch maintenance set.
- The same page is published as a private Claude artifact for the owner.
- Update later the same day, after the [release tags R001 to R058 were restored](CHANGE_NOTES_RELEASE_TAG_BACKFILL_2026-11-12.md): releases per day now count the tags (24 September 10, 13 October 1), the header shows 140 tagged releases instead of 144 releases, "Upcoming charges" is dated 29 September, the report burst reads 27 tagged releases, a 12 November entry records the restored tags, and the sources note lists the five numbers without a tag (R012, R016, R026, R055, R056).

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | Pass, 0 failures (local, before commit) |
| Browser render of the page at 1280 px light and dark and 400 px light (Chromium) | No console errors, no horizontal page overflow |

## Not run
No application, database or agent checks; the batch adds one static document and two documentation edits.

## Recovery
Revert this commit.

## Open questions
The AppSheet apps were in use before 29 August 2026, the date of the earliest record. The page says so and shows no earlier start date.

## Remaining work
None. The page is a snapshot of 12 November 2026 and is not updated per release.
