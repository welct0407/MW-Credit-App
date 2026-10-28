"""Command routing around audit.job(): monitoring/read probes run unwrapped (V6 heartbeat-only jobs)."""
import contextlib
import io
import json
import unittest
from unittest.mock import patch

from mw_integration_agent import cli


class JobWrappingTests(unittest.TestCase):
    PROBES = (['instagram-probe', '--config', 'c', '--catalogue', 'k'],
              ['messages', '--config', 'c'])

    def test_probes_and_local_commands_run_without_a_job(self):
        self.assertEqual(set(cli.UNWRAPPED_COMMANDS), {'serve-webhook', 'serve-receipt-recognition', 'serve-chat-relay', 'receiver-ready', 'status', 'check',
                                                        'instagram-probe', 'messages'})
        for argv in self.PROBES:
            with self.subTest(command=argv[0]), patch('sys.argv', ['mw-integration-agent', *argv]), \
                    patch('mw_integration_agent.audit.job', side_effect=AssertionError('probe wrapped in a job')), \
                    patch('mw_integration_agent.cli.load_json', side_effect=AssertionError('config read before dispatch')), \
                    patch.object(cli, 'execute', return_value=0) as execute:
                self.assertEqual(cli.main(), 0)
                self.assertEqual(execute.call_args.args[0].command, argv[0])

    def test_worker_cycles_run_inside_a_job_and_report_its_exit_code(self):
        seen = []
        @contextlib.contextmanager
        def job(config, service):
            outcome = {'exit_code': None}
            seen.append((service, outcome))
            yield outcome
        for argv, code in ((['receipt-cycle', '--config', 'c', '--catalogue', 'k'], 2),
                           (['audit-relay', '--config', 'c', '--catalogue', 'k'], 0)):
            with self.subTest(command=argv[0]), patch('sys.argv', ['mw-integration-agent', *argv]), \
                    patch('mw_integration_agent.audit.job', job), patch('mw_integration_agent.cli.load_json', return_value={}), \
                    patch.object(cli, 'execute', return_value=code):
                self.assertEqual(cli.main(), code)
        self.assertEqual([(s, o['exit_code']) for s, o in seen], [('receipt-cycle', 2), ('audit-relay', 0)])

    def test_relay_cycle_marks_the_job_effect_only_when_it_moved_something(self):
        args = cli.build_parser().parse_args(['audit-relay', '--config', 'c', '--catalogue', 'k'])
        # R091: the reviewer-DML reconciliation is gone; the relay result is the export count alone.
        for exported, effect in ((0, None), (2, {'exported': 2})):
            with self.subTest(exported=exported):
                outcome = {'exit_code': None}
                out = io.StringIO()
                with patch('mw_integration_agent.cli.load_json', return_value={}), patch('mw_integration_agent.cli.validate_config'), \
                        patch('mw_integration_agent.cli.validate_catalogue'), patch('mw_integration_agent.outbox.relay', return_value={'exported': exported}), \
                        contextlib.redirect_stdout(out):
                    self.assertEqual(cli.execute(args, outcome), 0)
                self.assertEqual(outcome.get('effect'), effect)
                self.assertEqual(json.loads(out.getvalue()), {'relay': {'exported': exported}})
        from mw_integration_agent import outbox
        self.assertFalse(hasattr(outbox, 'reconcile'))

    def test_retired_conversation_commands_are_gone(self):
        for command in ('partner-conversation-cycle', 'native-api-probe'):
            with self.subTest(command=command), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                cli.build_parser().parse_args([command, '--config', 'c', '--catalogue', 'k'])
        cli.build_parser().parse_args(['conversation-poll', '--config', 'c', '--catalogue', 'k'])


if __name__ == '__main__':
    unittest.main()
