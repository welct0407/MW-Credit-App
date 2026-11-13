-- R152 group chat summary (owner authorization of 13 November 2026: "Add the column now"). Instagram can stop listing a
-- person among a group's participants; once that person has not written for three days nothing in the group says she
-- belongs to it, and her referrer would become the subject of her group's summary again. This column remembers which
-- borrowers have been seen in each group (as a participant or as a message sender):
--  member_borrower_ids   a JSON array of borrower Row IDs, sorted and unique; '[]' until the summariser writes it
-- Borrower Row IDs only: no name, no username, no chat text. The group-chat-summary service writes it when a run
-- finishes (the union of what was remembered and the borrowers matched in that run, without ids whose borrower row no
-- longer exists); the conversation poll and the service read it. Existing rows get '[]'.
-- Grants are those of V12 (table level: the worker reads, inserts and updates; the auditor reads). Immutable after application.
SET LOCAL ROLE mw_agent_owner;

ALTER TABLE runtime.group_chat_summary_state
 ADD COLUMN member_borrower_ids text NOT NULL DEFAULT '[]'
 CONSTRAINT group_chat_summary_state_member_borrower_ids_check
  CHECK (octet_length(member_borrower_ids) <= 16384 AND left(member_borrower_ids, 1) = '[' AND jsonb_typeof(member_borrower_ids::jsonb) = 'array');
