# Change notes — chat group lines re-pin their loan version (R139), 10 November 2026

## Purpose
After R138 the owner showed a PROD chat card where two "Edit loan · Automatic charges Yes to No" lines failed `source_conflict`; the owner then said "Yes, fix it and push into production. I've manually updated the flags for the two loans". A group confirm must not fail a loan line only because an earlier line of the same card changed that loan.

## Changes
- Cause (Archie, read-only PROD logs): a group of 32 lines was created at 08:48:50Z and confirmed 26 s later. Lines 1 to 10 (`charge.delete`) were done, lines 11 and 12 (`loan.update`) failed `source_conflict`, lines 13 to 32 (`charge.create`) were done. `loan.update` pins `expectedVersion` when the card is proposed. `pwa_loan_version_v2` hashes the loan row plus its charges and repayments, so the earlier deletes changed it. `pwa_charge_version_v2` includes the loan row, so reordering the lines cannot fix it, and the `DUPLICATE_TARGET` rule only compares targets. Pre-existing since R106 D12; the owner corrected the two flags by hand.
- Fix (Byte, chat service only; no SQL, PWA or infrastructure change), reworked after Chase's first review (6 defects, now addressed; a lab on V141 showed that a charge delete or create changes only the loan's version, while a loan-row update changes the versions of all its charges). The first design, a field-by-field comparison, is replaced by carry-forward versions in `executeGroup` (`services/chat/proposals.mjs`): at Confirm start the card reads the version of each affected line, which must equal the pinned one (else `source_conflict` as before). Around each earlier line it reads again and carries the new version forward only if the before-read matched the carried one, so only the group's own writes are absorbed. Scope: a loan line (`loan.update`, `loan.delete`, `loan.undo-default`) is carried after earlier charge lines on its loan (a moving `charge.update` counts for both loans); a charge line (`charge.update`, `charge.delete`) only after a `loan.update` on its loan; `charge.create` is unversioned; payments affect nothing; old cards without `card.target.loanId` are never carried. An unknown outcome or a failed read stops carrying: the line posts its pinned version and the database refuses it. First attempt only, with the Partner's own token, same request id and inputs; the log event `chat_proposal_repinned` carries the from and to versions. Not re-pinned: `loan.close`, `loan.book-projected-charge`, `loan.default` and `loan.generate-charge`.
- Charge cards now carry `card.target.loanId`, so Confirm all knows which loan a done `charge.delete` changed (`services/chat/proposals.mjs`, `services/chat/handler.mjs`).
- Tests (Byte): `tests/unit/chat-proposals.test.mjs`, `tests/unit/chat-handler.test.mjs`.
- Records: `project/Documents/Solution_Design.md` (R106 group paragraph), `project/Documents/Release_Tracker.md` (R139 scope), `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| lint, typecheck (Byte) | Pass |
| Focused chat unit tests (Byte, after the rework) | Pass, 85 of 85 |
| `npm test` (Byte, after the rework) | Pass, 1270 pass, 1 skip |
| Chase diff review | First review: 6 defects, addressed by the rework; re-review TBD (Chase) |
| CI (`Development checks`) | TBD (run id) |
| DEV deployment and test | TBD |
| PROD promotion | TBD |
| `npm run check:docs` | TBD (Dewey, final run) |

## Not run
No deployment yet. No e2e or PROD check; the PWA is unchanged.

## Recovery
Git baseline: `afd5d329` (the commit before this batch). Service only: roll back the chat image (settings generation in the environment inventory once deployed). A card proposed before the change behaves as before, except that it is re-pinned when confirmed after the deploy.

## Open questions
None.

## Remaining work
- Chase's review, CI, then the DEV deployment and test, then PROD under the owner's instruction; a chat image change only is expected (no SQL, Terraform setting or Hosting).
- Accepted limits: a millisecond race window around an earlier line's POST; after "Confirm N remaining" the lines done in the earlier run are not carried, so such a line fails as before R139.
- Known limit: `loan.close`, `loan.book-projected-charge`, `loan.default` and `loan.generate-charge` are not re-pinned, so such a line after a change to its loan in the same group can still fail `source_conflict`; the Partner re-proposes it.
