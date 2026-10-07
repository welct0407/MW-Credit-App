"""Read-only DEV65 V66 preflight. Counts and privilege booleans only.

An optional app role must come from current connection configuration evidence;
the administrator connection is never treated as proof of AppSheet's role.
"""
import argparse
import json
import ReceiptCorrectionDev as transport


def run(app_role=None, role_evidence=None):
    if bool(app_role) != bool(role_evidence):
        raise ValueError('Configured app role and its current evidence are required together')

    def read(c, params):
        c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        c.execute("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s'; SET LOCAL timezone='UTC'")
        c.execute("SET LOCAL application_name='r051-linked-reimbursement-preflight'")
        identity = c.execute('SELECT current_database(),session_user').fetchone()
        if identity != ('loan_manager_dev', 'postgres'):
            raise ValueError('DEV identity changed')
        history = c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
        if history != ('65', -2087638333):
            raise ValueError('Expected reviewed DEV65; reconcile before preflight')
        result = dict(database=identity[0], instance='appsheet-pg-prod-20260914', host='34.21.174.215',
                      version=65, checksum=history[1], read_only=True,
                      snapshot_at=str(c.execute('SELECT transaction_timestamp()').fetchone()[0]))
        counts = c.execute('''SELECT count(*),count(*) FILTER(WHERE e."Row ID" IS NULL),
          count(*) FILTER(WHERE e."Amount"::numeric<=0 OR e."Amount" IS NULL),
          count(*) FILTER(WHERE e."Ref Paid By Cash Holder" IS DISTINCT FROM 'ch:tommy'),
          count(*) FILTER(WHERE e."Row ID" IS NULL OR
            (e."Amount"::numeric>0 AND e."Ref Paid By Cash Holder"='ch:tommy') IS NOT TRUE)
          FROM public."Cash Ledger" l LEFT JOIN public."Business Expenses" e ON e."Row ID"=l."Ref Business Expense"
          WHERE l."Entry Origin"='Manual' AND l."Movement Type"='Expense Reimbursement'
            AND l."Ref Business Expense" IS NOT NULL''').fetchone()
        result['linked_manual_reimbursements'] = dict(zip(
            ['count', 'missing_expense', 'nonpositive_or_null_amount', 'non_tommy_or_null_payer', 'violations'], counts))

        def privileges(role):
            if not c.execute('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=%s)', [role]).fetchone()[0]:
                raise ValueError('Configured role does not exist')
            checks = {}
            for table, operations in [('Business Expenses', ('SELECT', 'UPDATE')), ('Cash Ledger', ('SELECT', 'INSERT', 'UPDATE')),
                                      ('Cash Accounts', ('SELECT',)), ('Cash Holders', ('SELECT',))]:
                for operation in operations:
                    checks[table + '.' + operation] = c.execute('SELECT has_table_privilege(%s,%s,%s)',
                        [role, 'public."' + table + '"', operation]).fetchone()[0]
            checks['Business Expenses.UPDATE Row ID'] = c.execute('SELECT has_column_privilege(%s,%s,%s,%s)',
                [role, 'public."Business Expenses"', 'Row ID', 'UPDATE']).fetchone()[0]
            for table in ('Cash Accounts', 'Cash Holders'):
                checks[table + '.UPDATE any column for existing FOR SHARE'] = c.execute('SELECT has_any_column_privilege(%s,%s,%s)',
                    [role, 'public."' + table + '"', 'UPDATE']).fetchone()[0]
            return checks

        result['verified_admin_role'] = identity[1]
        result['admin_privileges'] = privileges(identity[1])
        result['configured_app_role'] = dict(status='pending exact current configured SQL username') if not app_role else dict(
            status='checked from supplied configuration evidence', role=app_role, evidence=role_evidence, privileges=privileges(app_role))
        result['scope'] = 'No rows, amounts, recipients or credentials exported; no migration, seeds, repairs or source writes'
        c.rollback()
        return result

    result = transport.dev_connection(read)
    path = transport.REPO/'outputs/r051-receipt-corrections/linked-reimbursement-dev65-preflight.json'
    path.write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--app-role')
    p.add_argument('--role-evidence')
    args = p.parse_args()
    print(json.dumps(run(args.app_role, args.role_evidence), indent=2))
