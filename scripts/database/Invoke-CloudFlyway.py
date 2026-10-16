"""Pinned Flyway through the IAP tunnel; the documented second PROD migration path.

Route: scripts/database/cloud-db-tunnel.sh (IAP SSH to vm-mw-credit-agent and its
loopback Cloud SQL Auth Proxy to mw-credit-pg-20261017), the same tunnel the
Linux cloud sessions use for reads. VM-01 Invoke-Flyway.ps1 remains the primary
route. Read-only actions (info, validate) sign in as the read identity
codex-cloud-read@...iam with a short-lived IAM token obtained by impersonation;
only migrate uses the postgres admin credential from Secret Manager, held in
process memory and passed to Flyway through its environment. The pending set is
manifest-driven: exactly the tested release's migrations above the applied head.

  prepare --release-file F --validation-reference R   DEV validate/info, write release file
  verify  [--target dev|prod]                          read-only validate + info summary
  check|apply --release-file F --approval-reference A --backup-reference B --connect-preflight-file P

Production check/apply reuse the canonical grouped-transaction guard
(Production-Transaction.ps1 Assert-ProductionTransactionPackage, through pwsh): the
release must pin productionTransaction exactly as Invoke-Flyway.ps1 requires.
"""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess

REPO=Path(__file__).resolve().parents[2]
PROJECT='clever-oasis-508610-n7'
INSTANCE='mw-credit-pg-20261017'
READ_SERVICE_ACCOUNT='codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com'
READ_USER='codex-cloud-read@clever-oasis-508610-n7.iam'
ADMIN_USER='postgres'
ADMIN_SECRET='mw-credit-ops-cloudsql-postgres-admin'
DATABASES={'dev':'loan_manager_dev','prod':'loan_manager_prod'}
APPLIED_STATES=('Success','Baseline')


def git(repo,*args):
    return subprocess.check_output(['git','-C',str(repo),*args],text=True).strip()


def version_key(value):
    parts=[int(x) for x in str(value).replace('_','.').split('.')]
    while len(parts)>1 and parts[-1]==0:parts.pop()
    return tuple(parts)


def manifest(repo):
    files=sorted((repo/'database/migrations').glob('*.sql'))
    versions=set();result=[]
    if not files:raise ValueError('No reviewed migrations')
    for p in files:
        match=re.fullmatch(r'V([0-9]+(?:[._][0-9]+)*)__[A-Za-z0-9_]+\.sql',p.name)
        if not match:raise ValueError('Invalid migration filename')
        version=version_key(match[1])
        if version in versions:raise ValueError('Duplicate migration version')
        versions.add(version)
        result.append({'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    return result


def manifest_versions(entries):
    return sorted(version_key(re.match(r'V([0-9]+(?:[._][0-9]+)*)__',e['name'])[1]) for e in entries)


def guard(repo,release,approval,backup,environ):
    if any(k.startswith('FLYWAY_') for k in environ):raise ValueError('Ambient Flyway overrides prohibited')
    if git(repo,'status','--porcelain'):raise ValueError('Clean committed checkout required')
    if not approval or not approval.strip() or not backup or not backup.strip():raise ValueError('Actual approval and verified backup references required')
    if release.get('commit')!=git(repo,'rev-parse','HEAD'):raise ValueError('Release commit differs')
    if release.get('environment')!='development' or not release.get('validationReference'):raise ValueError('Development validation required')
    if release.get('migrations')!=manifest(repo):raise ValueError('Migration hashes differ')
    targets=json.loads((repo/'database/environments.json').read_text())
    for name,db in [('development','loan_manager_dev'),('production','loan_manager_prod')]:
        t=targets[name]
        if (t['instance'],t['host'],t['database'],t['user'])!=(INSTANCE,'136.85.127.134',db,'postgres'):
            raise ValueError('Database identity differs')


def pending(info,expected):
    """Validate Flyway info and return the pending versions as strings.

    expected=None: nothing may be pending. Otherwise expected is the tested
    release manifest; the pending rows must be exactly its migrations above the
    applied head, in version order, and every other row must be applied.
    """
    rows=info['migrations']
    unexpected=[r for r in rows if r['state'] not in APPLIED_STATES and not (r['state']=='Ignored (Baseline)' and version_key(r['version'])==(1,))]
    if any(r['state']!='Pending' for r in unexpected):raise ValueError('Failed, missing or out-of-order migration state')
    actual=[version_key(r['version']) for r in unexpected]
    if expected is None:
        if actual:raise ValueError('Pending migrations present')
        return []
    applied=[version_key(r['version']) for r in rows if r['state']=='Success']
    head=max(applied) if applied else (0,)
    wanted=[v for v in manifest_versions(expected) if v>head]
    if actual!=wanted:raise ValueError('Pending migrations differ from the tested release manifest')
    return ['.'.join(map(str,v)) for v in actual]


def flyway_path(repo,environ):
    toolchain=json.loads((repo/'database/toolchain.json').read_text())
    path=Path(environ.get('MW_DB_TOOL_ROOT') or '/workspace/.setup')/('flyway-'+toolchain['flywayVersion'])/'flyway'
    if not path.is_file():raise ValueError('Pinned Flyway missing; run project/scripts/cloud-session-setup.sh or Install-Tools.ps1')
    return path


def credential(action,secrets):
    """Read identity for info/validate; the postgres admin credential only for migrate."""
    if action=='migrate':
        return ADMIN_USER,secrets(['gcloud','secrets','versions','access','latest','--secret='+ADMIN_SECRET,'--project='+PROJECT])
    return READ_USER,secrets(['gcloud','sql','generate-login-token','--impersonate-service-account='+READ_SERVICE_ACCOUNT])


GROUPED=['-group=true','-mixed=false','-executeInTransaction=true']


def transaction_arguments(repo,release,preflight_file,execute=subprocess.run):
    """Grouped production settings, checked by the same PowerShell guard as VM-01."""
    pin=release.get('productionTransaction') or {}
    if pin.get('group') is not True or pin.get('mixed') is not False or pin.get('executeInTransaction') is not True or pin.get('callbacks'):
        raise ValueError('Tested release must pin grouped transactional production settings without callbacks')
    if not preflight_file or hashlib.sha256(Path(preflight_file).read_bytes()).hexdigest()!=pin.get('connectPreflightSha256'):
        raise ValueError('CONNECT preflight differs from pinned production package')
    script=("$ErrorActionPreference='Stop'; . ./scripts/database/Production-Transaction.ps1; "
        "$r=Get-Content -LiteralPath $env:MW_RELEASE_FILE -Raw | ConvertFrom-Json; $p=Get-Content -LiteralPath $env:MW_PREFLIGHT_FILE -Raw | ConvertFrom-Json; "
        "(Assert-ProductionTransactionPackage -MigrationRoot database/migrations -Manifest $r.migrations -BaselineVersion $r.productionTransaction.baselineVersion "
        "-TargetVersion $r.productionTransaction.targetVersion -Preflight $p) -join ' '")
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','FLYWAY_'))}
    env.update(MW_RELEASE_FILE=str(release['_path']),MW_PREFLIGHT_FILE=str(preflight_file))
    completed=execute(['pwsh','-NoProfile','-NonInteractive','-Command',script],cwd=str(repo),env=env,capture_output=True,text=True)
    if completed.returncode or completed.stdout.split()!=GROUPED:raise ValueError('Grouped production package check failed')
    return list(GROUPED),version_key(pin['baselineVersion'])


def command(repo,flyway,port,target,action,user,approved_pending=False,transaction=()):
    if target not in DATABASES or action not in ('info','validate','migrate'):raise ValueError('Unsupported operation')
    if approved_pending and (target!='prod' or action!='validate'):raise ValueError('Pending exception is validation-only')
    if transaction and (target!='prod' or action!='migrate' or list(transaction)!=GROUPED):raise ValueError('Grouped settings apply only to a production migrate')
    if target=='prod' and action=='migrate' and list(transaction)!=GROUPED:raise ValueError('Production migrate requires the grouped transaction settings')
    if not 1<=int(port)<=65535:raise ValueError('Invalid owned tunnel port')
    init="SET lock_timeout='5s'; SET statement_timeout='30s'"
    if action!='migrate':init+='; SET default_transaction_read_only=on'
    # The tunnel ends at the host's Cloud SQL Auth Proxy, which encrypts to the
    # instance; the loopback hop is plain (as in Common.ps1's Linux branch).
    argv=[str(flyway),'-outputType=json','-configFiles='+str(repo/'database/flyway.conf'),'-locations=filesystem:'+str(repo/'database/migrations'),
        f'-url=jdbc:postgresql://127.0.0.1:{int(port)}/{DATABASES[target]}?sslmode=disable&connectTimeout=10&ApplicationName=loan-project-flyway',
        '-user='+user,'-initSql='+init]
    if approved_pending:argv.append('-ignoreMigrationPatterns=*:pending')
    return argv+list(transaction)+[action]


def listening(port):
    with contextlib.suppress(OSError),socket.create_connection(('127.0.0.1',port),timeout=2):return True
    return False


@contextlib.contextmanager
def tunnel(repo,environ,opener=subprocess.run,closer=subprocess.run,probe=listening):
    port=int(environ.get('MW_DB_TUNNEL_PORT','15432'))
    reused=probe(port)
    if not reused:opener(['bash',str(repo/'scripts/database/cloud-db-tunnel.sh')],check=True,stdout=subprocess.DEVNULL,env=dict(environ))
    try:yield port
    finally:
        # Close only a tunnel this run opened; an existing session tunnel stays.
        if not reused:closer(['pkill','-f',f'127.0.0.1:{port}:127.0.0.1:5432'],check=False)


def secret_output(argv):
    value=subprocess.run(argv,check=True,capture_output=True,text=True).stdout.strip()
    if not value:raise ValueError('Credential unavailable')
    return value


def run(repo,target,action,environ=None,approved_pending=False,execute=subprocess.run,secrets=secret_output,tunnel_factory=tunnel,transaction=()):
    environ=os.environ if environ is None else environ
    if target not in DATABASES or action not in ('info','validate','migrate'):raise ValueError('Unsupported operation')
    if any(k.startswith('FLYWAY_') for k in environ):raise ValueError('Ambient Flyway overrides prohibited')
    flyway=flyway_path(repo,environ)
    child={k:v for k,v in environ.items() if not k.startswith(('PG','FLYWAY_','DATABASE_URL'))}
    with tunnel_factory(repo,environ) as port:
        user,password=credential(action,secrets)
        argv=command(repo,flyway,port,target,action,user,approved_pending,transaction)
        completed=execute(argv,env={**child,'FLYWAY_PASSWORD':password},cwd=str(repo),capture_output=True,text=True)
        del password
    try:result=json.loads(completed.stdout)
    except (TypeError,ValueError):raise ValueError('Flyway produced no JSON result') from None
    if completed.returncode or any(result.get(k) for k in ('error','errorDetails','exception')):raise ValueError('Flyway reported failure')
    if action=='validate' and result.get('validationSuccessful') is not True:raise ValueError('Flyway validation failed')
    if action=='migrate' and result.get('success') is not True:raise ValueError('Flyway migration failed')
    if action=='info' and result.get('database') not in (None,DATABASES[target]):raise ValueError('Flyway reached a different database')
    result['_identity']=user
    return result


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('mode',choices=['prepare','verify','check','apply'])
    parser.add_argument('--target',choices=sorted(DATABASES),default='dev',help='verify only')
    parser.add_argument('--release-file',type=Path)
    parser.add_argument('--validation-reference')
    parser.add_argument('--approval-reference')
    parser.add_argument('--backup-reference')
    parser.add_argument('--connect-preflight-file',type=Path)
    args=parser.parse_args(argv)
    if args.mode=='verify':
        valid=run(REPO,args.target,'validate');info=run(REPO,args.target,'info');pending(info,None)
        applied=[r for r in info['migrations'] if r['state']=='Success']
        print(json.dumps({'verified':True,'target':DATABASES[args.target],'identity':info['_identity'],'validationSuccessful':valid['validationSuccessful'],
            'schemaVersion':info.get('schemaVersion'),'applied':len(applied),'pending':[],'writes':0}))
        return
    if not args.release_file:parser.error('--release-file is required')
    if args.mode=='prepare':
        if git(REPO,'status','--porcelain') or not args.validation_reference:raise ValueError('Clean commit and actual validation reference required')
        run(REPO,'dev','validate');pending(run(REPO,'dev','info'),None)
        release=dict(environment='development',commit=git(REPO,'rev-parse','HEAD'),validationReference=args.validation_reference,migrations=manifest(REPO))
        fd=os.open(args.release_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:json.dump(release,f,indent=2)
        print(json.dumps({'prepared':True,'commit':release['commit'],'migration_count':len(release['migrations'])}))
        return
    release=json.loads(args.release_file.read_text());guard(REPO,release,args.approval_reference,args.backup_reference,os.environ)
    transaction,baseline=transaction_arguments(REPO,{**release,'_path':args.release_file},args.connect_preflight_file)
    info=run(REPO,'prod','info')
    if version_key(info.get('schemaVersion') or 0)!=baseline:raise ValueError('Production baseline changed; re-review the complete candidate')
    versions=pending(info,release['migrations'])
    if not versions:raise ValueError('Nothing pending: production already matches the tested release')
    # Strict validate rejects intentionally pending migrations. Permit only that
    # state after the manifest-driven eligibility gate; every applied checksum,
    # description and failed/missing state is still checked.
    run(REPO,'prod','validate',approved_pending=True)
    guard(REPO,release,args.approval_reference,args.backup_reference,os.environ)
    if args.mode=='check':
        print(json.dumps({'checked':True,'production_writes':0,'pending_versions':versions}))
        return
    result=run(REPO,'prod','migrate',transaction=transaction);run(REPO,'prod','validate');pending(run(REPO,'prod','info'),None)
    print(json.dumps({'applied':True,'migrations_executed':result.get('migrationsExecuted'),'version':result.get('targetSchemaVersion'),'pending_versions':versions}))


if __name__=='__main__':
    main()
