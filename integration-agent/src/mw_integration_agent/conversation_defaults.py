"""Resolve reviewed creation defaults through bounded native reads, before intent capture.

This supplies values, not write permission. The command mapper still owns allowed
fields and validation, and persists the result for recovery without recomputation.
"""
import re
from .config import ConfigurationError
from .conversation_api import NativeConversationClient


def resolve_creation_defaults(config, scope, resource, definition, supplied,
                              target_id, wanted_fields,
                              client_factory=NativeConversationClient):
    if (scope not in ('oltp', 'olap') or not isinstance(supplied, dict)
            or not isinstance(target_id, str)
            or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', target_id)):
        raise ConfigurationError('INVALID_NATIVE_DEFAULT_CONTEXT')
    columns = definition.get('columns', {})
    wanted = set(wanted_fields)
    if not wanted.issubset(columns):
        raise ConfigurationError('UNKNOWN_NATIVE_DEFAULT_FIELD')
    resolved, resolving, clients = {}, set(), {}

    def unavailable():
        raise ConfigurationError('NATIVE_DEFAULT_UNAVAILABLE')

    def query(table, fields, predicate, limit=2, query_scope=scope):
        if query_scope not in clients:
            clients[query_scope] = client_factory(config, query_scope)
        rows = clients[query_scope].query(table, fields, predicate, limit)
        if not isinstance(rows, list) or len(rows) > limit or any(not isinstance(r, dict) for r in rows):
            unavailable()
        return rows

    def eq(field, value):
        return {'op': 'eq', 'field': field, 'value': value}

    def key(value):
        if not isinstance(value, str) or not value or len(value) > 512:
            unavailable()
        return value

    def one(table, ident, fields):
        rows = query(table, ['Row ID', *fields], eq('Row ID', key(ident)))
        if len(rows) != 1 or rows[0].get('Row ID') != ident or any(f not in rows[0] for f in fields):
            unavailable()
        return rows[0]

    def account(ident):
        return one('Cash Accounts', ident, ['Active', 'Ref Cash Holder'])

    def default_account(holder, exclude=None):
        parts = [eq('Active', True), eq('Default Account', True), eq('Ref Cash Holder', key(holder))]
        if exclude is not None:
            parts.append({'op': 'ne', 'field': 'Row ID', 'value': key(exclude)})
        rows = query('Cash Accounts', ['Row ID'], {'op': 'and', 'args': parts})
        if len(rows) != 1:
            unavailable()  # Never inherit AppSheet ANY's arbitrary choice.
        return key(rows[0].get('Row ID'))

    def value(field):
        if field in supplied:
            return supplied[field]  # Explicit null/false/zero are never replaced.
        if field in resolved:
            return resolved[field]
        if field not in wanted:
            return None
        return resolve(field)

    def preferred(borrower):
        preferred_id = one('Borrowers', borrower, ['Ref Preferred Receiving Cash Account'])['Ref Preferred Receiving Cash Account']
        if preferred_id:
            row = account(preferred_id)
            if row['Active'] is True:
                return preferred_id
        return default_account('ch:dad')

    def borrower_for_loan(loan):
        return one('Loans', loan, ['Ref Borrowers'])['Ref Borrowers']

    def loan_for_charge(charge):
        return one('Charges', charge, ['Ref Loans'])['Ref Loans']

    def callback(name):
        if name == 'disbursement-account':
            return default_account('ch:lisa')
        if name == 'borrower-receiving-account':
            preferred_id = value('Ref Preferred Receiving Cash Account')
            if preferred_id and account(preferred_id)['Active'] is True:
                return preferred_id
            return default_account('ch:dad')
        if name == 'loan-receiving-account':
            return preferred(value('Ref Borrowers'))
        if name == 'charge-receiving-account':
            return preferred(borrower_for_loan(value('Ref Loans')))
        if name == 'payment-receiving-account':
            if value('Allocation Method') == 'First-day Auto':
                loan = loan_for_charge(value('Ref Target Charge'))
                ident = one('Loans', loan, ['Ref Disbursed From Cash Account'])['Ref Disbursed From Cash Account']
                if ident:
                    if account(ident)['Active'] is not True:
                        unavailable()
                    return ident
                return default_account('ch:lisa')
            return preferred(value('Ref Borrower'))
        if name == 'payment-receiving-holder':
            ident = value('Ref Received By Cash Account')
            if not ident:
                unavailable()  # Creation has no existing payment to LOOKUP.
            row = account(ident)
            if row['Active'] is not True:
                unavailable()
            return key(row['Ref Cash Holder'])
        if name == 'expense-paying-account':
            return default_account(value('Ref Paid By Cash Holder'))
        if name == 'ledger-from-account':
            return default_account(value('Ref From Cash Holder'))
        if name == 'ledger-to-account':
            return default_account(value('Ref To Cash Holder'), value('Ref From Cash Account'))
        if name == 'latest-statement-date':
            rows = query('Cash Account Daily Summary Recent', ['Statement Date'], None, 1001, 'oltp')
            if not rows or len(rows) == 1001:
                unavailable()
            dates = [row.get('Statement Date') for row in rows]
            if any(not isinstance(day, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) for day in dates):
                unavailable()
            return max(dates)
        if name == 'payment-request-token':
            context = definition.get('context', {})
            day, actor = context.get('businessDate'), context.get('actorLoginEmail')
            if (not isinstance(day, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day)
                    or not isinstance(actor, str) or not re.fullmatch(r'[^\s@|]+@[^\s@|]+', actor)):
                unavailable()
            return f'{day}|{target_id}|{actor}'
        unavailable()

    def resolve(field):
        if field in resolving:
            unavailable()
        descriptor = columns[field].get('native', {}).get('default', {})
        kind = descriptor.get('kind')
        if kind in (None, 'none'):
            return None
        resolving.add(field)
        try:
            if kind == 'new-id':
                result = target_id
            elif kind == 'resolver':
                # This one row-independent aggregate is resolved by the pinned
                # native catalogue over the full relation, not a truncated page.
                values = definition.get('defaults', {}).get('values', {})
                if descriptor.get('name') == 'latest-statement-date' and field in values:
                    result = values[field]
                else:
                    result = callback(descriptor.get('name'))
            elif kind in ('literal', 'business-date', 'business-now', 'actor-login'):
                values = definition.get('defaults', {}).get('values', {})
                if field not in values:
                    unavailable()
                result = values[field]
            else:
                unavailable()
            if result is None:
                unavailable()
            resolved[field] = result
            return result
        finally:
            resolving.remove(field)

    for field in sorted(wanted):
        if field not in supplied and field not in resolved:
            resolve(field)
    return resolved
