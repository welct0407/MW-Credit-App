# Change notes — R179 hold reply names the borrower, 21 November 2026

## Purpose
Owner request of 21 November 2026: a reviewer can reply to a hold alert for a slip whose borrower the agent could not identify with the borrower's name, and the slip is then processed the normal way (automatic when it can be, a review with options when it needs one). Build and test are authorized; PROD promotion is not yet authorized.

Evidence (read-only, PROD, 6 to 20 November 2026, aggregates only): borrower-identity holds were mostly PAYER_UNRESOLVED (9) and PAYER_NAME_UNREADABLE (1). To be filled.

## Changes
To be filled (hold reply handling, name resolution to one AI-enabled borrower, re-run through the normal path, re-ask for an unknown or ambiguous name, audit of the reviewer's choice, config switch if any).

## Checks
| Command | Result |
| --- | --- |
| To be filled by Byte, Echo and Chase | |
| `npm run check:docs` | To be run by Dewey after the implementation lands |

## Not run
To be filled. PROD promotion and any live financial write are not authorized.

## Recovery
Git baseline `main` `5a418ab4` (R178 closure). No deployment has happened.

## Open questions
To be filled.

## Remaining work
Design (Archie), implementation (Byte), tests (Echo), review (Chase), then documentation and this note.
