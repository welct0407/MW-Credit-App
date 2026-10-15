# Schedule consistency simulation — 25 September 2026

## Scope and purpose

Owner requested a production-data simulation of settlement detection through disabled charge generation and deviations between recorded charges and loan setup. Discussion only: no database, AppSheet or Metabase changes, no release scope/promotion action.

## Changed files and evidence

- `scripts/analysis/simulate_schedule_consistency.py`: read-only source capture, offline counterfactual calculation, anchor-aware comparison, sensitivity scenarios and private detailed Markdown output.
- `outputs/schedule-consistency-20260925/README.md`: sanitized methodology, aggregate results, validation and limitations.
- Identifiable 23-borrower/52-loan snapshot and reports reside outside Git in the approved external project folder. User-visible results include actual names and relevant amounts as authorized.

## Results and checks

Three known settlement cases and one additional candidate identified. Same combined set across 70/80/90% cutoffs and 7/14/30-day windows. Future plan inspection distinguishes deferral from interest reduction; the unconfirmed candidate is not established hardship. Existing category counts 6/9/3/5 become 4/9/5/5 when applying the gate only to owner-confirmed cases, or 4/8/5/6 if including the unconfirmed candidate. Order: Star/Cash Cow/Question Mark/Dog.

Target/read-only identity, live charging source parity, charge aggregate reconciliation, cohort coverage and four synthetic schedule boundary checks passed. An anchor-related false positive in the naive comparison was diagnosed and removed from the adjusted comparison. Offline replay passed; all live inputs remain unchanged.

## Rollback and status

Starting commit `db3e77ce3a3bff84041b4b3a61537c3316907a10`; unrelated pre-existing untracked Risks design and R026 analysis preserved. Revert only these analysis files to remove local tooling; no live rollback necessary. Simulation complete for owner discussion. No system implementation authorized or performed in this task. Confirming the additional candidate and choosing final classification policy remain owner discussion items, not missing simulation execution.
