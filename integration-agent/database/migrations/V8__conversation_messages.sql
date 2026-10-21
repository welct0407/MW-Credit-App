-- Model-provider Partner conversation history (owner decisions 21 October 2026: Claude Opus 5.5, then Gemini
-- gemini-4-argon, on Vertex AI behind the Partner conversation; Codex kept switchable). One row per provider
-- message of a turn that reached finish, written once in the transaction that marks the turn READY; failed or
-- interrupted turns write nothing, so the replayed prefix stays identical. provider names the dialect of
-- content: Claude messages (user/assistant content blocks, thinking blocks with signatures) or Gemini contents
-- (user/model parts, thoughtSignature included). content is that array as the exact JSON text sent and
-- received; text, not jsonb, because jsonb reorders object keys and the replayed history must not change.
-- A new epoch starts when the provider or the prompt digest changes or the previous turn's input tokens exceed
-- the configured limit; older epochs stay. runtime.conversations (Codex threads) is untouched.
-- Immutable after application.
SET LOCAL ROLE mw_agent_owner;

CREATE TABLE runtime.conversation_messages (
 binding text NOT NULL CHECK (binding ~ '^[0-9a-f]{64}$'),
 epoch integer NOT NULL CHECK (epoch >= 0),
 seq integer NOT NULL CHECK (seq >= 0),
 message_id text NOT NULL CHECK (btrim(message_id) <> ''),
 provider text NOT NULL CHECK (provider IN ('claude','gemini')),
 role text NOT NULL CHECK ((provider = 'claude' AND role IN ('user','assistant'))
                          OR (provider = 'gemini' AND role IN ('user','model'))),
 content text NOT NULL CHECK (json_typeof(content::json) = 'array'),  -- json, not jsonb: \u0000 is valid model JSON
 prompt_sha256 text NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
 input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),  -- last response of the turn, on its last row
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (binding, epoch, seq)
);
CREATE INDEX conversation_messages_turn_idx ON runtime.conversation_messages(message_id);
CREATE TRIGGER conversation_messages_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON runtime.conversation_messages
 FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_rewrite();

GRANT SELECT,INSERT ON runtime.conversation_messages TO mw_agent_worker;
GRANT SELECT ON runtime.conversation_messages TO mw_agent_auditor;
