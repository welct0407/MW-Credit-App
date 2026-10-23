-- R090 correction of V9 (found in the live check, 22 October 2026): an id-less model_rounds event matched by
-- time could be a synthetic conversation check's, and a question with no usage of its own took the next
-- event days later. The time match now takes only events of a partner-conversation-cycle model_turn within
-- 30 minutes of the turn's capture (a turn runs at most conversation_timeout_seconds, default 600, after
-- a poll that runs every few minutes). Same signature, owner and grants; CREATE OR REPLACE
-- keeps the EXECUTE grant. Immutable after application.
SET LOCAL ROLE mw_agent_owner;

CREATE OR REPLACE FUNCTION monitoring.recent_questions_v1(p_limit integer DEFAULT 10)
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
  -- A synthetic check also writes model_rounds without a message_id: only a Partner cycle's turn may match by time.
  SELECT e.occurred_at, e.payload, p.service_name AS cycle FROM audit.events e
  JOIN audit.operations o ON o.operation_id = e.operation_id
  LEFT JOIN audit.operations p ON p.operation_id = o.parent_operation_id
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
         OR (e.payload->>'message_id' IS NULL AND e.cycle = 'partner-conversation-cycle'
             AND e.occurred_at >= l.created AND e.occurred_at < l.created + interval '30 minutes'
             AND (l.next_created IS NULL OR e.occurred_at < l.next_created)))
  ORDER BY (e.payload->>'message_id' = l.message_id) DESC NULLS LAST, e.occurred_at
  LIMIT 1
 ) u ON true
 ORDER BY l.created DESC
$$;
