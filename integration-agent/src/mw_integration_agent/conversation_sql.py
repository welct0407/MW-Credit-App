"""Bounded read-only SQL and loan payoff for the Claude Partner conversation (conversation_sql_read).

Read access is not narrowed beyond the mw_integration_agent role's own grants (owner decision, 21 October 2026:
the tool is used only by the owner and the Partner). The limits here are for stability and write safety.
The model writes one SELECT/WITH statement; a tokenizing guard rejects anything else before a connection is
opened: one statement, no comments, dollar quoting or escape strings, ASCII outside quotes, balanced
parentheses, no write/DDL/session/transaction keyword, no row locks and no function with a side effect or
one that runs query text (set_config, advisory locks, notify, backend signals, dblink, large objects,
pg_sleep, file reads, ts_stat/ts_rewrite, query_to_xml...). The server enforces the rest: the role, a READ
ONLY repeatable-read transaction that is always rolled back, statement/lock/idle timeouts, a fixed
search_path, a server-side cursor that fetches at most 501 rows and a running byte bound checked on the
server, so the client never holds more than the caps.
"""
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal
import json
import re
import uuid

from .config import ConfigurationError, auth_mode, iam_port, iam_user, load_secret
from .state import assume_role

ROLE = 'mw_integration_agent'
MAX_SQL = 8000
ROW_CAP = 500
RESULT_LIMIT = 262144
CELL_LIMIT = 262144
STATEMENT_TIMEOUT = '20s'
CURSOR = 'mw_conversation_sql'
BYTES = '__mw_row_bytes'
TOO_LARGE = 'SQL_RESULT_TOO_LARGE'
DENY_WORDS = ('INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'DROP', 'ALTER', 'CREATE', 'GRANT', 'REVOKE',
              'SET', 'RESET', 'COPY', 'CALL', 'DO', 'EXECUTE', 'PREPARE', 'LISTEN', 'NOTIFY', 'LOCK', 'VACUUM',
              'ANALYZE', 'REFRESH', 'COMMIT', 'ROLLBACK', 'BEGIN', 'START', 'SAVEPOINT', 'DECLARE', 'FETCH', 'INTO')
DENY = {w.lower() for w in DENY_WORDS}
# Functions with a side effect, a session change, a wait, a file read, or that execute SQL text given to them
# (ts_stat/ts_rewrite/query_to_xml* would otherwise reach set_config and anything else), and the two that act
# outside the read-only transaction (pg_logical_emit_message writes durable WAL; pg_export_snapshot). Matched by name,
# quoted or not, schema-qualified or not.
SIDE_EFFECTS = re.compile(r'(?:set_config|pg_advisory\w*|pg_try_advisory\w*|pg_notify|pg_terminate_backend|'
                          r'pg_cancel_backend|dblink\w*|lo_\w+|pg_sleep\w*|pg_read_\w+|pg_ls_\w+|pg_stat_file|'
                          r'ts_stat|ts_rewrite|query_to_xml\w*|cursor_to_xml\w*|table_to_xml\w*|schema_to_xml\w*|'
                          r'database_to_xml\w*|pg_logical_emit_message|pg_export_snapshot)', re.I)
WORD = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')
NUMBER = re.compile(r'(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?')
OPERATOR = re.compile(r'[-+*/<>=~!@#%^&|`?:]+')


def disabled(config):
    if config.get('conversation_sql_read_enabled') is not True or not config.get('database_enabled'):
        raise ConfigurationError('SQL_READ_DISABLED')


class Token:
    __slots__ = ('kind', 'text', 'value', 'start', 'end')

    def __init__(self, kind, text, value, start, end):
        self.kind, self.text, self.value, self.start, self.end = kind, text, value, start, end

    def word(self, *words):
        return self.kind == 'word' and self.value.lower() in words


def tokenize(text):
    """Words, quoted identifiers, literals, numbers, punctuation and operators, with offsets."""
    tokens, i = [], 0
    while i < len(text):
        char = text[i]
        if char in ' \t\r\n':
            i += 1
            continue
        if char in ("'", '"'):
            end, body = i + 1, []
            while True:
                if end >= len(text):
                    raise ConfigurationError('SQL_UNTERMINATED_QUOTE')
                if text[end] == char:
                    if end + 1 < len(text) and text[end + 1] == char:
                        body.append(char)
                        end += 2
                        continue
                    break
                body.append(text[end])
                end += 1
            previous = tokens[-1] if tokens else None
            # E'...' and U&'...' / U&"..." (also right after a quoted name, as in "text"E'...').
            if previous and previous.end == i and (previous.word('e', 'u') or previous.text.endswith('&')):
                raise ConfigurationError('SQL_ESCAPE_STRINGS_NOT_ALLOWED')
            tokens.append(Token('string' if char == "'" else 'quoted', text[i:end + 1], ''.join(body), i, end + 1))
            i = end + 1
            continue
        if not (char.isascii() and char.isprintable()):
            raise ConfigurationError('SQL_NON_ASCII_OUTSIDE_QUOTES')
        for kind, pattern in (('word', WORD), ('number', NUMBER), ('operator', OPERATOR)):
            match = pattern.match(text, i)
            if match:
                tokens.append(Token(kind, match.group(0), match.group(0), i, match.end()))
                i = match.end()
                break
        else:
            if char in '(),.[];':
                tokens.append(Token('punct', char, char, i, i + 1))
                i += 1
            else:
                raise ConfigurationError('SQL_UNSUPPORTED_CHARACTER')
    return tokens


def guard(text):
    """Reject anything but one plain SELECT/WITH statement without side effects. Runs before connecting."""
    if not isinstance(text, str) or not text.strip():
        raise ConfigurationError('SQL_EMPTY')
    if len(text) > MAX_SQL:
        raise ConfigurationError(f'SQL_TOO_LONG: at most {MAX_SQL} characters')
    if '\x00' in text:
        raise ConfigurationError('SQL_NUL_NOT_ALLOWED')
    if '--' in text or '/*' in text or '*/' in text:
        raise ConfigurationError('SQL_COMMENTS_NOT_ALLOWED')
    if '$' in text:
        raise ConfigurationError('SQL_DOLLAR_QUOTING_OR_PARAMETERS_NOT_ALLOWED')
    tokens = tokenize(text)
    if any(t.kind == 'punct' and t.value == ';' for t in tokens) or any(';' in t.value for t in tokens if t.kind == 'quoted'):
        raise ConfigurationError('SQL_ONE_STATEMENT_WITHOUT_SEMICOLON')
    if not tokens[0].word('select', 'with'):
        raise ConfigurationError('SQL_MUST_START_WITH_SELECT_OR_WITH')
    depth = 0
    for token in tokens:
        if token.kind == 'punct' and token.value in '()':
            depth += 1 if token.value == '(' else -1
            if depth < 0:
                raise ConfigurationError('SQL_UNBALANCED_PARENTHESES')
    if depth:
        raise ConfigurationError('SQL_UNBALANCED_PARENTHESES')
    for index, token in enumerate(tokens):
        if token.word('for') and index + 1 < len(tokens) and tokens[index + 1].word('update', 'share', 'no', 'key'):
            raise ConfigurationError('SQL_ROW_LOCKING_NOT_ALLOWED')
        if token.kind not in ('word', 'quoted'):
            continue
        if token.value.lower() in DENY:
            raise ConfigurationError('SQL_KEYWORD_NOT_ALLOWED: ' + token.value.upper())
        if SIDE_EFFECTS.fullmatch(token.value):
            raise ConfigurationError('SQL_FUNCTION_NOT_ALLOWED: ' + token.value[:60])
    return text


def prepare(text):
    """The statement sent to the server: the user query as a subquery under a server-side byte bound.

    The running total of row sizes is checked on the server; a result over RESULT_LIMIT fails there with an
    error naming TOO_LARGE (a non-constant cast, so it cannot be folded at plan time) before it is sent.
    """
    guard(text)
    total = '"' + BYTES + '"'
    return (f'SELECT r.* FROM (SELECT q.*, sum(pg_column_size(q.*)) OVER (ROWS UNBOUNDED PRECEDING) AS {total} '
            f'FROM (\n{text}\n) AS q) AS r WHERE CASE WHEN r.{total} > {RESULT_LIMIT} '
            f"THEN ('{TOO_LARGE} ' || r.{total})::integer > 0 ELSE true END")


def connect_raw(**kwargs):
    import psycopg
    return psycopg.connect(**kwargs)


@contextmanager
def connect(config):
    """The guarded read-only session; always rolled back. Never takes a DSN, option or role from content."""
    disabled(config)
    if config.get('database_host') not in ('127.0.0.1', '::1') or config.get('database_user') != ROLE:
        raise ConfigurationError('UNAPPROVED_SQL_READ_DATABASE')
    common = dict(host=config['database_host'], dbname=config['database_name'], connect_timeout=10, autocommit=True,
                  application_name='mw-conversation-sql', options='-c default_transaction_read_only=on')
    mode = auth_mode(config, 'database_')
    if mode == 'iam':
        login = dict(port=iam_port(config), user=iam_user(config))
    else:
        if config.get('database_port') != 5432:
            raise ConfigurationError('UNAPPROVED_SQL_READ_DATABASE')
        login = dict(port=5432, user=ROLE, password=load_secret(config, 'database_password_file'))
    conn = connect_raw(**login, **common)
    try:
        if mode == 'iam':
            assume_role(conn, ROLE)
        conn.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        conn.execute(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT}'")
        conn.execute("SET LOCAL lock_timeout = '2s'")
        conn.execute("SET LOCAL idle_in_transaction_session_timeout = '30s'")
        conn.execute('SET LOCAL search_path = pg_catalog, public')
        conn.execute("SET LOCAL timezone = 'Asia/Bangkok'")
        conn.execute('SET LOCAL standard_conforming_strings = on')  # the guard's tokenizer assumes it
        identity = conn.execute('SELECT current_user, current_database()').fetchone()
        if tuple(identity) != (ROLE, config['database_name']):
            raise ConfigurationError('SQL_READ_IDENTITY_MISMATCH')
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def plain(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, timedelta):
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return '[binary ' + str(len(bytes(value))) + ' bytes]'
    if isinstance(value, float) and value != value:
        return 'NaN'
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def database_error(exc):
    """A bounded server message the model can act on; never a connection detail or credential."""
    state = getattr(exc, 'sqlstate', None) or ''
    diag = getattr(exc, 'diag', None)
    message = (getattr(diag, 'message_primary', None) or '').replace('\n', ' ')[:300]
    if state == '57014':
        return ConfigurationError('SQL_STATEMENT_TIMEOUT: narrow or aggregate the query')
    if state == '55P03':
        return ConfigurationError('SQL_LOCK_TIMEOUT')
    if state == '22P02' and TOO_LARGE in message:
        return ConfigurationError(TOO_LARGE + ': select fewer columns or rows')
    if state[:2] in ('42', '22', '0A', '25', '21', '2B', '54', '53'):
        return ConfigurationError(f'SQL_ERROR {state}: {message}')
    return None


def run(config, statement, parameters=None):
    """Execute through a server-side cursor: the client never holds more than ROW_CAP + 1 rows."""
    import psycopg
    try:
        with connect(config) as conn:
            cursor = conn.cursor(name=CURSOR)
            try:
                cursor.execute(statement, parameters)
                if cursor.description is None:
                    raise ConfigurationError('SQL_NO_RESULT_SET')
                columns = [c.name for c in cursor.description]
                rows = cursor.fetchmany(ROW_CAP + 1)
            finally:
                cursor.close()
            return columns, rows
    except psycopg.Error as exc:
        mapped = database_error(exc)
        if mapped is None:
            raise
        raise mapped from None


def oversized(value):
    if isinstance(value, (str, bytes, bytearray)):
        return len(value) > CELL_LIMIT
    if isinstance(value, (dict, list, tuple)):
        return len(json.dumps(plain(value), ensure_ascii=False).encode()) > CELL_LIMIT
    return False


def query(config, text):
    """sql_query: the guarded statement's rows as an observation body."""
    disabled(config)
    columns, rows = run(config, prepare(text))
    if columns and columns[-1] == BYTES:
        columns, rows = columns[:-1], [tuple(r)[:-1] for r in rows]
    if len(rows) > ROW_CAP:
        raise ConfigurationError('SQL_ROW_CAP_NARROW_QUERY: more than 500 rows; aggregate, filter or page with LIMIT/OFFSET')
    if len(set(columns)) != len(columns):
        raise ConfigurationError('SQL_DUPLICATE_COLUMN_NAMES: give every output column a distinct alias')
    if any(oversized(value) for row in rows for value in row):
        raise ConfigurationError(TOO_LARGE + ': a value is over 256 KB')
    result = {'columns': columns, 'rows': [dict(zip(columns, plain(list(r)), strict=True)) for r in rows],
              'row_count': len(rows), 'complete': True}
    if len(json.dumps(result, ensure_ascii=False).encode()) > RESULT_LIMIT:
        raise ConfigurationError(TOO_LARGE + ': select fewer columns or rows')
    return result


def payoff(config, loan_id):
    """loan_payoff: the encoded Daily Interest payoff for today (Bangkok), or why the loan is ineligible."""
    import psycopg
    disabled(config)
    if not isinstance(loan_id, str) or not loan_id.strip() or len(loan_id) > 200 or '\x00' in loan_id:
        raise ConfigurationError('INVALID_LOAN_ID')
    try:
        _, rows = run(config, "SELECT public.loan_close_calculation_v83(%s, (now() AT TIME ZONE 'Asia/Bangkok')::date)",
                      (loan_id,))
    except psycopg.errors.RaiseException as exc:
        message = (getattr(exc.diag, 'message_primary', None) or 'not eligible').replace('\n', ' ')[:300]
        return {'loan_id': loan_id, 'eligible': False, 'reason': message, 'complete': True}
    return {'loan_id': loan_id, 'eligible': True, 'calculation': plain(rows[0][0]), 'complete': True}
