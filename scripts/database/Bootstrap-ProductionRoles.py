"""Owner-authorized closed PROD prerequisites; never migrates or grants runtime access."""
import argparse,json,os,sys,uuid
from pathlib import Path
from datetime import datetime,timezone
sys.dont_write_bytecode=True
sys.path.insert(0,'C:/Users/ideaadmin/AppData/Local/AppSheetLoanTools/python-deps')
import psycopg
from psycopg.rows import dict_row
from psycopg import sql
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--approval-reference',required=True)
a=p.parse_args()
assert a.approval_reference.strip()
assert not any(os.environ.get(k) for k in ['PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','DATABASE_URL'])
root=Path(__file__).resolve().parents[2]
t=json.loads((root/'database/environments.json').read_text())['production']
assert (t['instance'],t['host'],t['port'],t['database'],t['user'])==('mw-credit-pg-20261017','TO_FILL_AFTER_CREATE_HOST',5432,'loan_manager_prod','postgres')
password=Path(t['passwordFile']).resolve()
assert password.is_relative_to(Path('C:/Users/ideaadmin/Documents/ChatGPT').resolve())
roles=['mw_app_dev','mw_app_dev_journal_owner','mw_app_prod','mw_app_prod_journal_owner']
app,owner=roles[2:]
folder=Path('C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/candidate-artifacts-20261011')/('production-role-bootstrap-'+uuid.uuid4().hex)
folder.mkdir(exist_ok=False)
mem="SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE r.rolname=ANY(%s) OR m.rolname=ANY(%s) ORDER BY 1,2,3"
acl="SELECT pg_get_userbyid(a.grantor) grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,a.privilege_type privilege,a.is_grantable grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' ORDER BY a.grantor,a.grantee,a.privilege_type"
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=password.read_text().strip(),sslmode='require',connect_timeout=10,autocommit=True,row_factory=dict_row) as c:
    x=c.execute("SELECT current_database() database,session_user operator,host(inet_server_addr()) host,inet_server_port() port,r.rolsuper,r.rolcreaterole,r.rolbypassrls FROM pg_roles r WHERE r.rolname=session_user").fetchone()
    assert x==dict(database='loan_manager_prod',operator='postgres',host='TO_FILL_AFTER_CREATE_HOST',port=5432,rolsuper=False,rolcreaterole=True,rolbypassrls=False)
    assert c.execute('SELECT version FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()['version']=='77'
    assert c.execute('SELECT rolname FROM pg_roles WHERE rolname=ANY(%s)',[[app,owner]]).fetchall()==[], 'Existing package requires recovery inspection'
    schema=c.execute("SELECT pg_get_userbyid(nspowner) grantor,pg_has_role(session_user,nspowner,'USAGE') owned,pg_has_role(session_user,nspowner,'SET') can_set FROM pg_namespace WHERE nspname='public'").fetchone()
    assert schema==dict(grantor='pg_database_owner',owned=True,can_set=True), 'Actual reviewed schema owner changed'
    before={'memberships':c.execute(mem,[roles,roles]).fetchall(),'schemaAcl':c.execute(acl).fetchall(),'schema':schema,'identity':x}
    (folder/'before.json').write_text(json.dumps(before,indent=2)+'\n')
    c.execute('BEGIN');c.execute("SET LOCAL statement_timeout='15s'")
    try:
        for name in [app,owner]: c.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT').format(sql.Identifier(name)))
        creation=c.execute(mem,[roles,roles]).fetchall()
        (folder/'raw-creation-memberships.json').write_text(json.dumps(creation,indent=2)+'\n')
        assert [m for m in creation if m['role'] in [app,owner] or m['member'] in [app,owner]]==[], 'Unexpected automatic role membership'
        c.execute('GRANT mw_app_prod TO mw_app_prod_journal_owner WITH ADMIN FALSE, INHERIT TRUE, SET FALSE')
        c.execute('GRANT mw_app_prod_journal_owner TO postgres WITH INHERIT FALSE, SET FALSE')
        c.execute('SET LOCAL ROLE pg_database_owner');c.execute('GRANT USAGE ON SCHEMA public TO mw_app_prod_journal_owner');c.execute('RESET ROLE')
        after={'memberships':c.execute(mem,[roles,roles]).fetchall(),'schemaAcl':c.execute(acl).fetchall()}
        expected=[dict(role=app,member=owner,grantor='cloudsqladmin',admin_option=False,inherit_option=True,set_option=False),dict(role=owner,member='postgres',grantor='cloudsqladmin',admin_option=False,inherit_option=False,set_option=False)]
        assert [m for m in after['memberships'] if m['role'] in [app,owner] or m['member'] in [app,owner]]==expected, 'Unexpected closed membership tuple'
        assert [m for m in after['memberships'] if m['role'] not in [app,owner] and m['member'] not in [app,owner]]==before['memberships'], 'Existing DEV membership changed'
        assert [v for v in after['schemaAcl'] if v['grantee'] not in [app,owner]]==before['schemaAcl'], 'Unrelated schema ACL changed'
        assert [v for v in after['schemaAcl'] if v['grantee'] in [app,owner]]==[dict(grantor='pg_database_owner',grantee=owner,privilege='USAGE',grantable=False)]
        closed=c.execute("SELECT pg_has_role('postgres','mw_app_prod_journal_owner','USAGE') inherited,pg_has_role('postgres','mw_app_prod_journal_owner','SET') can_set,has_schema_privilege('mw_app_prod_journal_owner','public','CREATE') can_create").fetchone()
        assert closed==dict(inherited=False,can_set=False,can_create=False)
        flags=c.execute('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY(%s) ORDER BY rolname',[[app,owner]]).fetchall()
        assert len(flags)==2 and all(not any(r[k] for k in ['rolcanlogin','rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls']) for r in flags)
        after['flags']=flags;after['closedAuthority']=closed
        (folder/'closed-baseline.json').write_text(json.dumps(after,indent=2)+'\n')
        c.execute('COMMIT')
    except:
        c.execute('ROLLBACK');raise
    result={'schemaVersion':1,'observedAt':datetime.now(timezone.utc).isoformat(),'approvalReference':a.approval_reference,'database':'loan_manager_prod','historyVersion':77,'rolePrerequisitesApplied':True,'operatorInheritSetAndOwnerCreate':False,'existingDevMembershipsPreserved':True,'schemaUsageOnly':True,'runtimeMembershipsAdded':False,'migrationApplied':False}
    print(json.dumps({**result,'privateRecoveryDirectory':str(folder)}))
    (folder/'result.json').write_text(json.dumps(result,indent=2)+'\n')
