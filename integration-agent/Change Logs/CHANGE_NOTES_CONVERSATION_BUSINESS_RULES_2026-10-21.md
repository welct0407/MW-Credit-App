# Change notes — conversation assistant business rules draft, 21 October 2026

## Purpose
The owner decided to replace the Codex App Server behind the Partner conversation (the only runtime that stops if Codex stops) with Claude on Vertex AI, give the model a business-rules reference so it can answer open-ended questions (payoff mid-cycle, profit per borrower, ratios) from the encoded rules rather than guesses, and add a bounded read-only SQL tool. This batch holds the rules draft; implementation is handed to the PWA team session.

## Changes
- `docs/CONVERSATION_BUSINESS_RULES.md` (new, owner-approved draft): loan types, interest and charge rules, allocation, payoff (`loan_close_calculation_v83`), measures, default, corrections, income and profit, partner economics, cash, freshness, answer patterns, and nine open owner decisions with the defaults the assistant applies until decided. Every rule cites its migration line.

## Checks
| Command | Result |
| --- | --- |
| Rules read from `database/migrations` V1–V100, `database/current/public-functions.sql`, `services/**`, `project/Documents/**` by four read-only research passes | Cited inline as `V<n>:<line>` |
| `npm run check:docs` | See the session record |

## Not run
- Nothing executed against DEV or PROD; no code changed.

## Recovery
- Delete the two files of this batch; nothing else depends on them yet.

## Open questions
- Section 15 of the reference lists the owner decisions (profit definition, payoff for Fixed and Installment loans, closed-loan remaining balances, first-day net-off in "total paid", Loan Close edge cases, default reporting, mid-cycle principal, allocation order, whole-percent rate).

## Remaining work
- Implementation (Claude on Vertex AI provider, local conversation history, read-only SQL tool, catalogue and docs) in the team session; the rules file becomes the system-prompt reference once the owner confirms section 15.
