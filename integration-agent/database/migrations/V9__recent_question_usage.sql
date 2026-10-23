-- R090 Cost page, owner decision 22 October 2026: list the latest Partner conversation questions with the
-- model usage of each, read by Grafana directly from this database (no copy in Cloud Monitoring).
-- monitoring.recent_questions_v1(n) is the only object the dashboard role may use: SECURITY DEFINER, read-only,
-- at most 50 rows. It joins the answered turn, its ingress question text and the model_rounds usage event
-- of its model_turn operation. Since R090 the event carries the turn's message_id; an earlier event (from 21
-- October, when usage recording began) is matched as the first message_id-less event after the turn's
-- creation and before the next turn's. Codex turns record no usage (subscription): their token columns stay
-- NULL. Money is not computed here; the dashboard prices tokens.
-- Role mw_agent_dashboard comes from bootstrap.sql (mw_agent_owner has NOCREATEROLE). On an instance
-- bootstrapped before this version, create it as postgres with the bootstrap statement first; this migration
-- refuses to run without it. Immutable after application.
SET LOCAL ROLE mw_agent_owner;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='mw_agent_dashboard') THEN
  RAISE EXCEPTION 'V9 requires role mw_agent_dashboard: create it as postgres first (database/setup/bootstrap.sql)';
 END IF;
END $$;

CREATE SCHEMA monitoring;
REVOKE ALL ON SCHEMA monitoring FROM PUBLIC;

CREATE FUNCTION monitoring.recent_questions_v1(p_limit integer DEFAULT 10)
RETURNS TABLE (asked_at timestamptz, question text, status text, provider text, model text, rounds integer,
               input_tokens bigint, cached_tokens bigint, output_tokens bigint, thinking_tokens bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
 WITH turns AS (
  SELECT t.message_id, t.status, to_timestamp(t.created_at) AS created,
         lead(to_timestamp(t.created_at)) OVER (ORDER BY t.created_at) AS next_created
  FROM runtime.conversation_turns t
  WHERE t.status <> 'IGNORED'
 ), latest AS (
  SELECT * FROM turns ORDER BY created DESC LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
 ), usage AS MATERIALIZED (
  -- One pass over the retained audit window (routine trees are purged after 7 days, so an older question
  -- shows its text without usage).
  SELECT e.occurred_at, e.payload FROM audit.events e
  WHERE e.event_kind = 'model_rounds' AND e.occurred_at >= (SELECT min(created) FROM latest)
 )
 SELECT coalesce(to_timestamp(m.event_timestamp), l.created), left(m.text, 1000), l.status,
        u.payload->>'provider', u.payload->>'model', (u.payload->>'rounds')::integer,
        -- Gemini prompt_tokens and Claude input_tokens both include the cached part.
        coalesce((u.payload->>'prompt_tokens')::bigint, (u.payload->>'input_tokens')::bigint),
        coalesce((u.payload->>'cached_content_tokens')::bigint, (u.payload->>'cache_read_input_tokens')::bigint),
        coalesce((u.payload->>'candidates_tokens')::bigint, (u.payload->>'output_tokens')::bigint),
        (u.payload->>'thoughts_tokens')::bigint
 FROM latest l
 LEFT JOIN runtime.ingress_messages m ON m.message_id = l.message_id
 LEFT JOIN LATERAL (
  SELECT e.payload FROM usage e
  WHERE (e.payload->>'message_id' = l.message_id
         OR (e.payload->>'message_id' IS NULL AND e.occurred_at >= l.created
             AND (l.next_created IS NULL OR e.occurred_at < l.next_created)))
  ORDER BY (e.payload->>'message_id' = l.message_id) DESC NULLS LAST, e.occurred_at
  LIMIT 1
 ) u ON true
 ORDER BY l.created DESC
$$;

REVOKE ALL ON FUNCTION monitoring.recent_questions_v1(integer) FROM PUBLIC;
GRANT USAGE ON SCHEMA monitoring TO mw_agent_dashboard;
GRANT EXECUTE ON FUNCTION monitoring.recent_questions_v1(integer) TO mw_agent_dashboard;
GRANT CONNECT ON DATABASE mw_agent TO mw_agent_dashboard;
