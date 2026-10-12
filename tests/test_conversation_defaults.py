import unittest
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.conversation_defaults import resolve_creation_defaults

ID = '12345678-1234-4234-8234-123456789abc'


def definition(fields, values=None):
    return {'columns': {k: {'native': {'default': v}} for k, v in fields.items()},
            'defaults': {'values': values or {}},
            'context': {'businessDate': '2026-10-12', 'actorLoginEmail': 'actor@example.invalid'}}


class DefaultsTest(unittest.TestCase):
    def run_defaults(self, fields, supplied=None, responses=(), values=None, wanted=None):
        calls, rows = [], iter(responses)
        class Client:
            def __init__(self, config, scope): self.scope = scope
            def query(self, resource, columns, predicate, limit):
                calls.append((self.scope, resource, columns, predicate, limit))
                return next(rows)
        result = resolve_creation_defaults({}, 'oltp', 'Payments', definition(fields, values),
                    supplied or {}, ID, wanted or list(fields), Client)
        return result, calls

    def test_explicit_values_and_stable_identity(self):
        fields = {'Amount': {'kind': 'literal'}, 'Flag': {'kind': 'literal'},
                  'Note': {'kind': 'literal'}, 'Row ID': {'kind': 'new-id'}, 'Other': {'kind': 'pending'}}
        result, calls = self.run_defaults(fields, {'Amount': 0, 'Flag': False, 'Note': None},
                                        wanted=['Amount', 'Flag', 'Note', 'Row ID'])
        self.assertEqual(result, {'Row ID': ID})
        self.assertEqual(calls, [])

    def test_default_requires_unique_account(self):
        fields = {'Account': {'kind': 'resolver', 'name': 'disbursement-account'}}
        for rows in ([], [{'Row ID': 'a'}, {'Row ID': 'b'}]):
            with self.assertRaises(ConfigurationError): self.run_defaults(fields, responses=[rows])
        result, calls = self.run_defaults(fields, responses=[[{'Row ID': 'a'}]])
        self.assertEqual(result, {'Account': 'a'})
        self.assertEqual(calls[0][3]['args'][-1]['value'], 'ch:lisa')
        self.assertEqual(calls[0][4], 2)

    def test_payment_account_and_holder_dependency(self):
        fields = {'Ref Received By Cash Holder': {'kind': 'resolver', 'name': 'payment-receiving-holder'},
                  'Ref Received By Cash Account': {'kind': 'resolver', 'name': 'payment-receiving-account'}}
        result, calls = self.run_defaults(fields, {'Ref Borrower': 'b', 'Allocation Method': 'Lump Sum'}, [
            [{'Row ID': 'b', 'Ref Preferred Receiving Cash Account': 'a'}],
            [{'Row ID': 'a', 'Active': True, 'Ref Cash Holder': 'h'}],
            [{'Row ID': 'a', 'Active': True, 'Ref Cash Holder': 'h'}]])
        self.assertEqual(result, {'Ref Received By Cash Account': 'a', 'Ref Received By Cash Holder': 'h'})
        self.assertEqual(len(calls), 3)

    def test_inactive_preference_uses_unique_default(self):
        fields = {'Account': {'kind': 'resolver', 'name': 'loan-receiving-account'}}
        result, _ = self.run_defaults(fields, {'Ref Borrowers': 'b'}, [
            [{'Row ID': 'b', 'Ref Preferred Receiving Cash Account': 'old'}],
            [{'Row ID': 'old', 'Active': False, 'Ref Cash Holder': 'h'}], [{'Row ID': 'fallback'}]])
        self.assertEqual(result['Account'], 'fallback')

    def test_ledger_excludes_from_account(self):
        fields = {'To': {'kind': 'resolver', 'name': 'ledger-to-account'}}
        result, calls = self.run_defaults(fields, {'Ref To Cash Holder': 'h', 'Ref From Cash Account': 'a'},
                                        [[{'Row ID': 'b'}]])
        self.assertEqual(result['To'], 'b')
        self.assertEqual(calls[0][3]['args'][-1], {'op': 'ne', 'field': 'Row ID', 'value': 'a'})

    def test_unmapped_missing_and_explicit_null_fail_without_fallback(self):
        for descriptor in ({'kind': 'pending'}, {'kind': 'resolver', 'name': 'unknown'}, {'kind': 'business-date'}):
            with self.assertRaises(ConfigurationError): self.run_defaults({'x': descriptor})
        with self.assertRaises(ConfigurationError):
            self.run_defaults({'Holder': {'kind': 'resolver', 'name': 'payment-receiving-holder'}},
                              {'Ref Received By Cash Account': None})

    def test_token_uses_server_clock_actor_and_persisted_id(self):
        result, calls = self.run_defaults({'Token': {'kind': 'resolver', 'name': 'payment-request-token'}})
        self.assertEqual(result['Token'], f'2026-10-12|{ID}|actor@example.invalid')
        self.assertEqual(calls, [])

    def test_first_day_charge_loan_chain(self):
        fields = {'Account': {'kind': 'resolver', 'name': 'payment-receiving-account'}}
        result, _ = self.run_defaults(fields, {'Allocation Method': 'First-day Auto', 'Ref Target Charge': 'c'}, [
            [{'Row ID': 'c', 'Ref Loans': 'l'}], [{'Row ID': 'l', 'Ref Disbursed From Cash Account': 'a'}],
            [{'Row ID': 'a', 'Active': True, 'Ref Cash Holder': 'h'}]])
        self.assertEqual(result['Account'], 'a')

    def test_latest_date_overflow_never_guesses(self):
        fields = {'Day': {'kind': 'resolver', 'name': 'latest-statement-date'}}
        with self.assertRaises(ConfigurationError):
            self.run_defaults(fields, responses=[[{'Statement Date': '2026-10-12'}] * 1001])
        result, calls = self.run_defaults(fields, responses=[[{'Statement Date': '2026-10-11'}, {'Statement Date': '2026-10-12'}]])
        self.assertEqual(result['Day'], '2026-10-12')
        self.assertEqual(calls[0][0], 'oltp')

    def test_latest_date_uses_authenticated_server_aggregate(self):
        fields = {'Day': {'kind': 'resolver', 'name': 'latest-statement-date'}}
        result, calls = self.run_defaults(fields, values={'Day': '2026-10-12'})
        self.assertEqual(result['Day'], '2026-10-12')
        self.assertEqual(calls, [])


if __name__ == '__main__': unittest.main()
