# Change notes — R181 Instagram options offer closing loans, 21 November 2026

## Purpose
Owner request of 21 November 2026: a borrower's slip equalled the combined payoff of two open loans but the Instagram request offered no way to close them. The request now offers closing one or several loans, on the Reviewer's approval. Design and build are authorized; PROD promotion is not yet authorized.

Evidence (read-only, PROD, 21 November 2026): a 3,300 slip equal to both principals plus the day's interest; the review was "Pay forward options" with an empty principal list and both loans blocked with reason `settles`; only pay forward and recheck were offered.

## Changes
To be filled: agent (`review_proposal.py` combined-payoff detection and the close-loans choice, request text, `loan_settle_options_enabled` default off), the agent receipt command `settle` (schemaVersion 11), the shared SQL migration (no table or column), the command service, tests and documents.

## Checks
| Command | Result |
| --- | --- |
| To be filled by Byte, Echo and Chase | |
| `npm run check:docs` | To be run by Dewey after the implementation lands |

## Not run
To be filled. PROD promotion and any live financial write are not authorized.

## Recovery
Git baseline `main` `e88337ee` plus the acceptance commit `24836460`. No deployment has happened.

## Open questions
To be filled.

## Remaining work
Design (Archie), implementation (Byte), tests (Echo), review (Chase), then documentation and this note.
