# Change notes — Group chat summary diagnostics and wait, agent (R151), 13 November 2026

## Purpose
Owner request of 13 November 2026, a second R151 change for the group chat summary: (1) `MODEL_OUTPUT_INVALID` should record which validation check failed, as a fixed sub-code and never chat text, so a failed run can be diagnosed from the state table and the journal; (2) the maximum wait drops from 1 hour to 10 minutes, so a busy group's summary refreshes at most 10 minutes after its first new message. Agent only. R151's main change (the receipt sender fallback) and the combined R151 merge, PROD agent deploy and closure belong to another session; this change ships in that one combined R151 agent deploy. Nothing is deployed here.

## Changes
As built.
- `src/mw_integration_agent/group_chat_summary.py` and its test (Byte): `MAX_WAIT_SECONDS` goes from 3600 to 600, so a group is due after 10 quiet minutes or 10 minutes after its first new substantive message, whichever comes first. `validated()` raises the first failed check as one of 15 fixed codes: `MODEL_OUTPUT_INVALID_SHAPE` (not an object, wrong keys, `relevant` not boolean), `MODEL_OUTPUT_INVALID_HEADLINE_{SHAPE,BLANK,LENGTH,CONTROL_CHAR,AT_SIGN,DIGIT_RUN}` and `MODEL_OUTPUT_INVALID_POINT_{SHAPE,COUNT,SPEAKER,BLANK,LENGTH,CONTROL_CHAR,AT_SIGN,DIGIT_RUN}`. Check order: headline before points, Thai before English, speaker before a point's text. No chat text, token or length is in a code; an unknown check name falls back to `MODEL_OUTPUT_INVALID`. The accept and reject boundary is unchanged; `MODEL_REFUSAL`, `MODEL_UNFINISHED` and `MODEL_RESPONSE_INVALID` (unparseable JSON) are unchanged; `PROMPT_VERSION` stays 2. A filter on `last_error` should match the prefix `MODEL_OUTPUT_INVALID`. No migration: all 15 codes fit V12's `^[A-Z][A-Z0-9_]{0,63}$` (the longest is 41 characters).
- Documents (Dewey): this note, `docs/CONVERSATION_POLL.md` (maximum wait 10 minutes, the sub-codes), `docs/OPERATIONS.md` (the error-code list) and `SERVICE_CATALOGUE.md` (revision 38 prose and the table row: 1 hour becomes 10 minutes), each edited only in its group chat summary lines. The release tracker's R151 paragraph and the other session's notes are not touched here.
- Not changed: SQL, migrations, the command service, the PWA, the catalogue and the configuration schema.

## Checks
| Command | Result |
| --- | --- |
| Byte's unittest `test_group_chat_summary` and `test_postgres_state` | 100 OK (34 lab tests skipped without the lab) |
| The same tests against a disposable agent lab | 100 OK |
| The 15 codes against the V12 `last_error` check on the lab (rolled back) | Accepted |
| Byte's `ruff` | Pass |
| Chase | Not run: a small diagnostics and constant change fully covered by Byte's tests; CI runs the agent test and lab jobs |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request and the PROD verification | Pending (the other session's combined R151 merge and deploy) |

## Not run
- The wide Playwright suite and the database CI: no PWA or SQL change.
- A live Claude call with a failing output: the first real sub-codes appear in PROD after the combined R151 agent deploy.

## Recovery
Revert the pull request. In PROD the combined R151 agent deploy is rolled back with `deploy-runtime.py rollback` by the other session; the wait and the codes then return to their R148 behaviour.

## Open questions
None.

## Remaining work
Implementation and verification; then the combined R151 agent deploy by the other session.
