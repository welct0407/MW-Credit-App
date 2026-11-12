-- R146 group chat summary (owner authorization of 13 November 2026: "yes to the agent state table"). One mutable row per
-- eligible Instagram group, written by the conversation poll in the transaction that records the group's new message rows
-- and by the group-chat-summary service when a run finishes. It is a marker and a retry record, never content: no chat
-- text, no summary text, no username. conversation_id is the poll's own key (runtime.conversation_poll_state).
--  changed_at                 when the first substantive text (or a subject change) arrived since the last run; NULL = nothing due
--  last_text_at               newest substantive text seen by the poll (the quiet period counts from it)
--  subjects_sha256            digest of the group's current subject borrowers (a change sets changed_at)
--  summarised_source_sha256   source digest of the last posted summary; summarised_at when it finished
--  attempts, next_attempt_at  retry backoff after a failed run (0 = due now)
--  last_error                 a fixed error code of the last failed run, never text
-- Times are epoch seconds (double precision), as in the poll tables of V2, so the SQLite fallback keeps the same SQL.
-- Grants as V2: the worker reads, inserts and updates (no DELETE); the auditor reads. Immutable after application.
SET LOCAL ROLE mw_agent_owner;

CREATE TABLE runtime.group_chat_summary_state (
 conversation_id text PRIMARY KEY CHECK (btrim(conversation_id) <> ''),
 changed_at double precision,
 last_text_at double precision,
 subjects_sha256 text CHECK (subjects_sha256 IS NULL OR subjects_sha256 ~ '^[0-9a-f]{64}$'),
 summarised_source_sha256 text CHECK (summarised_source_sha256 IS NULL OR summarised_source_sha256 ~ '^[0-9a-f]{64}$'),
 summarised_at double precision,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 next_attempt_at double precision NOT NULL DEFAULT 0,
 last_error text CHECK (last_error IS NULL OR last_error ~ '^[A-Z][A-Z0-9_]{0,63}$')
);
-- The summariser selects the groups with a marker.
CREATE INDEX group_chat_summary_state_due_idx ON runtime.group_chat_summary_state(next_attempt_at) WHERE changed_at IS NOT NULL;

GRANT SELECT,INSERT,UPDATE ON runtime.group_chat_summary_state TO mw_agent_worker;
GRANT SELECT ON runtime.group_chat_summary_state TO mw_agent_auditor;
