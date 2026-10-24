-- R091, owner instruction of 23 October 2026 ("decommission ig conversation") and the owner's decision of the same
-- day to delete the Instagram Partner conversation journal (Archie's plan E2.8, E4.3). Runs only after the VM runs
-- the package without the conversation modules (no reader or writer of these objects remains) and after the Grafana
-- Cost page reads the in-app chat (monitoring.pwa_chat_recent_questions_v1 on loan_manager_prod) instead of
-- monitoring.recent_questions_v1 here. Precondition (operator, not SQL): a verified backup of mw_agent immediately
-- before (scripts/backup-agent-database.py) and the row count of each dropped table recorded.
-- Dropped, conversation-only: runtime.conversations, conversation_turns, conversation_tool_calls,
-- conversation_operations, conversation_dml, conversation_dml_inserts (V2) and conversation_messages (V8, with its
-- append-only trigger), their indexes with them; the stream='conversation' rows of runtime.partner_notices, whose
-- stream CHECK narrows to 'receipt'; monitoring.recent_questions_v1 and the then-empty monitoring schema;
-- mw_agent_dashboard's CONNECT on mw_agent (the role stays: it serves loan_manager_prod's Cost page).
-- Kept: runtime.conversation_poll_state and conversation_poll_messages (group poll, receipt reconsideration), every
-- ingress, receipt, review, cash statement, job, operation and heartbeat table, the receipt notices, and the
-- audit.operations/audit.events rows of past conversation operations (audit, not journal; the retention script ages
-- them out). No foreign key references the dropped tables (V2). Re-runnable: IF EXISTS throughout. Immutable after
-- application.
SET LOCAL ROLE mw_agent_owner;

DROP FUNCTION IF EXISTS monitoring.recent_questions_v1(integer);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='monitoring') THEN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='monitoring')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='monitoring') THEN
   RAISE EXCEPTION 'V11: schema monitoring holds objects other than recent_questions_v1; review before dropping it';
  END IF;
  EXECUTE 'DROP SCHEMA monitoring';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='mw_agent_dashboard') THEN
  EXECUTE 'REVOKE CONNECT ON DATABASE mw_agent FROM mw_agent_dashboard';
 END IF;
END $$;

DROP TABLE IF EXISTS runtime.conversation_messages;
DROP TABLE IF EXISTS runtime.conversation_tool_calls;
DROP TABLE IF EXISTS runtime.conversation_turns;
DROP TABLE IF EXISTS runtime.conversation_operations;
DROP TABLE IF EXISTS runtime.conversation_dml_inserts;
DROP TABLE IF EXISTS runtime.conversation_dml;
DROP TABLE IF EXISTS runtime.conversations;

DELETE FROM runtime.partner_notices WHERE stream = 'conversation';
DO $$
DECLARE name text;
BEGIN
 FOR name IN SELECT conname FROM pg_catalog.pg_constraint
   WHERE conrelid='runtime.partner_notices'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%stream%' LOOP
  EXECUTE format('ALTER TABLE runtime.partner_notices DROP CONSTRAINT %I', name);
 END LOOP;
END $$;
ALTER TABLE runtime.partner_notices ADD CONSTRAINT partner_notices_stream_check CHECK (stream = 'receipt');

-- Self-check: the conversation objects are gone, the kept poll and notice tables remain.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='runtime' AND c.relname IN ('conversations','conversation_turns','conversation_tool_calls',
             'conversation_operations','conversation_dml','conversation_dml_inserts','conversation_messages'))
    OR to_regnamespace('monitoring') IS NOT NULL THEN
  RAISE EXCEPTION 'V11: conversation journal objects remain';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='mw_agent_dashboard')
    AND has_database_privilege('mw_agent_dashboard', 'mw_agent', 'CONNECT') THEN
  RAISE EXCEPTION 'V11: mw_agent_dashboard must no longer connect to mw_agent';
 END IF;
 IF to_regclass('runtime.conversation_poll_state') IS NULL OR to_regclass('runtime.conversation_poll_messages') IS NULL
    OR to_regclass('runtime.partner_notices') IS NULL OR EXISTS (SELECT 1 FROM runtime.partner_notices WHERE stream<>'receipt') THEN
  RAISE EXCEPTION 'V11: the group poll and receipt notice tables must stay';
 END IF;
END $$;
