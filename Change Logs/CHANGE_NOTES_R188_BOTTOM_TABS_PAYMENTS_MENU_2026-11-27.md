# Change notes — R188 Payments moves to the menu, 27 November 2026

## Purpose
Owner request of 27 November 2026 (verbatim): "I hardly use the payment page in the bottom buttons. Let's move it to menu, leave only 4 at the bottom". On a phone the bottom tab bar becomes Dashboard, Collection, Borrowers and Chat, and Payments moves into the menu drawer. The desktop sidebar and the tablet rail are unchanged. Status: Open, not yet implemented; promotion is not authorized (the owner has not asked for production for this batch).

Team: Byte (implementation), Echo (a quick visual check), Chase (a light review), Dewey (records). Archie: not applicable (a straightforward navigation change). Forge: not applicable until a deployment is authorized.

## Changes
Baseline `0178d511` (`main`, R187 closed). Scope, to be completed from Byte's diff:
- Phone bottom tab bar: Dashboard, Collection, Borrowers, Chat; the Payments tab leaves it.
- Menu drawer: a Payments entry.
- Unchanged: the desktop sidebar and the tablet rail; no API, SQL or service change is planned.
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Command | Result |
| --- | --- |
| (to be filled by Byte, Chase and Echo, each check once, with the commit or CI run) | – |

## Not run
Nothing has been run for this batch yet.

## Recovery
Git baseline `0178d511` (R187 closed). A frontend-only revert restores the five bottom tabs. No SQL, no backup.

## Open questions
- Promotion is not authorized yet. The owner has not given a production instruction for R188.

## Remaining work
Implementation (Byte), Echo's visual check, Chase's light review, the documentation pass (Dewey); then a production instruction from the owner before any deployment.
