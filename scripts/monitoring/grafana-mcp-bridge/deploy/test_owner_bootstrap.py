"""Bounded offline tests for privileged bootstrap guardrails; never calls GCP."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('owner-bootstrap.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def empty():
    return {key: [] for key in b.APIS}


class Guards(unittest.TestCase):
    def test_resource_collisions_stop(self):
        rows = empty()
        rows['run.googleapis.com'] = [{'metadata': {'name': b.SERVICE, 'labels': {}}}]
        with self.assertRaisesRegex(RuntimeError, 'Conflicting Cloud Run'):
            b.validate(rows, False)
        rows = empty()
        rows['secretmanager.googleapis.com'] = [{'name': 'projects/x/secrets/mw-grafana-state-key'}]
        with self.assertRaisesRegex(RuntimeError, 'Conflicting secret'):
            b.validate(rows, False)

    def test_existing_database_requires_explicit_resume_and_exact_configuration(self):
        rows = empty()
        rows['firestore.googleapis.com'] = [{'name': f'projects/{b.PROJECT}/databases/{b.DATABASE}',
            'locationId': b.REGION, 'type': 'FIRESTORE_NATIVE', 'databaseEdition': 'STANDARD',
            'deleteProtectionState': 'DELETE_PROTECTION_ENABLED'}]
        with self.assertRaisesRegex(RuntimeError, '--resume'):
            b.validate(rows, False)
        b.validate(rows, True)
        rows['firestore.googleapis.com'][0]['locationId'] = 'us-central1'
        with self.assertRaisesRegex(RuntimeError, 'Conflicting database'):
            b.validate(rows, True)

    def test_failed_read_is_never_treated_as_absence(self):
        with patch.object(b, 'gc', side_effect=RuntimeError('PERMISSION_DENIED')) as command:
            with self.assertRaisesRegex(RuntimeError, 'PERMISSION_DENIED'):
                b.resources(set(b.APIS), 'exact-condition', False)
            self.assertEqual(command.call_count, 1)

    def test_inert_rerun_never_redeploys_existing_service(self):
        existing = {'metadata': {'name': b.SERVICE, 'labels': {'bridge': b.MARKER}},
                    'status': {'url': 'https://actual.example.run.app'}}
        with patch.object(b, 'gc', return_value=[existing]) as command, patch.object(b, 'run') as shell:
            b.inert()
            self.assertEqual(command.call_count, 1)
            shell.assert_not_called()

    def test_domain_collision_never_creates_or_overrides_mapping(self):
        service = {'metadata': {'labels': {'bridge': b.MARKER}}}
        mapping = {'metadata': {'name': b.DOMAIN}, 'spec': {'routeName': 'another-service'}}
        with patch.object(b, 'gc', side_effect=[['mw-credit.com'], service, [mapping]]) as command:
            with self.assertRaisesRegex(RuntimeError, 'another service'):
                b.domain()
            self.assertEqual(command.call_count, 3)

    def test_resource_plan_scopes_database_secrets_and_excludes_live_endpoints(self):
        calls = []
        def fake(*args):
            calls.append(args)
            if args[:4] == ('firestore', 'indexes', 'composite', 'list'):
                return []
            if args[:3] == ('logging', 'exclusions', 'list'):
                return []
            return None
        condition = f'resource.name=="projects/{b.PROJECT}/databases/{b.DATABASE}"'
        with patch.object(b, 'inventory', return_value=empty()), patch.object(b, 'gc', side_effect=fake):
            b.resources(set(b.APIS), condition, False)
        grant = next(c for c in calls if c[:2] == ('projects', 'add-iam-policy-binding'))
        self.assertIn('--role=roles/datastore.user', grant)
        self.assertIn(f'--condition=expression={condition},title=mw-grafana-database,description=Bridge database only', grant)
        secret_grants = [c for c in calls if c[:2] == ('secrets', 'add-iam-policy-binding')]
        self.assertEqual({c[2] for c in secret_grants}, set(b.SECRETS))
        self.assertFalse(any(c[0] in ('run', 'scheduler') for c in calls))
        self.assertFalse(any('delete' in c or 'versions' in c for c in calls))
        self.assertTrue(all(f'--database={b.DATABASE}' in c for c in calls if c[0] == 'firestore'))


if __name__ == '__main__':
    unittest.main()
