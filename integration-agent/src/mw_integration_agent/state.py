"""Bounded PostgreSQL journal connections; no model SQL or automatic migrations.

The dialect adapter accepts only the application's existing journal SQL. Domain
journals retain their behavior; ingress and notice routing have explicit adapters.
Connections are borrowed only during SQL work, never for a whole model turn.
"""
from contextlib import contextmanager
from pathlib import Path
import re
import sqlite3
import threading
import time

from .config import PASSWORD_PORT, ConfigurationError, auth_mode, iam_port, load_secret

# Session limits live here, not in role settings: after SET ROLE (IAM mode) role-level
# settings do not apply, and startup options override them anyway (AGT-STATE-04).
STATEMENT_TIMEOUT_MS = 15000
LOCK_TIMEOUT_MS = 3000
IDLE_IN_TRANSACTION_TIMEOUT_MS = 30000

TABLES = {
    'instagram-ingress.db': {'receipts': 'ingress_receipts', 'messages': 'ingress_messages', 'ingress_work': 'ingress_work'},
    'receipt-processing.db': {x: x for x in ('receipt_cursor','receipt_jobs','receipt_keys','receipt_emails',
        'partner_reviews','partner_review_replies','conversation_poll_state','conversation_poll_messages','receipt_reconsiderations',
        'receipt_assets','receipt_payment_links')},
    'partner-notices.db': {'partner_notices':'partner_notices'},
    'cash-statement-delivery.db': {x:x for x in ('cash_statement_sends','cash_statement_emails')},
}
_pools = {}
_lock = threading.Lock()


def enabled(config):
    return bool(config and config.get('state_backend') == 'postgres')


def session_role(config, role):
    """The role a fresh connection must SET ROLE to, or None when the login role is the role itself."""
    if role not in ('worker', 'relay'):
        raise ConfigurationError('UNAPPROVED_STATE_ROLE')
    return 'mw_agent_' + role if auth_mode(config, 'agent_database_') == 'iam' else None


# Roles the agent IAM login may SET ROLE to. The business-database write roles join for
# ALL-ARCH-03 part 2b (database_dml_auth / receipt_projector_auth = 'iam').
SESSION_ROLES = ('mw_agent_worker', 'mw_agent_relay', 'mw_integration_agent',
                 'mw_reviewer_dml', 'mw_reviewer_dml_dev', 'mw_receipt_projector')


def assume_role(conn, role):
    """IAM logins (ALL-ARCH-03) are NOINHERIT: SET ROLE must be the first statement on the connection.

    The one place agent code issues SET ROLE over psycopg; None means the login role is the role itself.
    """
    if role is not None:
        if role not in SESSION_ROLES:
            raise ConfigurationError('UNAPPROVED_SESSION_ROLE')
        conn.execute('SET ROLE ' + role)
    return conn


def open_connection(config, role='worker', **overrides):
    """A new mw_agent connection for role (parameters() plus overrides), already SET ROLE under IAM."""
    import psycopg
    conn = psycopg.connect(**{**parameters(config, role), **overrides})
    try:
        return assume_role(conn, session_role(config, role))
    except BaseException:
        conn.close()
        raise


def parameters(config, role='worker'):
    mode = auth_mode(config, 'agent_database_')
    if (config.get('agent_database_host') not in ('127.0.0.1','::1') or
        config.get('agent_database_port') != PASSWORD_PORT or config.get('agent_database_name') != 'mw_agent'):
        raise ConfigurationError('UNAPPROVED_AGENT_DATABASE')
    if role not in ('worker','relay'):
        raise ConfigurationError('UNAPPROVED_STATE_ROLE')
    options = (f'-c statement_timeout={STATEMENT_TIMEOUT_MS} -c lock_timeout={LOCK_TIMEOUT_MS}'
               f' -c idle_in_transaction_session_timeout={IDLE_IN_TRANSACTION_TIMEOUT_MS}')
    value = dict(host=config['agent_database_host'], port=PASSWORD_PORT, dbname='mw_agent', connect_timeout=10,
        autocommit=True, application_name='mw-agent-state-' + role, options=options)
    if mode == 'iam':
        # The proxy's auto-iam-authn listener supplies the credential; the login is the VM
        # service account's IAM user and the caller runs SET ROLE mw_agent_<role> (ALL-ARCH-03).
        value.update(port=iam_port(config), user=config['database_iam_user'])
    else:
        value.update(user='mw_agent_' + role, password=load_secret(config, 'agent_database_' + role + '_password_file'))
    return value


class Pool:
    def __init__(self, config, role):
        self.config, self.role = config, role
        self.limit = 1  # six current workers/receiver <= 8; no request-local pool
        self.condition = threading.Condition()
        self.idle, self.total = [], 0

    @contextmanager
    def connection(self):
        deadline = time.monotonic() + 5
        conn = None
        with self.condition:
            while not self.idle and self.total >= self.limit:
                remaining = deadline-time.monotonic()
                if remaining <= 0:
                    raise ConfigurationError('STATE_POOL_BUSY')
                self.condition.wait(remaining)
            if self.idle:
                conn = self.idle.pop()
            else:
                self.total += 1
        try:
            if conn is None or conn.closed or conn.broken:
                conn = open_connection(self.config, self.role)
            yield conn
        finally:
            with self.condition:
                if conn is not None and not conn.closed and not conn.broken:
                    self.idle.append(conn)
                else:
                    self.total -= 1
                self.condition.notify()


def pool(config, role='worker'):
    key = (config.get('agent_database_host'), config.get('agent_database_port'),
           config.get('agent_database_name'), config.get('state_generation'), role)
    with _lock:
        if key not in _pools:
            _pools[key] = Pool(dict(config), role)
        return _pools[key]


def fence(conn, config):
    row = conn.execute("SELECT backend,active_generation,processing_enabled FROM runtime.service_control WHERE service_name='agent'").fetchone()
    if not row or row[0] != 'postgres' or str(row[1]) != config.get('state_generation') or not row[2]:
        raise ConfigurationError('STATE_GENERATION_INACTIVE')


@contextmanager
def transaction(config, role='worker', readonly=False):
    with pool(config, role).connection() as conn:
        with conn.transaction():
            if readonly:
                conn.execute('SET TRANSACTION READ ONLY')
            fence(conn, config)
            yield conn


class Row(dict):
    def __getitem__(self, key):
        return tuple(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Result:
    def __init__(self, cursor):
        self.rowcount = cursor.rowcount
        self.rows = [] if cursor.description is None else [Row(zip([c.name for c in cursor.description], r)) for r in cursor.fetchall()]
        self.position = 0

    def fetchone(self):
        if self.position == len(self.rows):
            return None
        row = self.rows[self.position]
        self.position += 1
        return row

    def fetchall(self):
        rows = self.rows[self.position:]
        self.position = len(self.rows)
        return rows

    def __iter__(self):
        return iter(self.fetchall())


def dialect(query, mapping, stream=None):
    """Translate controlled journal statements, never inbound/model SQL."""
    query = query.strip().rstrip(';')
    if not re.match(r'^(SELECT|INSERT|UPDATE)\b', query, re.I):
        raise ConfigurationError('STATE_SQL_NOT_ALLOWED')
    replace_poll = bool(re.fullmatch(r'INSERT OR REPLACE INTO conversation_poll_state VALUES \(\?,\?\)', query, re.I))
    if replace_poll:
        query = 'INSERT INTO conversation_poll_state VALUES (?,?)'
    ignore = bool(re.match(r'INSERT OR IGNORE\b', query, re.I))
    query = re.sub(r'^INSERT OR IGNORE\b', 'INSERT', query, flags=re.I)
    # Replace identifiers/parameters only outside SQL string/identifier literals.
    parts = re.split(r"('(?:[^']|'')*'|\"(?:[^\"]|\"\")*\")", query.replace('%','%%'))
    for i in range(0, len(parts), 2):
        part = parts[i].replace('?', '%s')
        part = re.sub(r'\b(FROM|JOIN|INTO|UPDATE)\s+(\w+)\b',
            lambda m: m[1]+' runtime.'+mapping[m[2]] if m[2] in mapping else m[0], part, flags=re.I)
        parts[i] = part
    query = ''.join(parts)
    # Only this journal's fixed tables may be used through its adapter.
    for name in re.findall(r'\b(?:FROM|JOIN|INTO|UPDATE)\s+([\w.]+)', query, re.I):
        if name not in {'runtime.'+n for n in mapping.values()}:
            raise ConfigurationError('STATE_TABLE_NOT_ALLOWED')
    if stream:
        if query.upper().startswith('INSERT'):
            query, n = re.subn(r'(INSERT INTO runtime\.partner_notices\s*\()([^)]*)(\)\s*VALUES\s*\()',
                lambda m: m[1]+'stream,'+m[2]+m[3]+"'"+stream+"',", query, count=1, flags=re.I)
            if n != 1:
                raise ConfigurationError('NOTICE_EXPLICIT_COLUMNS_REQUIRED')
        else:
            query, n = re.subn(r'\bWHERE\b', "WHERE stream='"+stream+"' AND", query, count=1, flags=re.I)
            if n != 1:
                raise ConfigurationError('NOTICE_SCOPED_WHERE_REQUIRED')
    if ignore:
        query += ' ON CONFLICT DO NOTHING'
    if replace_poll:
        query += ' ON CONFLICT (conversation_id) DO UPDATE SET checked_through=EXCLUDED.checked_through'
    return query


class PostgresJournal:
    postgres = True

    def __init__(self, config, filename, readonly=False):
        if filename not in TABLES:
            raise ConfigurationError('UNKNOWN_STATE_JOURNAL')
        self.config, self.filename, self.readonly = config, filename, readonly
        self.mapping = TABLES[filename]
        self.stream = {'partner-notices.db':'receipt'}.get(filename)
        self.conn, self._context = None, None

    def __enter__(self):
        if self.conn is not None:
            raise ConfigurationError('NESTED_JOURNAL_TRANSACTION')
        self._context = transaction(self.config, readonly=self.readonly)
        self.conn = self._context.__enter__()
        return self

    def __exit__(self, typ, value, traceback):
        context = self._context
        self.conn, self._context = None, None
        return context.__exit__(typ, value, traceback)

    def execute(self, query, params=()):
        import psycopg
        sql = dialect(query, self.mapping, self.stream)
        select = query.lstrip().upper().startswith('SELECT')
        if self.readonly and not select:
            raise ConfigurationError('STATE_READONLY_JOURNAL')
        def run(conn):
            result = Result(conn.execute(sql, params))
            # A statement that changed nothing leaves no audit trace (AGT-STATE-01).
            if not select and result.rowcount != 0:
                from .audit import state_change
                state_change(conn, self.config, self.filename, query, params, result.rowcount)
            return result
        try:
            if self.conn is not None:
                return run(self.conn)
            with transaction(self.config, readonly=self.readonly) as conn:
                return run(conn)
        except psycopg.IntegrityError as exc:
            # Preserve the domain duplicate handling, with the failed transaction
            # already rolled back by the enclosing context before recovery writes.
            raise sqlite3.IntegrityError('STATE_CONSTRAINT_'+str(exc.sqlstate)) from None

    def executemany(self, query, values):
        for value in values:
            self.execute(query, value)

    def commit(self):
        if self.conn is not None:
            raise ConfigurationError('EXPLICIT_COMMIT_INSIDE_JOURNAL_TRANSACTION')

    def close(self):
        if self.conn is not None:
            raise ConfigurationError('UNCLOSED_JOURNAL_TRANSACTION')


def connect(path, config=None, readonly=False):
    if enabled(config):
        return PostgresJournal(config, Path(path).name, readonly=readonly)
    if config and config.get('state_backend', 'sqlite') != 'sqlite':
        raise ConfigurationError('UNKNOWN_STATE_BACKEND')
    db = sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro', uri=True) if readonly else sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def is_postgres(db):
    return isinstance(db, PostgresJournal)
