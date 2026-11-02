# Change notes — R113 agent options text for a settling remainder, 2 November 2026

## Purpose
R113 (owner, 2 November 2026: Receive payment closes the loans it settles) lets the app settle a loan from Receive payment. The agent keeps refusing a settle (Archie's resolution (d)); its options request now points to the app instead of Loan Close.

## Changes
- `review_proposal.py`: a principal option whose remainder reaches the loan's payoff (the plan's `settles`, or the R113 blocked reasons `needs_gap_interest` / `exceeds`), or a loan only a settle can take (option kind null with `payoffRemainder` within the remainder), is a refused option with reason `settles` and its loan key.
- `partner_review.py`: the refused-option line reads "Remainder settles <loan key>: record in the app." (Thai: "ยอดคงเหลือปิด <loan key> ได้: กรุณาบันทึกในแอป").
- `docs/PARTNER_REVIEW.md`: the refused-option sentence.

## Checks
| Command | Result |
| --- | --- |
| Agent tests (`python -m unittest discover -s tests`) | Pass except Chase's text assertion for the old "Use Close Loan." line (Chase updates it) (Byte) |
| `ruff check integration-agent` | Pass (Byte) |

## Not run
No VM deploy; the options reply stays behind `pay_forward_options_enabled`.

## Recovery
Revert the batch commit.

## Open questions
None.

## Remaining work
Chase's verification.
