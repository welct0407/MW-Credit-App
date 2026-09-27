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

from .config import ConfigurationError, load_secret


TABLES = {
    'instagram-ingress.db': {'receipts': 'ingress_receipts', 'messages': 'ingress_messages', 'ingress_work': 'ingress_work'},
    'receipt-processing.db': {x: x for x in ('receipt_cursor','receipt_jobs','receipt_keys','receipt_emails',
        'partner_reviews','partner_review_replies','conversation_poll_state','conversation_poll_messages','receipt_reconsiderations',
        'receipt_assets','receipt_payment_links')},
    'partner-conversations.db': {'conversations':'conversations','turns':'conversation_turns','tool_calls':'conversation_tool_calls',
        **{x:x for x in ('conversation_operations','conversation_dml','conversation_dml_inserts')}},
    'partner-notices.db': {'partner_notices':'partner_notices'},
    'conversation-notices.db': {'partner_notices':'partner_notices'},
    'cash-statement-delivery.db': {x:x for x in ('cash_statement_sends','cash_statement_emails')},
}
_pools = {}
_lock = threading.Lock()


def enabled(config):
    return bool(config and config.get('state_backend') == 'postgres')


def parameters(config, role='worker'):
    if (config.get('agent_database_host') not in ('127.0.0.1','::1') or
        config.get('agent_database_port') != 5432 or config.get('agent_database_name') != 'mw_agent'):
        raise ConfigurationError('UNAPPROVED_AGENT_DATABASE')
    user = 'mw_agent_' + role
    if role not in ('worker','relay'):
        raise ConfigurationError('UNAPPROVED_STATE_ROLE')
    return dict(host=config['agent_database_host'], port=5432, dbname='mw_agent', user=user,
        password=load_secret(config, 'agent_database_' + role + '_password_file'), connect_timeout=10,
        autocommit=True, application_name='mw-agent-state-' + role,
        options='-c statement_timeout=30000 -c lock_timeout=5000')


class Pool:
    def __init__(self, config, role):
        self.config, self.role = config, role
        self.limit = 1  # six current workers/receiver <= 8; no request-local pool
        self.condition = threading.Condition()
        self.idle, self.total = [], 0

    @contextmanager
    def connection(self):
        import psycopg
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
                conn = psycopg.connect(**parameters(self.config, self.role))
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
def transaction(config, role='worker'):
    with pool(config, role).connection() as conn:
        with conn.transaction():
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

    def __init__(self, config, filename):
        if filename not in TABLES:
            raise ConfigurationError('UNKNOWN_STATE_JOURNAL')
        self.config, self.filename = config, filename
        self.mapping = TABLES[filename]
        self.stream = {'partner-notices.db':'receipt','conversation-notices.db':'conversation'}.get(filename)
        self.conn, self._context = None, None

    def __enter__(self):
        if self.conn is not None:
            raise ConfigurationError('NESTED_JOURNAL_TRANSACTION')
        self._context = transaction(self.config)
        self.conn = self._context.__enter__()
        return self

    def __exit__(self, typ, value, traceback):
        context = self._context
        self.conn, self._context = None, None
        return context.__exit__(typ, value, traceback)

    def execute(self, query, params=()):
        import psycopg
        sql = dialect(query, self.mapping, self.stream)
        def run(conn):
            result = Result(conn.execute(sql, params))
            if not query.lstrip().upper().startswith('SELECT'):
                from .audit import state_change
                state_change(conn, self.config, self.filename, query, params, result.rowcount)
            return result
        try:
            if self.conn is not None:
                return run(self.conn)
            with transaction(self.config) as conn:
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
        return PostgresJournal(config, Path(path).name)
    if config and config.get('state_backend', 'sqlite') != 'sqlite':
        raise ConfigurationError('UNKNOWN_STATE_BACKEND')
    db = sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro', uri=True) if readonly else sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def is_postgres(db):
    return isinstance(db, PostgresJournal)
