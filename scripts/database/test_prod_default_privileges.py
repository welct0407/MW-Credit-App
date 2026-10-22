"""Unit tests for the PROD default-privilege replay order of Test-MigrationsCloud.py (pure, no cluster)."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('migrations_cloud', Path(__file__).with_name('Test-MigrationsCloud.py'))
mc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mc)
FIXTURE = Path(__file__).with_name('Test-ProdDefaultPrivileges.sql')


class MigrationPlan(unittest.TestCase):
    def test_full_chain_replays_the_recorded_prod_history_then_removes_the_fixture(self):
        self.assertEqual(mc.migration_plan(110), [(101, 'apply'), (102, 'pause'), (103, 'resume'), (None, 'remove')])

    def test_pre_migration_fixture_runs_before_the_prod_defaults(self):
        self.assertEqual(mc.migration_plan(103, 69), [(69, 'pre'), (101, 'apply'), (102, 'pause'), (103, 'resume'), (None, 'remove')])
        self.assertEqual(mc.migration_plan(103, 101)[:2], [(101, 'pre'), (101, 'apply')])

    def test_a_chain_older_than_the_prod_defaults_has_no_replay(self):
        self.assertEqual(mc.migration_plan(68, 19), [(19, 'pre'), (None, None)])

    def test_every_step_exists_in_the_fixture(self):
        text = FIXTURE.read_text()
        for _, step in mc.PROD_DEFAULTS:
            self.assertIn(f"'{step}'", text)
        self.assertIn("'remove'", text)


if __name__ == '__main__':
    unittest.main()
