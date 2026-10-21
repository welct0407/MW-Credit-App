# Change notes — conversation assistant business rules draft, 21 October 2026

## Purpose
The owner decided to replace the Codex App Server behind the Partner conversation (the only runtime that stops if Codex stops) with Claude on Vertex AI, give the model a business-rules reference so it can answer open-ended questions (payoff mid-cycle, profit per borrower, ratios) from the encoded rules rather than guesses, and add a bounded read-only SQL tool. This batch holds the rules draft; implementation is handed to the PWA team session.

## Changes
- `src/mw_integration_agent/assets/conversation-business-rules.md` (new, owner-approved draft; moved here from `docs/CONVERSATION_BUSINESS_RULES.md` in the [Claude conversation batch](CHANGE_NOTES_CLAUDE_CONVERSATION_2026-10-21.md), where `docs/CONVERSATION_BUSINESS_RULES.md` is now a pointer): loan types, interest and charge rules, allocation, payoff (`loan_close_calculation_v83`), measures, default, corrections, income and profit, partner economics, cash, freshness, answer patterns, and nine open owner decisions with the defaults the assistant applies until decided. Every rule cites its migration line.

## Checks
| Command | Result |
| --- | --- |
| Rules read from `database/migrations` V1–V100, `database/current/public-functions.sql`, `services/**`, `project/Documents/**` by four read-only research passes | Cited inline as `V<n>:<line>` |
| `npm run check:docs` | See the session record |

## Not run
- Nothing executed against DEV or PROD; no code changed.

## Recovery
- Delete the rules file (now `src/mw_integration_agent/assets/conversation-business-rules.md`) and this note; the Claude conversation batch depends on the file as its system-prompt reference.

## Open questions
- None. The owner decided the nine section-15 points on 21 October 2026 (closed-loan remaining collectable unless defaulted; Loan Close as coded with no gap interest when a charge exists today; mid-cycle principal as coded; explain newest-first allocation and the whole-percent rate; the stated defaults for the rest).

## Remaining work
- Implementation (Claude on Vertex AI provider, local conversation history, read-only SQL tool, catalogue and docs) in the team session; the rules file is packaged as the Claude provider's system-prompt reference.
