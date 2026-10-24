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
| Pull request #119 `Development checks`, merged as `6ea1540` | Passed (agent test and lab) |

## Not run
- No live Partner turn has run under grounding yet; Chase replayed the 6 real turns of the day offline. The first real turn is the follow-up in Development Changes.
- The model comparison was not repeated after the guidance fixes; speed is unmeasured (Vertex slowness).
- Documented limits of the check: ฿0 is always accepted; the sign is not checked; a wrong but observed figure passes; and the sum-and-difference rule is broad, so on wide turns it stops invented non-round amounts but not every round slip. It is a guard against invented figures, not proof that a figure is right.

## Recovery
- Config only: set `conversation_grounding` to `audit` (log only) or `off`, with the config-only change in [Operations](https://github.com/welct0407/MW-Credit-App/blob/feca47b2849dbdc881ac881cb58ce7ff91862c9f/integration-agent/docs/OPERATIONS.md#partner-conversation-provider-activation-and-rollback). Code: revert the R088 commit; no schema or data changed.

## Open questions
- Decided for deployment: `conversation_grounding=enforce`, because the owner's priority is correctness and the check had 0 false rejections on real data.
- Which model to run (`gemini-4-argon` or `gemini-3.8-flash`), after a fair rerun of the comparison with the fixes.

## Remaining work
- The first real turn under grounding: record the `grounding_passed` and `ungrounded_amounts` events (one follow-up row in Development Changes).
- The fair `gemini-4-argon` against `gemini-3.8-flash` rerun: 3 runs each of the six questions, at a quiet time, with grounding in `audit` for the test only; pending the owner's timing (one follow-up row).

## Promotion record

Release R088, agent only (code only: no migration, no catalogue or config change), 21 October 2026 (UTC). Tag `R088` on `6ea1540907d7da04acd9ac032263dc21d18e043d` (Release tag workflow started by the orchestrator).

- **Authority:** the owner approved the number check, the guidance fixes, the shorter reply target and the column guidance ("Yes"), then instructed the production deployment ("Deploy it", 21 October 2026); `conversation_grounding=enforce` was chosen on the 0 false rejections of Chase's replay. Owner acceptance was not given separately; it is recorded as the production instruction, as for R084 to R086.
- **Package:** pull request #119 merged as `6ea1540`; CI passed (agent test and lab).
- **Deployment (UTC):** operator file and checkout update 20:06:00Z to 20:06:06Z; dry-run 20:06:06Z (no migration missing, 8 of 8; catalogue 31 on both sides; no unit changes; 5 modules plus the new `conversation_grounding.py`); freeze 20:06:17Z (`runtime-20261021T200617667134Z`); install 20:06:18Z; activate 20:06:23Z to 20:06:27Z (probe `fd7c4bea-2f87-4bda-8d66-3c16b623f956`); operator file shredded 20:06:40Z.
- **Verification:** `/ready` reports `6ea1540`, started 20:06:25.22Z; no failed units, 8 timers, both wake paths active, `check` ok; the recognizer was restarted and its health is ok; the next cycle was ok. `conversation_grounding` is absent from the live config, so the default `enforce` applies.
- **Previous live code:** `bf11e408` (R087), an ancestor of the new commit.
- **Recovery:** `deploy-runtime.py rollback --commit 6ea1540…` restores `bf11e408a9786963faa616fb839e890b016523f2` from `runtime-20261021T200617667134Z`; or set `conversation_grounding` to `audit` or `off` by the config-only route. Pins go to the [environment inventory](../project/Documents/Environment_Inventory.md).
- **Outcome:** applied and verified (`/ready`, units, cycle); owner acceptance is the owner's production instruction. The first real turn under grounding is the check.

### Closure pruning (release workflow, 21 October 2026)
- Nothing deleted. The retention window is now R088, R087 and R086 and no root change note is outside it. The agent change notes of R085 and R084 stay (current documents link them, and agent change notes are not pruned, as at the R084 and R086 closures). The R088 Development Changes row became two follow-up rows.
