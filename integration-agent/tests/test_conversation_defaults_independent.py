import unittest
from mw_integration_agent.conversation_defaults import resolve_creation_defaults
from mw_integration_agent.config import ConfigurationError

IDENTITY = '12345678-1234-4234-8234-123456789abc'


class NativeDefaultsIndependent(unittest.TestCase):
    def test_unwanted_resolver_explicit_null_and_persisted_id_need_no_transport(self):
        def forbidden(*args):
            raise AssertionError('No transport is permitted for these defaults')
        definition = {'columns': {'Row ID': {'native': {'default': {'kind': 'new-id'}}},
                                  'Account': {'native': {'default': {'kind': 'resolver', 'name': 'disbursement-account'}}},
                                  'Null': {'native': {'default': {'kind': 'pending'}}}}}
        for _ in range(2):
            self.assertEqual(resolve_creation_defaults({}, 'oltp', 'Payments', definition,
                {'Null': None}, IDENTITY, ['Row ID', 'Null'], forbidden), {'Row ID': IDENTITY})

    def test_identity_chain_refuses_wrong_key_missing_column_and_duplicate(self):
        definition = {'columns': {'Holder': {'native': {'default': {'kind': 'resolver', 'name': 'payment-receiving-holder'}}}}}
        for rows in ([{'Row ID': 'wrong', 'Active': True, 'Ref Cash Holder': 'h'}],
                     [{'Row ID': 'account', 'Active': True}],
                     [{'Row ID': 'account', 'Active': True, 'Ref Cash Holder': 'h'}] * 2):
            calls = []
            class Client:
                def __init__(self, config, scope): self.scope = scope
                def query(self, table, columns, predicate, limit):
                    calls.append((self.scope, table, predicate, limit))
                    return rows
            with self.assertRaisesRegex(ConfigurationError, '^NATIVE_DEFAULT_UNAVAILABLE$'):
                resolve_creation_defaults({}, 'oltp', 'Payments', definition,
                    {'Ref Received By Cash Account': 'account'}, IDENTITY, ['Holder'], Client)
            self.assertEqual(calls, [('oltp', 'Cash Accounts', {'op': 'eq', 'field': 'Row ID', 'value': 'account'}, 2)])

    def test_authenticated_full_relation_date_avoids_truncated_query(self):
        def forbidden(*args): raise AssertionError('Aggregate requires no page fallback')
        definition = {'columns': {'Day': {'native': {'default': {'kind': 'resolver', 'name': 'latest-statement-date'}}}},
                      'defaults': {'values': {'Day': '2026-10-12'}}}
        self.assertEqual(resolve_creation_defaults({}, 'olap', 'Cash Statement Context', definition,
            {}, IDENTITY, ['Day'], forbidden), {'Day': '2026-10-12'})

