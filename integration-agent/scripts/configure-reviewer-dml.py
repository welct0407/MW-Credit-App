"""Operator-only credential/role setup. Never available to conversational Codex.

Run on the authorized workstation against the verified environment configuration.
The credential is created outside Git (wherever --secret-file points), retained on
repeat runs, and installed on Debian separately. No application schema, rows,
triggers or migrations change. --environment selects the database/role pair
(ALL-ARCH-02).

--iam-member USER (ALL-ARCH-03 part 2b, after business V95) is the idempotent IAM
step instead: it creates the role NOLOGIN without a credential only when it is
missing, leaves an existing role and its grants unchanged, and makes sure USER
holds the role WITH INHERIT FALSE, SET TRUE and CONNECT on the database, so the
agent can sign in as USER and SET ROLE (database_dml_auth='iam').
"""
import argparse
import json
import re
import secrets
from pathlib import Path
import psycopg
from psycopg import sql
from mw_integration_agent.config import DATABASES, DML_ROLES, IAM_USER
from mw_integration_agent.conversation_dml import TABLES

INSTANCE = 'mw-credit-pg-20261017'


def configure(conn, password, role='mw_reviewer_dml'):
    """Create the role with explicit current grants; password None creates it NOLOGIN (IAM sign-in only)."""
    if role not in DML_ROLES.values():
        raise RuntimeError('Unknown reviewer DML role')
    if conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
        raise RuntimeError('Role already exists: inspect before changing existing grants or credential')
    name = sql.Identifier(role)
    if password is None:
        conn.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS').format(name))
    else:
        conn.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD {}').format(name, sql.Literal(password)))
    conn.execute(sql.SQL('ALTER ROLE {} SET default_transaction_read_only=on').format(name))
    conn.execute(sql.SQL("ALTER ROLE {} SET statement_timeout='15s'").format(name))
    conn.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO {}').format(sql.Identifier(conn.info.dbname), name))
    conn.execute(sql.SQL('GRANT USAGE ON SCHEMA public TO {}').format(name))
    # Explicit current resources only: no default privileges on future tables.
    conn.execute(sql.SQL('GRANT SELECT ON ALL TABLES IN SCHEMA public TO {}').format(name))
    conn.execute(sql.SQL('GRANT INSERT, UPDATE ON {} TO {}').format(
        sql.SQL(',').join(sql.Identifier('public', t) for t in TABLES if t != 'Cash Ledger'), name))
    # Existing invoker-rights posting triggers insert allocations. Reviewer DELETE is retired
    # (16 October 2026): no DELETE on any table. Since V93 the ledger projection
    # (sync_cash_ledger) runs as the ledger owner, so the reviewer holds no INSERT/UPDATE/DELETE
    # on "Cash Ledger"; payment edits only row-lock the payment's ledger rows
    # (payment_crud_prepare_core_v83, FOR UPDATE NOWAIT), which needs UPDATE on one column.
    # "Created At" is immutable under guard_cash_ledger, so this grant is lock-only; V93 restates it.
    # Neither resource/action is exposed as a model mutation tool.
    conn.execute(sql.SQL('GRANT INSERT, UPDATE ON public."Payment Allocations" TO {}').format(name))
    conn.execute(sql.SQL('GRANT UPDATE ("Created At") ON public."Cash Ledger" TO {}').format(name))
    # PostgreSQL FOR SHARE requires UPDATE on at least one column. Existing
    # cash_account_holder() locks both rows; labels confer no routing authority.
    conn.execute(sql.SQL('GRANT UPDATE ("Account Label") ON public."Cash Accounts" TO {}').format(name))
    conn.execute(sql.SQL('GRANT UPDATE ("Holder Name") ON public."Cash Holders" TO {}').format(name))
    # Fail closed if PUBLIC grants unexpectedly grant durable schema creation.
    row = conn.execute("SELECT has_schema_privilege(%s,'public','CREATE'), has_database_privilege(%s,current_database(),'CREATE')",
                       (role, role)).fetchone()
    if any(row): raise RuntimeError('Unexpected PUBLIC CREATE privileges; role setup rolled back')


def memberships(conn, role, member):
    return conn.execute('''SELECT m.inherit_option, m.set_option FROM pg_auth_members m
      JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
      WHERE r.rolname=%s AND u.rolname=%s''', (role, member)).fetchall()


def iam_member(conn, role, member):
    """Idempotent: create a missing role NOLOGIN, then member holds it INHERIT FALSE, SET TRUE with CONNECT.

    An existing role keeps its attributes and grants (its password LOGIN is removed only in the
    later cleanup). Returns what was done, for the operator readback.
    """
    if role not in DML_ROLES.values():
        raise RuntimeError('Unknown reviewer DML role')
    if not isinstance(member, str) or not re.fullmatch(IAM_USER, member):
        raise RuntimeError('Unexpected IAM database user')
    if not conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (member,)).fetchone():
        raise RuntimeError('IAM database user missing: ' + member)
    done = {'role_created': False, 'membership_granted': False}
    if not conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
        configure(conn, None, role)
        done['role_created'] = True
    if not (rows := memberships(conn, role, member)) or any(tuple(r) != (False, True) for r in rows):
        conn.execute(sql.SQL('GRANT {} TO {} WITH INHERIT FALSE, SET TRUE').format(sql.Identifier(role), sql.Identifier(member)))
        done['membership_granted'] = True
        # Another grantor's membership with INHERIT TRUE would survive this grant: fail closed.
        rows = memberships(conn, role, member)
        if not rows or any(tuple(r) != (False, True) for r in rows):
            raise RuntimeError('Unexpected membership options for ' + member + '; changes rolled back')
    conn.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO {}').format(sql.Identifier(conn.info.dbname), sql.Identifier(member)))
    return done


def target_for(environments, environment):
    """The (connection target, role) pair for an environment; identity is checked by instance name only."""
    target = environments[{'prod': 'production', 'dev': 'development'}[environment]]
    if (target['instance'], target['database'], target['user']) != (INSTANCE, DATABASES[environment], 'postgres'):
        raise RuntimeError('Unexpected ' + environment + ' identity')
    return target, DML_ROLES[environment]


def connect_admin(target):
    return psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'],
            user=target['user'], password=Path(target['passwordFile']).read_text().strip(),
            sslmode='require', connect_timeout=15)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--environments', required=True)
    sign_in = parser.add_mutually_exclusive_group(required=True)
    sign_in.add_argument('--secret-file', help='private credential path outside the repository (password role setup)')
    sign_in.add_argument('--iam-member', help='IAM database user to hold the role WITH INHERIT FALSE, SET TRUE (idempotent)')
    parser.add_argument('--environment', choices=sorted(DATABASES), default='prod')
    args = parser.parse_args()
    target, role = target_for(json.loads(Path(args.environments).read_text()), args.environment)
    if args.iam_member:
        with connect_admin(target) as conn:
            done = iam_member(conn, role, args.iam_member)
            rows = memberships(conn, role, args.iam_member)
        print(json.dumps({'database': target['database'], 'role': role, 'member': args.iam_member, **done,
                          'memberships': [{'inherit': r[0], 'set': r[1]} for r in rows]}))
        return
    path = Path(args.secret_file).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with path.open('x', encoding='utf-8') as f: f.write('Aa1!' + secrets.token_hex(32) + '\n')
    password = path.read_text().strip()
    with connect_admin(target) as conn:
        configure(conn, password, role)
    print(role + ' configured in ' + target['database'] + '; no application data/schema changes. Credential retained privately.')


if __name__ == '__main__': main()
