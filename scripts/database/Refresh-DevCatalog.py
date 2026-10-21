"""DEV refresh companion: catalog snapshot, owner/ACL reconciliation to that snapshot, verification.

The refresh itself (pg_restore of the PROD snapshot into loan_manager_dev) stays an explicit,
atomic pg_restore command in the refresh plan. This tool does the part that is error-prone by hand:

  snapshot   record every owner, privilege, trigger, extension and Flyway row of the target
             (and, with --fingerprints, one count and content digest per table).
  reconcile  make the target's owners and privileges equal the snapshot again after a restore
             with --no-owner --no-privileges. Dry run by default (executes, verifies, rolls back);
             --apply commits only when the residual difference is empty.
  compare    report the catalog difference against the snapshot and, with --prod-baseline, the
             table fingerprints against the PROD snapshot's baseline-private.json.
  lab-prepare (lab only) create NOLOGIN placeholders for every role a live snapshot names, their
             memberships and the database owner, so a rehearsal can reconcile against that snapshot.

Inside the owner window pass `reconcile --window-owner <role>` for each prepared owner: their temporary
CREATE ON SCHEMA public then stays for `owner-authority-cli.mjs restore` instead of being revoked.

Targets. Live DEV (default) is reached through the Linux IAP tunnel (scripts/database/cloud-db-tunnel.sh,
127.0.0.1:$MW_DB_TUNNEL_PORT) with the credential files that `Get-DbEnvironment development [-Admin]`
writes (--identity read|admin); it asserts loan_manager_dev, a NULL server address, the cloudsqladmin
role and the system identifier of mw-credit-pg-20261017, and it never accepts another database.
--lab-port targets a loopback disposable cluster (rehearsal and rollback rehearsal) and refuses a
live-looking server. No DSN, no ambient PG* routing, no secret in any output.

Owner changes on Cloud SQL need the temporary owner window (owner-authority-cli.mjs prepare/restore).
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, '/workspace/.setup/python-deps')
import psycopg  # noqa: E402
from psycopg import sql  # noqa: E402

LIVE_DATABASE = 'loan_manager_dev'
LIVE_SYSTEM_IDENTIFIER = 7685391508477894672  # mw-credit-pg-20261017
READ_USER = 'codex-cloud-read@clever-oasis-508610-n7.iam'
AMBIENT = ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'PGOPTIONS', 'DATABASE_URL')
SYSTEM_SCHEMAS = "n.nspname NOT LIKE 'pg\\_%' AND n.nspname<>'information_schema'"
GRANT_TARGET = {'TABLE': 'TABLE', 'VIEW': 'TABLE', 'MATERIALIZED VIEW': 'TABLE', 'FOREIGN TABLE': 'TABLE', 'SEQUENCE': 'SEQUENCE',
                'FUNCTION': 'FUNCTION', 'PROCEDURE': 'PROCEDURE', 'SCHEMA': 'SCHEMA', 'DATABASE': 'DATABASE', 'TYPE': 'TYPE', 'DOMAIN': 'TYPE'}

# ---------------------------------------------------------------- catalog capture
OBJECT_QUERIES = {
    'relations': f"""
        SELECT CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
               format('%I.%I',n.nspname,c.relname), pg_get_userbyid(c.relowner),
               coalesce(c.relacl, acldefault((CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END)::"char", c.relowner)),
               EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'),
               EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i'))
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p','v','m','S','f') AND {SYSTEM_SCHEMAS}""",
    'routines': f"""
        SELECT CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
               format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)), pg_get_userbyid(p.proowner),
               coalesce(p.proacl, acldefault('f'::"char",p.proowner)),
               EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'), false
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.prokind IN ('f','p','w','a') AND {SYSTEM_SCHEMAS}""",
    'types': f"""
        SELECT CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, format('%I.%I',n.nspname,t.typname), pg_get_userbyid(t.typowner),
               coalesce(t.typacl, acldefault('T'::"char",t.typowner)),
               EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e'), false
        FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE {SYSTEM_SCHEMAS} AND (t.typtype IN ('e','d','r') OR (t.typtype='c' AND t.typrelid<>0 AND (SELECT relkind FROM pg_class WHERE oid=t.typrelid)='c'))""",
    'schemas': f"""
        SELECT 'SCHEMA', quote_ident(n.nspname), pg_get_userbyid(n.nspowner), coalesce(n.nspacl, acldefault('n'::"char",n.nspowner)), false, false
        FROM pg_namespace n WHERE {SYSTEM_SCHEMAS}""",
    'database': """
        SELECT 'DATABASE', quote_ident(d.datname), pg_get_userbyid(d.datdba), coalesce(d.datacl, acldefault('d'::"char",d.datdba)), false, false
        FROM pg_database d WHERE d.datname=current_database()""",
}
# One round trip per object kind: the ACL is exploded server-side (the tunnel route is latency-bound).
ACL_WRAP = """
    SELECT o.kind, o.ident, o.owner, o.extension, o.linked,
           coalesce(json_agg(json_build_object('grantee', CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END,
                                               'privilege', e.privilege_type, 'grantable', e.is_grantable) ORDER BY e.grantee, e.privilege_type)
                    FILTER (WHERE e.privilege_type IS NOT NULL), '[]'::json)
    FROM ({query}) o(kind, ident, owner, acl, extension, linked)
    LEFT JOIN LATERAL aclexplode(o.acl) e ON true
    GROUP BY o.kind, o.ident, o.owner, o.extension, o.linked"""
COLUMN_ACLS = f"""
    SELECT format('%I.%I',n.nspname,c.relname), quote_ident(a.attname),
           CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END, e.privilege_type, e.is_grantable
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace, aclexplode(a.attacl) e
    WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL AND {SYSTEM_SCHEMAS} ORDER BY 1,2,3,4"""
TRIGGERS = f"""
    SELECT format('%I.%I',n.nspname,c.relname), t.tgname, t.tgenabled, t.tgfoid::regprocedure::text
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND {SYSTEM_SCHEMAS} ORDER BY 1,2"""
EXTENSIONS = "SELECT e.extname, n.nspname, e.extversion FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1"
FLYWAY = "SELECT installed_rank, version, description, checksum, success FROM public.flyway_schema_history ORDER BY installed_rank"
ROLE_STATE = """
    SELECT r.rolname, r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolcreaterole, r.rolcreatedb,
           coalesce((SELECT json_agg(json_build_object('role',g.rolname,'inherit',m.inherit_option,'set',m.set_option,'admin',m.admin_option) ORDER BY g.rolname)
                     FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid WHERE m.member=r.oid),'[]'::json)
    FROM pg_roles r WHERE r.rolname=ANY(%s) ORDER BY 1"""


def entry(grantee, privilege, grantable):
    return {'grantee': grantee, 'privilege': privilege, 'grantable': bool(grantable)}


def capture_catalog(cur):
    objects = []
    for query in OBJECT_QUERIES.values():
        for kind, ident, owner, extension, linked, acl_entries in cur.execute(ACL_WRAP.format(query=query)).fetchall():
            # linked: an identity/serial sequence, whose owner follows its table
            objects.append({'kind': kind, 'ident': ident, 'owner': owner, 'extension': bool(extension), 'linked': bool(linked),
                            'acl': [entry(e['grantee'], e['privilege'], e['grantable']) for e in acl_entries], 'columns': []})
    by_ident = {(o['kind'], o['ident']): o for o in objects}
    by_relation = {o['ident']: o for o in objects if GRANT_TARGET.get(o['kind']) == 'TABLE'}
    for ident, column, grantee, privilege, grantable in cur.execute(COLUMN_ACLS).fetchall():
        if ident in by_relation:
            by_relation[ident]['columns'].append({'column': column, **entry(grantee, privilege, grantable)})
    objects.sort(key=lambda o: (o['kind'], o['ident']))
    names = sorted({o['owner'] for o in objects} | {e['grantee'] for o in objects for e in o['acl'] + o['columns'] if e['grantee'] != 'PUBLIC'})
    roles = [{'role': r[0], 'login': r[1], 'inherit': r[2], 'superuser': r[3], 'createrole': r[4], 'createdb': r[5], 'memberOf': r[6]}
             for r in cur.execute(ROLE_STATE, (names,)).fetchall()]
    triggers = [{'table': t[0], 'name': t[1], 'enabled': t[2], 'function': t[3]} for t in cur.execute(TRIGGERS).fetchall()]
    extensions = [{'name': e[0], 'schema': e[1], 'version': e[2]} for e in cur.execute(EXTENSIONS).fetchall()]
    has_flyway = cur.execute("SELECT to_regclass('public.flyway_schema_history') IS NOT NULL").fetchone()[0]
    flyway = [{'rank': f[0], 'version': f[1], 'description': f[2], 'checksum': f[3], 'success': f[4]} for f in cur.execute(FLYWAY).fetchall()] if has_flyway else []
    return {'objects': objects, 'roles': roles, 'triggers': triggers, 'extensions': extensions, 'flyway': flyway}, by_ident


def fingerprints(cur):
    result = {}
    tables = cur.execute("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT LIKE 'pg\\_%' AND schemaname<>'information_schema' ORDER BY 1,2").fetchall()
    for schema, table in tables:
        query = sql.SQL("SELECT count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema), sql.Identifier(table))
        count, digest = cur.execute(query).fetchone()
        result[schema + '.' + table] = {'count': count, 'digest': digest}
    return result


# ---------------------------------------------------------------- pure diff logic (unit-tested)
def acl_index(entries):
    return {(e['grantee'], e['privilege']): bool(e['grantable']) for e in entries}


def column_index(entries):
    return {(e['column'], e['grantee'], e['privilege']): bool(e['grantable']) for e in entries}


def grantee_sql(name):
    return 'PUBLIC' if name == 'PUBLIC' else quote_ident(name)


def quote_ident(name):
    return '"' + name.replace('"', '""') + '"'


def privilege_statements(kind, ident, before, now):
    """GRANT/REVOKE statements that turn the live privilege set `now` into `before` for one object."""
    target = GRANT_TARGET[kind] + ' ' + ident
    statements = []
    for (grantee, privilege), grantable in sorted(before.items()):
        current = now.get((grantee, privilege))
        if current is None:
            statements.append(f'GRANT {privilege} ON {target} TO {grantee_sql(grantee)}' + (' WITH GRANT OPTION' if grantable else ''))
        elif grantable and not current:
            statements.append(f'GRANT {privilege} ON {target} TO {grantee_sql(grantee)} WITH GRANT OPTION')
        elif current and not grantable:
            statements.append(f'REVOKE GRANT OPTION FOR {privilege} ON {target} FROM {grantee_sql(grantee)}')
    for (grantee, privilege) in sorted(now):
        if (grantee, privilege) not in before:
            statements.append(f'REVOKE {privilege} ON {target} FROM {grantee_sql(grantee)}')
    return statements


def column_statements(ident, before, now):
    statements = []
    for (column, grantee, privilege), grantable in sorted(before.items()):
        current = now.get((column, grantee, privilege))
        if current is None:
            statements.append(f'GRANT {privilege} ({column}) ON TABLE {ident} TO {grantee_sql(grantee)}' + (' WITH GRANT OPTION' if grantable else ''))
        elif grantable and not current:
            statements.append(f'GRANT {privilege} ({column}) ON TABLE {ident} TO {grantee_sql(grantee)} WITH GRANT OPTION')
        elif current and not grantable:
            statements.append(f'REVOKE GRANT OPTION FOR {privilege} ({column}) ON TABLE {ident} FROM {grantee_sql(grantee)}')
    for (column, grantee, privilege) in sorted(now):
        if (column, grantee, privilege) not in before:
            statements.append(f'REVOKE {privilege} ({column}) ON TABLE {ident} FROM {grantee_sql(grantee)}')
    return statements


def owner_statements(before_objects, now_objects):
    """ALTER ... OWNER TO statements for objects present in both snapshots whose owner differs.

    Schemas come first: on Cloud SQL the new owner of an object needs CREATE on its schema, which it
    only has once it owns the schema again (a superuser lab does not show this)."""
    statements, skipped = [], []
    for key, now in sorted(now_objects.items(), key=lambda item: (item[0][0] != 'SCHEMA', item[0])):
        before = before_objects.get(key)
        if not before or before['owner'] == now['owner']:
            continue
        kind, ident = key
        if kind == 'DATABASE' or now['extension'] or before['extension']:
            skipped.append({'kind': kind, 'ident': ident, 'before': before['owner'], 'now': now['owner']})
            continue
        if now.get('linked'):
            continue  # follows its table's ALTER OWNER
        statements.append(f'ALTER {kind} {ident} OWNER TO {quote_ident(before["owner"])}')
    return statements, skipped


def privilege_plan(before_objects, now_objects):
    statements = []
    for key, now in sorted(now_objects.items()):
        before = before_objects.get(key)
        if not before:
            continue
        statements += privilege_statements(key[0], key[1], acl_index(before['acl']), acl_index(now['acl']))
        if GRANT_TARGET.get(key[0]) == 'TABLE':
            statements += column_statements(key[1], column_index(before['columns']), column_index(now['columns']))
    return statements


def strip_window_grants(objects, window_owners):
    """Drop the owner window's temporary CREATE ON SCHEMA public entries (owner-authority-cli.mjs prepare) so the
    reconcile neither revokes them nor counts them as residual; `restore` removes them afterwards."""
    if not window_owners:
        return objects
    owners = set(window_owners)
    result = []
    for o in objects:
        if o['kind'] == 'SCHEMA' and o['ident'] == 'public':
            o = dict(o, acl=[e for e in o['acl'] if not (e['privilege'] == 'CREATE' and e['grantee'] in owners)])
        result.append(o)
    return result


def lab_prepare_statements(snapshot, existing_roles, existing_memberships, database):
    """Roles, memberships and the database owner a disposable cluster needs before a rehearsal against a live
    snapshot: every role the snapshot names, as NOLOGIN placeholders (no credential), and the database owner."""
    statements = []
    roles = {r['role']: r for r in snapshot['catalog']['roles']}
    created = set()
    for name in sorted(roles):
        if name == 'postgres' or name.startswith('pg_') or name in existing_roles:
            continue
        statements.append(f'CREATE ROLE {quote_ident(name)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS '
                          + ('INHERIT' if roles[name]['inherit'] else 'NOINHERIT'))
        created.add(name)
    known = set(existing_roles) | created | {'postgres'}
    for name in sorted(roles):
        for m in roles[name]['memberOf']:
            if m['role'] in known and name in known and (m['role'], name) not in existing_memberships:
                statements.append(f'GRANT {quote_ident(m["role"])} TO {quote_ident(name)} WITH INHERIT {str(bool(m["inherit"])).upper()}, '
                                  f'SET {str(bool(m["set"])).upper()}, ADMIN {str(bool(m["admin"])).upper()}')
    db_owner = next((o['owner'] for o in snapshot['catalog']['objects'] if o['kind'] == 'DATABASE'), None)
    if db_owner and db_owner != 'postgres' and db_owner in known:
        statements.append(f'ALTER DATABASE {quote_ident(database)} OWNER TO {quote_ident(db_owner)}')
    return statements


def catalog_difference(before, now):
    """Report-only comparison: objects, owners, privileges, triggers, extensions, Flyway rows."""
    b, n = before['objects'], now['objects']
    bk, nk = {(o['kind'], o['ident']): o for o in b}, {(o['kind'], o['ident']): o for o in n}
    diff = {'missingObjects': sorted(f'{k[0]} {k[1]}' for k in bk if k not in nk),
            'extraObjects': sorted(f'{k[0]} {k[1]}' for k in nk if k not in bk),
            'ownerDifferences': [], 'privilegeDifferences': []}
    for key in sorted(k for k in bk if k in nk):
        if bk[key]['owner'] != nk[key]['owner']:
            diff['ownerDifferences'].append({'object': f'{key[0]} {key[1]}', 'before': bk[key]['owner'], 'now': nk[key]['owner']})
        if acl_index(bk[key]['acl']) != acl_index(nk[key]['acl']) or column_index(bk[key]['columns']) != column_index(nk[key]['columns']):
            diff['privilegeDifferences'].append({'object': f'{key[0]} {key[1]}', 'before': bk[key]['acl'] + bk[key]['columns'], 'now': nk[key]['acl'] + nk[key]['columns']})
    trig = lambda s: {(t['table'], t['name']): (t['enabled'], t['function']) for t in s['triggers']}
    bt, nt = trig(before), trig(now)
    diff['triggerDifferences'] = sorted(f'{k[0]} {k[1]}: {bt.get(k)} -> {nt.get(k)}' for k in set(bt) | set(nt) if bt.get(k) != nt.get(k))
    ext = lambda s: {(e['name'], e['schema'], e['version']) for e in s['extensions']}
    diff['extensionDifferences'] = sorted(f'{e[0]} {e[1]} {e[2]}' for e in ext(before) ^ ext(now))
    fly = lambda s: {(f['version'], f['checksum'], f['success']) for f in s['flyway']}
    diff['flywayDifferences'] = sorted(f'V{f[0]} checksum {f[1]} success {f[2]}' for f in fly(before) ^ fly(now))
    diff['equal'] = not any(diff[k] for k in diff if k != 'equal')
    return diff


def fingerprint_difference(expected, actual, expect_empty):
    """Tables whose count/digest differ from the PROD baseline, except those expected to be emptied."""
    differences, unexpected_empty = [], []
    for table in sorted(set(expected) | set(actual)):
        e, a = expected.get(table), actual.get(table)
        if table in expect_empty:
            if not a or a['count'] != 0:
                unexpected_empty.append(table)
            continue
        if e != a:
            differences.append({'table': table, 'expected': e, 'actual': a})
    return {'differences': differences, 'notEmptied': unexpected_empty, 'equal': not differences and not unexpected_empty}


# ---------------------------------------------------------------- connection and identity
def private_base():
    return Path(os.environ.get('MW_PRIVATE_ROOT') or Path.home() / '.mw-private')


def credential_file(name):
    path = private_base() / 'AppSheet-Loan-Project/credentials' / name
    if not path.exists() or path.is_symlink() or (path.stat().st_mode & 0o077):
        raise SystemExit(f'Credential file {path} missing or not private: run `pwsh -c ". scripts/database/Common.ps1; Get-DbEnvironment development [-Admin]"` first')
    return path.read_text().strip()


def connect(args):
    if any(os.environ.get(k) for k in AMBIENT):
        raise SystemExit('Remove ambient database routing overrides (PG*, DATABASE_URL)')
    if args.lab_port:
        conn = psycopg.connect(host='127.0.0.1', port=args.lab_port, dbname=args.lab_database, user='postgres', connect_timeout=10, autocommit=True)
        expect_user, expect_db, lab = 'postgres', args.lab_database, True
    else:
        port = int(os.environ.get('MW_DB_TUNNEL_PORT', '15432'))
        if args.identity == 'admin':
            user, password = 'postgres', credential_file('postgres-password.txt')
        else:
            user, password = READ_USER, credential_file('read-token.txt')
        conn = psycopg.connect(host='127.0.0.1', port=port, dbname=LIVE_DATABASE, user=user, password=password, sslmode='disable', connect_timeout=10, autocommit=True)
        del password
        expect_user, expect_db, lab = user, LIVE_DATABASE, False
    row = conn.execute("""SELECT current_database(), session_user, host(inet_server_addr()), (SELECT system_identifier FROM pg_control_system()),
                           EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cloudsqladmin'), clock_timestamp()""").fetchone()
    identity = {'database': row[0], 'sessionUser': row[1], 'serverAddress': row[2], 'systemIdentifier': row[3], 'cloudsqladmin': row[4], 'observedAt': row[5].isoformat(), 'lab': lab}
    if row[0] != expect_db or row[1] != expect_user:
        raise SystemExit(f'Target identity mismatch: {identity}')
    if lab:
        if row[2] not in (None, '127.0.0.1') or row[4] or row[3] == LIVE_SYSTEM_IDENTIFIER:
            raise SystemExit(f'Lab target looks live; refusing: {identity}')
    elif row[2] is not None or not row[4] or row[3] != LIVE_SYSTEM_IDENTIFIER:
        raise SystemExit(f'Live DEV identity rule failed (tunnel route expects NULL address, cloudsqladmin, instance identifier): {identity}')
    return conn, identity


def write_json(path, payload):
    if path:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', opener=lambda p, f: os.open(p, f, 0o600)) as handle:
            json.dump(payload, handle, indent=2, default=str)


# ---------------------------------------------------------------- modes
def mode_snapshot(args, conn, identity):
    with conn.transaction():
        conn.execute("SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='300s'; SET LOCAL lock_timeout='5s'")
        cur = conn.cursor()
        catalog, _ = capture_catalog(cur)
        prints = fingerprints(cur) if args.fingerprints else None
    payload = {'schemaVersion': 1, 'identity': identity, 'catalog': catalog, 'fingerprints': prints}
    write_json(args.out, payload)
    print(json.dumps({'mode': 'snapshot', 'identity': identity, 'objects': len(catalog['objects']), 'triggers': len(catalog['triggers']),
                      'flywayRows': len(catalog['flyway']), 'fingerprintedTables': len(prints) if prints else 0, 'out': args.out}))


def load_snapshot(path):
    data = json.loads(Path(path).read_text())
    if data.get('schemaVersion') != 1 or 'catalog' not in data:
        raise SystemExit('Unrecognized snapshot file')
    return data


def mode_reconcile(args, conn, identity):
    before = load_snapshot(args.before)
    if before['identity']['database'] != identity['database'] or (before['identity']['lab'] and not identity['lab']):
        raise SystemExit('Snapshot was taken on a different target (a lab snapshot never drives live DEV; a live snapshot may drive a lab)')
    before_objects = {(o['kind'], o['ident']): o for o in before['catalog']['objects']}
    window = args.window_owner or []
    report = {'mode': 'reconcile', 'identity': identity, 'before': args.before, 'apply': args.apply, 'windowOwners': window}
    with conn.transaction():
        conn.execute("SET LOCAL statement_timeout='300s'; SET LOCAL lock_timeout='15s'")
        cur = conn.cursor()
        _, now_objects = capture_catalog(cur)
        owners, skipped = owner_statements(before_objects, now_objects)
        for statement in owners:
            cur.execute(statement)
        now_catalog, _ = capture_catalog(cur)  # default ACLs follow the owner
        now_objects = {(o['kind'], o['ident']): o for o in strip_window_grants(now_catalog['objects'], window)}
        privileges = privilege_plan(before_objects, now_objects)
        for statement in privileges:
            cur.execute(statement)
        after, _ = capture_catalog(cur)
        after = dict(after, objects=strip_window_grants(after['objects'], window))
        residual = catalog_difference(before['catalog'], after)
        report.update({'ownerStatements': owners, 'ownerSkipped': skipped, 'privilegeStatements': privileges, 'residual': residual})
        clean = not residual['ownerDifferences'] and not residual['privilegeDifferences']
        if not args.apply or not clean:
            raise psycopg.Rollback()  # dry run, or a residual difference: nothing is committed
    report['committed'] = bool(args.apply and clean)
    write_json(args.report, report)
    summary = {k: (len(v) if isinstance(v, list) else v) for k, v in report.items() if k not in ('identity', 'residual')}
    summary['residual'] = {k: (len(v) if isinstance(v, list) else v) for k, v in report['residual'].items()}
    print(json.dumps(summary))
    if not clean:
        raise SystemExit('Residual owner or privilege difference remains; nothing committed')


def mode_lab_prepare(args, conn, identity):
    if not identity['lab']:
        raise SystemExit('lab-prepare targets a disposable cluster only')
    before = load_snapshot(args.before)
    with conn.transaction():
        cur = conn.cursor()
        existing_roles = {r[0] for r in cur.execute('SELECT rolname FROM pg_roles').fetchall()}
        existing_memberships = {(r[0], r[1]) for r in cur.execute(
            'SELECT g.rolname, m.rolname FROM pg_auth_members a JOIN pg_roles g ON g.oid=a.roleid JOIN pg_roles m ON m.oid=a.member').fetchall()}
        statements = lab_prepare_statements(before, existing_roles, existing_memberships, identity['database'])
        for statement in statements:
            cur.execute(statement)
    write_json(args.report, {'mode': 'lab-prepare', 'identity': identity, 'before': args.before, 'statements': statements})
    print(json.dumps({'mode': 'lab-prepare', 'statements': len(statements), 'roles': sum(s.startswith('CREATE ROLE') for s in statements)}))


def mode_compare(args, conn, identity):
    before = load_snapshot(args.before)
    with conn.transaction():
        conn.execute("SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='300s'; SET LOCAL lock_timeout='5s'")
        cur = conn.cursor()
        now, _ = capture_catalog(cur)
        report = {'mode': 'compare', 'identity': identity, 'before': args.before, 'catalog': catalog_difference(before['catalog'], now)}
        if args.prod_baseline:
            baseline = json.loads(Path(args.prod_baseline).read_text())
            expected = baseline.get('fingerprints') or baseline
            expect_empty = {t.strip() for t in (args.expect_empty or '').split(',') if t.strip()}
            report['fingerprints'] = fingerprint_difference(expected, fingerprints(cur), expect_empty)
    write_json(args.report, report)
    summary = {'mode': 'compare', 'catalogEqual': report['catalog']['equal'],
               'catalog': {k: len(v) for k, v in report['catalog'].items() if isinstance(v, list)}}
    if 'fingerprints' in report:
        summary['fingerprintsEqual'] = report['fingerprints']['equal']
        summary['fingerprintDifferences'] = [d['table'] for d in report['fingerprints']['differences']]
        summary['notEmptied'] = report['fingerprints']['notEmptied']
    print(json.dumps(summary))
    if not report['catalog']['equal'] or ('fingerprints' in report and not report['fingerprints']['equal']):
        raise SystemExit('Difference found; see the report')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('mode', choices=('snapshot', 'reconcile', 'compare', 'lab-prepare'))
    parser.add_argument('--identity', choices=('read', 'admin'), default='read', help='live DEV credential (reconcile needs admin)')
    parser.add_argument('--lab-port', type=int, help='loopback disposable cluster instead of live DEV')
    parser.add_argument('--lab-database', default=LIVE_DATABASE)
    parser.add_argument('--out', help='snapshot: JSON file to write')
    parser.add_argument('--fingerprints', action='store_true', help='snapshot: include one count and digest per table')
    parser.add_argument('--before', help='reconcile/compare: snapshot file')
    parser.add_argument('--apply', action='store_true', help='reconcile: commit when the residual difference is empty')
    parser.add_argument('--report', help='reconcile/compare: JSON report file')
    parser.add_argument('--prod-baseline', help='compare: baseline-private.json of the PROD snapshot (fingerprints)')
    parser.add_argument('--expect-empty', help='compare: comma-separated schema.table list expected to hold 0 rows')
    parser.add_argument('--window-owner', action='append', help='reconcile: owner role whose temporary CREATE ON SCHEMA public (owner window) must stay; repeatable')
    args = parser.parse_args(argv)
    if args.mode == 'lab-prepare' and (not args.lab_port or not args.before):
        parser.error('lab-prepare needs --lab-port and --before')
    if args.mode == 'snapshot' and not args.out:
        parser.error('snapshot needs --out')
    if args.mode in ('reconcile', 'compare', 'lab-prepare') and not args.before:
        parser.error(f'{args.mode} needs --before')
    if args.mode == 'reconcile' and not args.lab_port and args.identity != 'admin':
        parser.error('reconcile on live DEV needs --identity admin')
    conn, identity = connect(args)
    try:
        {'snapshot': mode_snapshot, 'reconcile': mode_reconcile, 'compare': mode_compare, 'lab-prepare': mode_lab_prepare}[args.mode](args, conn, identity)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
