"""Synthetic PostgreSQL proof of retrospective linkage and exactly-once relay."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch

import psycopg
from mw_integration_agent import operator_audit as oa, outbox, state
from mw_integration_agent.config import ConfigurationError


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'), 'isolated lab required')
class OperatorRelayPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        lab = json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text())
        assert lab['host'] == '127.0.0.1' and lab['port'] != 5432 and 'agent-state-lab-' in lab['root']
        cls.base = dict(host=lab['host'], port=lab['port'], user='postgres')
        with psycopg.connect(**cls.base, dbname='mw_agent') as c:
            assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve() == (Path(lab['root'])/'data').resolve()
            cls.generation = str(c.execute("SELECT active_generation FROM runtime.service_control WHERE service_name='agent'").fetchone()[0])

    def test_guards_conflicts_retrospective_timestamps_and_duplicate_safe_export(self):
        config = dict(state_backend='postgres', state_generation=self.generation, audit_environment='test',
                      code_version='synthetic-repair', database_name='loan_manager_prod')
        op = str(uuid.uuid4())
        original = {'steps': [{'table': 'Borrowers', 'key': 'synthetic-only', 'values': {'City': 'New'}}]}
        with psycopg.connect(**self.base, dbname='loan_manager_prod') as c:
            raw = c.execute('SELECT %s::jsonb::text', (json.dumps(original),)).fetchone()[0]
            c.execute('''INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,
                request_reason,direct_targets,code_version) VALUES (%s,'operator-label','operator-login-label',
                %s,'synthetic operator correction',%s::jsonb,'synthetic-origin')''',
                (op, hashlib.sha256(raw.encode()).hexdigest(), json.dumps([original])))
            c.execute('''INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,
                row_key,before_row,after_row) VALUES (%s,'public','Borrowers','UPDATE',
                '{"Row ID":"synthetic-only"}','{"City":"Old"}','{"City":"New"}')''', (op,))
        @contextmanager
        def business(_config):
            with psycopg.connect(**dict(self.base, user='mw_agent_relay'), dbname='loan_manager_prod', autocommit=True) as c:
                yield c
        evidence = {'origin_reference': 'synthetic-origin', 'authorization_reference': 'synthetic-approval'}
        with business(config) as source:
            captured = oa.snapshot(source, op)
        value = oa.plan(captured, config['database_name'], evidence)
        manifest = {k: value['source'][k] for k in ('plan_sha256','marker_sha256','effects_sha256','effect_count')}
        manifest.update(operation_id=op, original_plan_canonical_sha256=value['original_plan_canonical_sha256'], evidence=evidence)
        with patch.object(state, 'parameters', side_effect=lambda config, role='worker':
                dict(self.base, user='mw_agent_'+role, dbname='mw_agent', autocommit=True)), patch.object(outbox, 'business', business):
            with self.assertRaisesRegex(ConfigurationError, 'OUTBOX_INTENT_MISMATCH'):
                outbox.relay(config)
            self.assertEqual(oa.recover(config, manifest)['mode'], 'plan')
            with self.assertRaisesRegex(ConfigurationError, 'BACKUP_REQUIRED'):
                oa.recover(config, manifest, True)
            bad = dict(manifest, effect_count=2)
            with self.assertRaisesRegex(ConfigurationError, 'EVIDENCE_CHANGED'):
                oa.recover(config, bad, True, 'synthetic-verified-restore')
            self.assertFalse(oa.recover(config, manifest, True, 'synthetic-verified-restore')['already_present'])
            self.assertTrue(oa.recover(config, manifest, True, 'synthetic-verified-restore')['already_present'])
            conflict = dict(manifest, evidence={**evidence, 'origin_reference': 'conflicting-evidence'})
            with self.assertRaisesRegex(ConfigurationError, 'OPERATOR_RECOVERY_CONTENT_CONFLICT'):
                oa.recover(config, conflict, True, 'synthetic-verified-restore')
            outbox.relay(config)
            outbox.relay(config)
            self.assertTrue(oa.recover(config, manifest, True, 'synthetic-verified-restore')['already_present'])
        with psycopg.connect(**self.base, dbname='mw_agent') as c:
            events = c.execute('''SELECT event_kind,count(*) FROM audit.events WHERE operation_id=%s
                GROUP BY event_kind ORDER BY event_kind''', (op,)).fetchall()
            self.assertEqual(events, [('business_committed',1), ('operator_linkage_reconstructed',1), ('row_changed',1)])
            stamp = c.execute('SELECT created_at FROM audit.operations WHERE operation_id=%s', (op,)).fetchone()[0]
            self.assertGreaterEqual(stamp, __import__('datetime').datetime.fromisoformat(captured[0][5]))
            payload = c.execute("SELECT payload FROM audit.events WHERE operation_id=%s AND event_kind='operator_linkage_reconstructed'", (op,)).fetchone()[0]
            self.assertTrue(payload['retrospective']); self.assertFalse(payload['prior_central_intent_existed'])
        with business(config) as source:
            self.assertEqual(oa.snapshot(source, op), captured)
            self.assertEqual(source.execute('SELECT count(*) FROM agent_audit.exports WHERE operation_id=%s', (op,)).fetchone()[0], 1)
