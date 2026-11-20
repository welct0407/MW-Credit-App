"""R177 item B: a slip sent FROM one of our cash accounts by its holder is our own outgoing transfer, not an incoming
payment: with `receipt_outgoing_ignore_enabled` on it is IGNORED / OUTGOING_TRANSFER (no hold, request or reply). Two
independent keys must both hold (our number printed first, the holder's own name an exact match); any doubt keeps today's
behaviour. Synthetic names, accounts and identities only."""
import json
import unittest

from mw_integration_agent.config import ConfigurationError, load_json, validate_config
from mw_integration_agent.receipt_rules import match_account, outgoing_transfer
from mw_integration_agent.receipt_run import OUTGOING, outgoing
from test_config import ROOT
from test_payer_resolution import PayerBase, borrower, master, slip

OURS = 'xxx-x-x6789-x'          # fits the synthetic cash account 'a' (1234567890)
OTHER = '987-6-54321-0'         # nobody's account of ours
HOLDER = 'นางสาว ทดลอง บัญชีเรา'  # the synthetic holder of account 'a', as printed
SENDERS = {'a': 'ทดลอง บัญชีเรา'}
ON = {'receipt_outgoing_ignore_enabled': True, 'receipt_outgoing_senders': SENDERS}
ACCOUNTS = master()['accounts']


def value(numbers=(OURS, OTHER), payer=HOLDER, **extra):
    return slip(payer, account_numbers=list(numbers), **extra)


class RuleTests(unittest.TestCase):
    def test_our_number_first_and_the_holders_name_is_outgoing(self):
        self.assertTrue(outgoing_transfer(value(), ACCOUNTS, SENDERS))
        self.assertTrue(outgoing_transfer(value((OURS, OTHER, '111-1-11111-1')), ACCOUNTS, SENDERS))
        self.assertTrue(outgoing_transfer(value(), ACCOUNTS, SENDERS, ['สมชาย ใจดี', None]))

    def test_every_doubt_is_not_outgoing(self):
        near = {'a': 'ภาวิณี บัญชีเรา'}  # the slip prints ก for ภ: near, not a match
        second = ACCOUNTS + [{'id': 'b', 'label': 'Second', 'active': True, 'number': '9999967899', 'alternative': None}]
        retired = ACCOUNTS + [{'id': 'old', 'label': 'Old', 'active': False, 'number': '9876543210', 'alternative': None}]
        cases = {
            'ours printed last (an incoming payment)': (value((OTHER, OURS)), ACCOUNTS, SENDERS, ()),
            'another payer name': (value(payer='นาย สมชาย ใจดี'), ACCOUNTS, SENDERS, ()),
            'near name only': (value(payer='กาวิณี บัญชีเรา'), ACCOUNTS, near, ()),
            'one number only': (value((OURS,)), ACCOUNTS, SENDERS, ()),
            'six numbers': (value((OURS,) + (OTHER,) * 5), ACCOUNTS, SENDERS, ()),
            'both numbers ours': (value((OURS, '1234567890')), ACCOUNTS, SENDERS, ()),
            'our number fits two accounts': (value(), second, SENDERS, ()),
            'a later number fits an inactive account of ours': (value((OURS, '987-6-54321-0')), retired, SENDERS, ()),
            'empty payer name': (value(payer=''), ACCOUNTS, SENDERS, ()),
            'masked payer name only': (value(payer='ท***'), ACCOUNTS, SENDERS, ()),
            'the name also fits the borrower': (value(), ACCOUNTS, SENDERS, ['ทดลอง บัญชีเรา']),
            'the name is near a candidate': (value(), ACCOUNTS, SENDERS, ['สมชาย ใจดี', 'สมชาย ใจดี\nหดลอง บัญชีเรา']),
            'transfer not confirmed': (value(transfer_successful=False), ACCOUNTS, SENDERS, ()),
            'not a payment receipt': (value(is_payment_receipt=False), ACCOUNTS, SENDERS, ()),
            'no lines for that account': (value(), ACCOUNTS, {'b': 'ทดลอง บัญชีเรา'}, ()),
            'no senders': (value(), ACCOUNTS, None, ()),
            'numbers not strings': (value((OURS, 9876543210)), ACCOUNTS, SENDERS, ()),
            'malformed accounts': (value(), [{'id': 'a'}], SENDERS, ()),
            'malformed extraction': ({'is_payment_receipt': True, 'transfer_successful': True, 'account_numbers': 'x'}, ACCOUNTS, SENDERS, ()),
        }
        for name, (slip_value, accounts, senders, others) in cases.items():
            with self.subTest(name):
                self.assertFalse(outgoing_transfer(slip_value, accounts, senders, others))

    def test_match_account_is_unchanged(self):
        self.assertEqual(match_account([OTHER, OURS], ACCOUNTS)['id'], 'a')
        with self.assertRaisesRegex(Exception, 'RECIPIENT_UNKNOWN_OR_AMBIGUOUS'):
            match_account([OTHER], ACCOUNTS)

    def test_context_people_and_switch(self):
        holder_borrower = borrower('b1', 'borrower', 'ทดลอง บัญชีเรา')
        plain = borrower('b2', 'other', 'สมชาย ใจดี')
        m = master(plain)
        sender = {'borrower': plain, 'candidates': []}
        self.assertTrue(outgoing(ON, value(), m, sender))
        self.assertFalse(outgoing({}, value(), m, sender))
        self.assertFalse(outgoing(dict(ON, receipt_outgoing_ignore_enabled='true'), value(), m, sender))
        self.assertFalse(outgoing(ON, value(), m, {'borrower': holder_borrower, 'candidates': []}))
        # A weak context: every enabled candidate's lines count; a disabled one does not.
        self.assertFalse(outgoing(ON, value(), m, {'borrower': None, 'candidates': [plain, holder_borrower]}))
        self.assertTrue(outgoing(ON, value(), m, {'borrower': None, 'candidates': [plain, dict(holder_borrower, enabled=False)]}))
        self.assertFalse(outgoing(ON, value(), {'accounts': None}, sender))  # a fault is never outgoing


class ProcessTests(PayerBase):
    def setUp(self):
        super().setUp()
        self.people = master(borrower('b1', 'borrower', 'สมชาย ใจดี'))

    def status(self, row):
        return row['status'], row['detail']

    def test_outgoing_transfer_is_ignored_before_validation_and_keeps_its_extraction(self):
        row = self.run_job(self.webhook(), self.people, value(), config=dict(self.config, **ON))
        self.assertEqual(self.status(row), ('IGNORED', OUTGOING))
        self.assertEqual(json.loads(row['result'])['extraction']['payer_name'], HOLDER)

    def test_switch_off_or_no_holder_lines_is_todays_behaviour(self):
        for mid, config in (('m1', self.config), ('m2', dict(self.config, receipt_outgoing_ignore_enabled=False, receipt_outgoing_senders=SENDERS)),
                            ('m3', dict(self.config, receipt_outgoing_ignore_enabled=True, receipt_outgoing_senders={'zz': 'ทดลอง บัญชีเรา'}))):
            with self.subTest(mid):
                row = self.run_job(self.webhook(mid), self.people, value(reference='SYNOUT' + mid.upper()), config=config)
                self.assertEqual(row['status'], 'VALIDATED')

    def test_incoming_payments_into_the_holders_account_are_processed_as_today(self):
        config = dict(self.config, **ON)
        cases = (('m1', value((OTHER, OURS), payer='นาย สมชาย ใจดี')),   # the borrower pays into the holder's account
                 ('m2', value((OTHER, OURS))),                          # holder's name but ours printed last
                 ('m3', value(payer='นาย สมชาย ใจดี')),                  # ours first, the borrower's name
                 ('m4', value(payer='')))
        for mid, slip_value in cases:
            with self.subTest(mid):
                row = self.run_job(self.webhook(mid), self.people, dict(slip_value, reference='SYNIN' + mid.upper()), config=config)
                self.assertEqual(row['status'], 'VALIDATED')
        # The holder's name is also this borrower's payer line: never ignored.
        mine = master(borrower('b1', 'borrower', 'ทดลอง บัญชีเรา'))
        row = self.run_job(self.webhook('m5'), mine, dict(value(), reference='SYNINM5'), config=config)
        self.assertEqual(row['status'], 'VALIDATED')
        # An unconfirmed transfer holds exactly as today.
        row = self.run_job(self.webhook('m6'), self.people, dict(value(transfer_successful=False), reference='SYNINM6'), config=config)
        self.assertEqual(self.status(row), ('REVIEW', 'TRANSFER_NOT_CONFIRMED'))


class OutgoingConfigTests(unittest.TestCase):
    def setUp(self):
        self.config = load_json(ROOT / 'config.example.json')

    def test_template_is_off_with_no_names(self):
        self.assertIs(self.config['receipt_outgoing_ignore_enabled'], False)
        self.assertEqual(self.config['receipt_outgoing_senders'], {})
        validate_config(self.config)
        validate_config(dict(self.config, **ON))

    def test_refusals(self):
        for change, message in (({'receipt_outgoing_ignore_enabled': 'true'}, 'receipt_outgoing_ignore_enabled must be boolean'),
                                ({'receipt_outgoing_ignore_enabled': True}, 'requires receipt_outgoing_senders'),
                                ({'receipt_outgoing_senders': []}, 'must map cash account ids'),
                                ({'receipt_outgoing_senders': {'a': ''}}, 'must map cash account ids'),
                                ({'receipt_outgoing_senders': {'a': ['x']}}, 'must map cash account ids'),
                                ({'receipt_outgoing_senders': {'': 'ทดลอง บัญชีเรา'}}, 'must map cash account ids'),
                                ({'receipt_outgoing_senders': {'a': '\n'.join(['ก กกก'] * 6)}}, 'must map cash account ids'),
                                ({'receipt_outgoing_senders': {'a': 'ทดลอง บัญชีเรา\n' + 'ก' * 300}}, 'must map cash account ids')):
            with self.subTest(change), self.assertRaisesRegex(ConfigurationError, message):
                validate_config(dict(self.config, **change))


if __name__ == '__main__':
    unittest.main()
