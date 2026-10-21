# Change notes — number grounding of Partner replies (R088), 21 October 2026

## Purpose
The owner was concerned about wrong numbers in Partner replies: "How could they get answers wrong? It should be just based on the fact and data". A comparison of the two Gemini models showed invented and mislabeled figures even though the headline figures were right. The owner approved a number check, the guidance fixes, a shorter reply target and the column guidance ("Yes"). The model choice is deferred to a fair rerun of the comparison.

## Changes
A/B test facts (Forge and Chase, 21 October 2026): 12 synthetic runs on PROD, read-only, 70 Gemini calls, `gemini-4-argon` against `gemini-3.8-flash`. No borrower names or amounts are kept here; borrower data stays out of Git.
- Both models were right on the headline figures.
- `gemini-4-argon` invented a first-day charge total (about ฿5,030 in one answer, which no observation supports), labeled recorded charges as forecast, and had 5 length refusals (replies over 1,000 characters sent back by `finish`).
- `gemini-3.8-flash` left out one scheduled charge, because it followed the "next 1-2 charges" guidance, and had 2 SQL errors from guessed column names.
- The speed comparison is inconclusive because Vertex was slow during the test. The fair rerun decides the model.

Design (Byte; agent only, no migration, no database change):
- `conversation_grounding.py` (new, pure module) and `conversation_tools.py`: the `finish` call checks every amount in the reply against this turn's tool results and the Partner's own message, for every provider. The check runs after the length gate and before authorization.
- What is checked: money amounts (`฿`, `บาท`, baht, THB), rates per day and percents. Dates, times, the as-of line, years, list numbering, long IDs and plain counts are removed first and never checked. Seeded earlier-conversation amounts never ground a figure.
- An amount is grounded when it is an observed value, a sum or difference of observed amounts, a column total (prefix, suffix and grouped totals, the sum of `loan_payoff` amounts or `sum_field` totals), a subset sum of a short column, a product of a rate and a count written in the same formula line, or an observed amount plus a derived total. Percents are grounded when observed or equal to 100 x a / b for a large pool value. Money matches exactly or by whole-baht rounding. Zero is always grounded.
- New config `conversation_grounding`: `enforce` (default), `audit` or `off`; validated. `enforce` rejects the finish and tells the model which amounts have no source (attempt N of 3); the third rejection fails the turn with `FINISH_UNGROUNDED_EXCEEDED` and the durable failure reply. `audit` runs the same check and only logs; `off` skips it.
- Audit events on the `finish` call: `grounding_passed` and `ungrounded_amounts`. They record the rejected amounts, classes, candidate counts, grounding-set size, truncation flag and elapsed time, not reply text.
- `gemini_conversation.py`: `gemini-3.8-flash` joins the model allow-list, so switching the model is a config-only change.
- `conversation_session.py`, `assets/conversation-business-rules.md` (guidance): every stated amount must come from this turn's tool results or be a sum, difference or rate x days of them; use only column names in the schema digest; a `Recorded` future charge is "scheduled" and a `Projected` one is "forecast"; a first-day charge is mentioned only when a charge dated on the loan date is in the observations; the upcoming charges answer lists every future charge, not the next 1 to 2; reply target about 600 characters and at most 12 lines (hard limit stays 1,000); an offer line only when the answer had to be cut.
- `config.example.json`: `conversation_grounding: enforce`.
- Tests: `tests/test_conversation_grounding.py` and the corpus in `tests/fixtures/grounding-corpus/` (the 12 replies of the comparison against source rows).

Documentation (Dewey): `integration-agent/docs/PARTNER_CONVERSATIONS.md` (setting, check, events, models, reply length), `integration-agent/docs/OPERATIONS.md` (switching the model and the grounding mode), `project/Documents/Development_Changes.md` (R088 row), `project/Documents/Release_Tracker.md`.

## Checks
| Command | Result |
| --- | --- |
| Byte's checks of the batch (tree on `74ee3f22` plus the batch): ruff; `scripts/build-schema-digest.py --check`; grounding tests; focused tests; `python -m unittest discover -s tests` | ruff passed; digest check exit 0; grounding tests 35 OK (corpus included); focused 160 OK, 1 skipped; unit discover 792 OK, 98 skipped |
| Corpus verdicts (`tests/test_conversation_grounding.py`, `CorpusTests`; Byte) | The corpus is anonymised (synthetic borrower labels and ids, amounts scaled by a whole-number factor per question). Of the 12 comparison replies 11 pass and the invented first-day amount is rejected. Mutation pass over each money amount: +1 rejected 256 of 256; x10 rejected 153 of 256 (the misses land on observed values or exact sums). Per-reply timing 1 to 3 ms |
| `PYTHONPATH=src python3 -m unittest discover -s tests -p test_conversation_grounding.py` in `integration-agent/` (Dewey, earlier tree, before Byte's last fixes) | 29 tests OK; superseded by Byte's 35 |
| Chase verification on the 6 real PROD turns of 21 October (read-only; the data was shredded afterwards) | 0 false rejections over about 220 amounts; 2 to 9 ms per check. Adversarial findings B1 to B4 (month words, `฿ 2569`, "As of" lines dropped, unrecognised formats) and D1 (CLARIFY and REFUSE replies are checked) were fixed by Byte; the third rejection now tells the model it is final |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings |
| Pull request `Development checks` | Pending: CI run after the orchestrator pushes |

## Not run
- No live Partner turn has run with grounding yet; Chase replayed the 6 real turns of the day offline. The `audit` mode exists to measure the live rejection rate if the owner wants.
- The model comparison was not repeated after the guidance fixes; speed is unmeasured (Vertex slowness).
- Documented limits of the check: ฿0 is always accepted; the sign is not checked; a wrong but observed figure passes; and the sum-and-difference rule is broad, so on wide turns it stops invented non-round amounts but not every round slip. It is a guard against invented figures, not proof that a figure is right.

## Recovery
- Config only: set `conversation_grounding` to `audit` (log only) or `off`, with the config-only change in [Operations](../integration-agent/docs/OPERATIONS.md#partner-conversation-provider-activation-and-rollback). Code: revert the R088 commit; no schema or data changed.

## Open questions
- Decided for deployment: `conversation_grounding=enforce`, because the owner's priority is correctness and the check had 0 false rejections on real data.
- Which model to run (`gemini-4-argon` or `gemini-3.8-flash`), after a fair rerun of the comparison with the fixes.

## Remaining work
- A pull request with CI and the owner's promotion instruction.
- The fair model rerun.
