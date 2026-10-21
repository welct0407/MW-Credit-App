"""Read-only timing of model-backed Partner conversation turns (R085 measurement).

Reads audit.operations/events in mw_agent (a READ ONLY transaction on the worker role, as the runtime connects)
and prints one JSON line per model_turn operation started at or after --since, then a summary line:

    python integration-agent/scripts/conversation-timing.py --since 2026-10-22T00:00:00+07:00

Per turn: provider, status, rounds, attempts, turn seconds (requested -> completed/failed event), model seconds
(sum of round_ms), tool calls, tool seconds (sum of tool_ms), round_ms, tool_ms, and the per-turn token totals
from the model_rounds event. Turns recorded before R085 have no round_ms/tool_ms; their lists are empty.
No content, no conversation text and no write.
"""
import argparse
from datetime import datetime
import json
from pathlib import Path
import statistics
import sys

DEFAULT_CONFIG = '/etc/mw-integration-agent/config.json'
QUERY = '''SELECT o.operation_id::text AS operation_id, o.plan->>'provider' AS provider,
  min(e.occurred_at) AS started_at,
  max(e.occurred_at) FILTER (WHERE e.event_kind IN ('completed','failed','unknown')) AS ended_at,
  (array_agg(e.event_kind ORDER BY e.operation_seq DESC))[1] AS last_event,
  (array_agg(e.payload ORDER BY e.operation_seq DESC) FILTER (WHERE e.event_kind='model_rounds'))[1] AS rounds
FROM audit.operations o JOIN audit.events e ON e.operation_id=o.operation_id
WHERE o.service_name='model_turn'
GROUP BY o.operation_id, o.plan
HAVING min(e.occurred_at) >= %s
ORDER BY min(e.occurred_at)'''
TOKENS = ('prompt_tokens', 'candidates_tokens', 'thoughts_tokens', 'cached_content_tokens', 'total_tokens',
          'input_tokens', 'cache_read_input_tokens', 'output_tokens')


def summarize(row):
    """One turn's timing from its operation row (dict with started_at, ended_at, last_event, rounds payload)."""
    payload = row.get('rounds') or {}
    round_ms = [int(m) for m in payload.get('round_ms') or []]
    tool_ms = [{'name': t.get('name'), 'ms': int(t.get('ms') or 0)} for t in payload.get('tool_ms') or []]
    ended = row.get('ended_at')
    turn_seconds = round((ended - row['started_at']).total_seconds(), 1) if ended else None
    status = {'completed': 'completed', 'failed': 'failed', 'unknown': 'unknown'}.get(row.get('last_event'), 'running')
    return {'operation_id': row['operation_id'], 'provider': row.get('provider'), 'started_at': row['started_at'].isoformat(),
            'status': status, 'failure': payload.get('failure'), 'rounds': payload.get('rounds'),
            'attempts': payload.get('attempts'), 'turn_seconds': turn_seconds,
            'model_seconds': round(sum(round_ms) / 1000, 1), 'tool_calls': len(tool_ms),
            'tool_seconds': round(sum(t['ms'] for t in tool_ms) / 1000, 1), 'round_ms': round_ms, 'tool_ms': tool_ms,
            'tokens': {k: payload[k] for k in TOKENS if isinstance(payload.get(k), int)}}


def overall(turns):
    timed = [t['turn_seconds'] for t in turns if t['turn_seconds'] is not None]
    return {'turns': len(turns), 'completed': sum(t['status'] == 'completed' for t in turns),
            'median_turn_seconds': round(statistics.median(timed), 1) if timed else None,
            'max_turn_seconds': max(timed) if timed else None,
            'median_rounds': statistics.median([t['rounds'] for t in turns if t['rounds']]) if any(t['rounds'] for t in turns) else None,
            'tool_calls': sum(t['tool_calls'] for t in turns),
            'tool_seconds': round(sum(t['tool_seconds'] for t in turns), 1),
            'model_seconds': round(sum(t['model_seconds'] for t in turns), 1)}


def read(config, since):
    from mw_integration_agent.state import transaction
    with transaction(config, readonly=True) as conn:
        cursor = conn.execute(QUERY, (since,))
        names = [c.name for c in cursor.description]
        return [dict(zip(names, r, strict=True)) for r in cursor.fetchall()]


def main(argv=None, reader=read):
    parser = argparse.ArgumentParser(description='Per-turn timing of model conversation turns (read-only).')
    parser.add_argument('--since', required=True, help='ISO timestamp with a timezone, e.g. 2026-10-22T00:00:00+07:00')
    parser.add_argument('--config', default=DEFAULT_CONFIG)
    args = parser.parse_args(argv)
    since = datetime.fromisoformat(args.since)
    if since.tzinfo is None:
        parser.error('--since needs a timezone')
    config = json.loads(Path(args.config).read_text(encoding='utf-8'))
    turns = [summarize(row) for row in reader(config, since)]
    for turn in turns:
        print(json.dumps(turn, ensure_ascii=False))
    print(json.dumps({'summary': overall(turns)}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
