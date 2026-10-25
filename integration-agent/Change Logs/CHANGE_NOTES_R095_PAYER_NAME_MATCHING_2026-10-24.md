# Change notes — R095 payer-name matching in the agent, 24 October 2026

## Purpose
Receipts do not always arrive in the borrower's own 3-member group (a partner forwards a slip in a direct message; a referrer and referee share a 4-person group), so the agent could not tell who paid. Owner request, 24 October 2026. The borrower column `Communication Name` becomes the borrower's payer name (the sender name printed on slips). Design (Archie) and the shared record: [R095 root note](../../Change%20Logs/CHANGE_NOTES_R095_FOLLOW_UPS_AND_DEV_TEST_ACCOUNT_2026-10-24.md#payer-name-matching-design).

## Changes
- Slip extraction (`receipt_image.py`) returns `payer_name`; parity module `payer_name.py` (`payer_key`, `compare`: `match`, `near`, `mismatch`, `unknown`; `?` is one unknown letter; `near` = one look-alike Thai letter in a given name of 4 or more letters, accepted only when no other borrower is also `match` or `near`; `learn` for the stored lines) shares the vector file `tests/fixtures/payer-name-cases.json` with `services/receipts/payer-name.mjs`.
- Revision 2 (owner-approved): a strong context (borrower DM, borrower in a 3-member group, forwarder in a 3-member group) never holds on the name; `resolve_payer` does not raise there and a readable new name is learned on POSTED. `Communication Name` holds up to 5 lines (line 1 the borrower, later lines people who pay for them).
- Weak context (forwarder slip in a 4+ person group, poll outcome `CANDIDATES` with `candidate_borrower_ids`; forwarder direct message): candidates by stored name, narrowed in order by participants, the forwarder's nickname hint, charges due, exact amount fit. The hint counts only when it arrives in the same one-minute read batch (no wait): the poll's `MESSAGE_FIELDS` gains `message` and the forwarder's texts are stored with the job; the DM reads the same ingest batch. Remaining detail codes: `PAYER_UNRESOLVED` and `PAYER_NAME_UNREADABLE`; `PAYER_NAME_MISMATCH`, `PAYER_NAME_OTHER_BORROWER`, `PAYER_NAME_AMBIGUOUS` and `PAYER_NOT_IN_GROUP` are removed. Hold text gains `Payer on slip: <name>`, `Candidates` and `Name matches` lines; a reply with an attachment and no text gets no acknowledgement.
- Receipt command `schemaVersion` 8 carries `payerLines` (`{before, after}`) only when there is something to learn; otherwise it stays 7, so a database without V111 still accepts it. The database applies it only while the column equals `before` (V111).
- New configuration key `payer_name_cutoff` (aware timestamp); jobs created before it behave as before. No catalogue revision change (32), no new service, grant, timer or agent migration.
- Documents: `SERVICE_CATALOGUE.md` (two rows), `docs/OPERATIONS.md` (section Payer-name matching).

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache .` and `python -B -m unittest discover -s tests` in `integration-agent/` | Pass: 607 run, 70 lab-only skipped |
| Agent PostgreSQL lab (CI suite list at V111) | Pass: 79 tests at V111 (Chase) |

## Not run
A real slip under the new matching (none since the cutoff).

## Recovery
Leave `payer_name_cutoff` unset or set it to a future time (the behaviour is off); `deploy-runtime.py rollback` restores the previous code. In Git, revert the batch. Names already filled stay (editable in the borrower record).

## Open questions
None.

## Remaining work
Observe the first real slip after the cutoff.

## Deploy record
Deployed to `vm-mw-credit-agent` on 24 October 2026: checkout `e3d5bc2` to `14c4a403`, freeze 18:34:20Z (rollback `runtime-20261024T183420716659Z`), activate 18:34:47Z; `/ready` true, `code_version` `14c4a40399060c45adfbdaf9b93004eba43b95eb`. `payer_name_cutoff` `2026-10-24T18:36:14+00:00` added (configuration 80 to 81 keys; backup `/root/config.json.pre-r095-payer-cutoff`); later cycles clean, 0 `PAYER_` lines. No real slip has arrived since, so the payer path is not yet observed live. Pins are in the [Environment inventory](../../project/Documents/Environment_Inventory.md).
