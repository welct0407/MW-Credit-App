# Change notes — MW Credit Evolution timeline page, 12 November 2026

## Purpose
The owner asked for a graphic timeline of the loan app and its ecosystem from the AppSheet era to today, and then to save the HTML file in the repository.

## Changes
- New `project/Documents/MW_Credit_Evolution.html`: one self-contained page (inline CSS and JavaScript; only the fonts load from Google Fonts). It has a to-scale swimlane chart of 13 ecosystem parts with commits and releases per day, a then-and-now table, and about 55 dated milestones in five eras, filterable by category.
- Sources: this repository's full commit history (which contains the imported AppSheet-Loan-Project and MW-Integration-Agent histories), the archived MW-AI-Collection and MW-Partner-Operations repositories (read-only), the release tracker at earlier commits, and the change notes. Commit counts exclude merges. Release dates before R059 come from the release tracker, later ones from Git tags.
- `project/Documents/README.md`: one line links the page as a dated snapshot outside the per-batch maintenance set.
- The same page is published as a private Claude artifact for the owner.

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
