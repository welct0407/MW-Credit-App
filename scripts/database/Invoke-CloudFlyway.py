"""Pinned Flyway via the existing fixed IAP transport; no credential persistence.

The transport's SQL child dispatch is adapted to Flyway, preserving its exact
principal, host pin, admin approval, environment isolation and cleanup. Existing
Windows runner remains unchanged. Only V58 production migration is supported.
"""
import argparse
import contextlib
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess

ACCESS=Path('/workspace/.setup/cloud-access')
PIN='/workspace/.setup/cloud-access-host.pub'
HELPER_SHA='b3047ba47c2088ed07e104a75554cf83f86b3d936d93a80af4533cbb6e122842'
REPO=Path(__file__).resolve().parents[2]


def git(repo,*args):
    return subprocess.check_output(['git','-C',str(repo),*args],text=True).strip()


def manifest(repo):
    files=sorted((repo/'database/migrations').glob('*.sql'))
    versions=set();result=[]
    if not files:raise ValueError('No reviewed migrations')
    for p in files:
        match=re.fullmatch(r'V([0-9]+(?:[._][0-9]+)*)__[A-Za-z0-9_]+\.sql',p.name)
        if not match:raise ValueError('Invalid migration filename')
        parts=[int(x) for x in match[1].replace('_','.').split('.')]
        while len(parts)>1 and parts[-1]==0:parts.pop()
        version=tuple(parts)
        if version in versions:raise ValueError('Duplicate migration version')
        versions.add(version)
        result.append({'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    return result


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
        if (t['instance'],t['host'],t['database'],t['user'])!=('appsheet-pg-prod-20260914','34.21.174.215',db,'postgres'):
            raise ValueError('Database identity differs')


def dispatch(helper,original,session,argv,env,tunnels,visible,cwd,redactions,stage,repo,target,action,approved_pending=False):
    if stage!='SQL '+target.upper():
        return original(session,argv,env,tunnels,visible,cwd,redactions,stage)
    db='loan_manager_prod' if target=='prod' else 'loan_manager_dev'
    if (argv[:2]!=[helper.WRAPPER,'psql'] or argv[argv.index('-d')+1]!=db
            or '-h' not in argv or argv[argv.index('-h')+1]!='127.0.0.1'
            or len(tunnels)!=2 or argv[argv.index('-U')+1]!='postgres'
            or argv[-2:]!=['-c','SELECT 1']):
        raise ValueError('Unexpected transport child; dispatch prohibited')
    port=argv[argv.index('-p')+1]
    if not port.isdigit() or not 1<=int(port)<=65535:raise ValueError('Invalid owned tunnel port')
    child=dict(env);password=child.pop('PGPASSWORD');child.pop('PGOPTIONS',None)
    child['FLYWAY_PASSWORD']=password
    config=repo/'database/flyway.conf'
    content=config.read_text()
    if any(secret and secret in content for secret in redactions):raise ValueError('Credential material in configuration')
    command=[helper.WRAPPER,'flyway','-outputType=json','-configFiles='+str(config),
        '-url=jdbc:postgresql://127.0.0.1:'+port+'/'+db+'?sslmode=prefer&connectTimeout=10&ApplicationName=loan-project-flyway',
        '-user=postgres',"-initSql=SET lock_timeout='5s'; SET statement_timeout='30s'",action]
    if approved_pending:
        if target!='prod' or action!='validate':raise ValueError('Pending exception is validation-only')
        command.insert(-1,'-ignoreMigrationPatterns=*:pending')
    return original(session,command,child,tunnels,True,str(repo),redactions,'Flyway '+target.upper())


def run(repo,target,action,environ=None,approved_pending=False):
    environ=os.environ if environ is None else environ
    if target not in ('dev','prod') or action not in ('info','validate','migrate'):raise ValueError('Unsupported operation')
    if any(k.startswith('FLYWAY_') for k in environ):raise ValueError('Ambient Flyway overrides prohibited')
    if hashlib.sha256(ACCESS.read_bytes()).hexdigest()!=HELPER_SHA:raise ValueError('Reviewed transport changed')
    loader=importlib.machinery.SourceFileLoader('pinned_cloud_transport',str(ACCESS))
    spec=importlib.util.spec_from_loader(loader.name,loader);helper=importlib.util.module_from_spec(spec);loader.exec_module(helper)
    original=helper.Session.command
    def command(self,argv,env,tunnels=(),visible=False,cwd=None,redactions=(),stage='Child command'):
        return dispatch(helper,original,self,argv,env,tunnels,visible,cwd,redactions,stage,repo,target,action,approved_pending)
    helper.Session.command=command
    args=helper.parser().parse_args(['--host-key-file',PIN,'--confirm-ssh-user','codex-cloud','sql',target,'--admin',
        *(['--approve-prod-admin'] if target=='prod' else []),'--command','SELECT 1'])
    output=io.StringIO()
    with contextlib.redirect_stdout(output):helper.execute(args,environ)
    result=json.loads(output.getvalue())
    if any(result.get(k) for k in ('error','errorDetails','exception')):raise ValueError('Flyway reported failure')
    if action=='validate' and result.get('validationSuccessful') is not True:raise ValueError('Flyway validation failed')
    if action=='migrate' and result.get('success') is not True:raise ValueError('Flyway migration failed')
    return result


def pending(info,expected):
    rows=info['migrations']
    unexpected=[r for r in rows if r['state'] not in ('Success','Baseline') and not (r['state']=='Ignored (Baseline)' and str(r['version'])=='1')]
    if expected is None:
        if unexpected:raise ValueError('DEV has pending/invalid migrations')
    elif len(unexpected)!=1 or unexpected[0]['state']!='Pending' or str(unexpected[0]['version'])!=expected:
        raise ValueError('Only approved V58 may be pending')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['prepare','check','apply'])
    parser.add_argument('--release-file',type=Path,required=True)
    parser.add_argument('--validation-reference')
    parser.add_argument('--approval-reference')
    parser.add_argument('--backup-reference')
    args=parser.parse_args()
    if args.mode=='prepare':
        if git(REPO,'status','--porcelain') or not args.validation_reference:raise ValueError('Clean commit and actual validation reference required')
        run(REPO,'dev','validate');pending(run(REPO,'dev','info'),None)
        release=dict(environment='development',commit=git(REPO,'rev-parse','HEAD'),validationReference=args.validation_reference,migrations=manifest(REPO))
        fd=os.open(args.release_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:json.dump(release,f,indent=2)
        print(json.dumps({'prepared':True,'commit':release['commit'],'migration_count':len(release['migrations'])}))
    else:
        release=json.loads(args.release_file.read_text());guard(REPO,release,args.approval_reference,args.backup_reference,os.environ)
        pending(run(REPO,'prod','info'),'58')
        # Strict validate rejects an intentionally pending migration. Permit only
        # that state after the independent exact-V58 eligibility/manifest gate;
        # every applied checksum, description and failed/missing state is checked.
        run(REPO,'prod','validate',approved_pending=True)
        guard(REPO,release,args.approval_reference,args.backup_reference,os.environ)
        if args.mode=='check':print(json.dumps({'checked':True,'production_writes':0,'pending_version':'58'}))
        else:
            result=run(REPO,'prod','migrate');run(REPO,'prod','validate');pending(run(REPO,'prod','info'),None)
            print(json.dumps({'applied':True,'migrations_executed':result.get('migrationsExecuted'),'version':result.get('targetSchemaVersion')}))
