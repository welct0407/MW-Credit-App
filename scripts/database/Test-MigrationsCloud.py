"""Linux parity for Test-CI's disposable migration/SQL/concurrency route.

Uses the established local toolchain, never Cloud SQL or a shared lab. Windows
continues using Test-Migrations.ps1. All retained logs are synthetic.
Tool locations: MW_DB_TOOL_ROOT (default /workspace/.setup, the cloud-session
toolchain) and MW_PG_BIN (default: the toolchain's PostgreSQL, else the PGDG
package layout used on GitHub ubuntu-latest runners).
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

REPO=Path(__file__).resolve().parents[2]
SETUP=Path(os.environ.get('MW_DB_TOOL_ROOT') or '/workspace/.setup')
PG=Path(os.environ.get('MW_PG_BIN') or (SETUP/'postgresql-18.6/bin' if (SETUP/'postgresql-18.6/bin/pg_ctl').exists() else '/usr/lib/postgresql/18/bin'))
FLYWAY=SETUP/('flyway-'+json.loads((REPO/'database/toolchain.json').read_text())['flywayVersion'])/'flyway'
PWSH=SETUP/'powershell-7.5.4/pwsh' if (SETUP/'powershell-7.5.4/pwsh').exists() else Path(shutil.which('pwsh') or 'pwsh')
# PROD default privileges (Test-ProdDefaultPrivileges.sql) replayed after the version where each changed in PROD,
# so migration self-checks see PROD-like defaults (R089: V103 passed here and failed in PROD). Recorded history only.
PROD_DEFAULTS=((101,'apply'),(102,'pause'),(103,'resume'))

def migration_plan(latest,pre_target=None):
 """(target version, step) pairs: migrate to the target, then run the step; a final None target migrates the rest."""
 steps=[(pre_target,'pre')] if pre_target else []
 steps+=[(v,s) for v,s in PROD_DEFAULTS if v<=latest]
 return sorted(steps,key=lambda x:x[0])+[(None,'remove' if latest>=PROD_DEFAULTS[0][0] else None)]

def main():
 p=argparse.ArgumentParser();p.add_argument('--sql',default='scripts/database/Test-StatementBatch.sql');p.add_argument('--pre-sql');p.add_argument('--pre-target',type=int);p.add_argument('--sql-only',action='store_true');args=p.parse_args()
 root=Path(tempfile.mkdtemp(prefix='r051-migration-test-',dir='/tmp'));data=root/'data'
 migrations=root/'tested-migrations';shutil.copytree(REPO/'database/migrations',migrations)
 env={k:v for k,v in os.environ.items() if not k.startswith(('FLYWAY_','PG','CODEX_'))}
 # Test-CI already runs in the supported runtime. Nested proot wrappers can stall
 # PowerShell startup; launch its verified binary with the same library path.
 if (SETUP/'sysroot').exists():env['LD_LIBRARY_PATH']=str(SETUP/'sysroot/usr/lib/x86_64-linux-gnu')+':'+env.get('LD_LIBRARY_PATH','')
 def run(command,**kw):
  return subprocess.run([str(x) for x in command],env=env,check=True,**kw)
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 psql=[PG/'psql','-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d','loan_manager_dev']
 flyway=[FLYWAY,f'-url=jdbc:postgresql://127.0.0.1:{port}/loan_manager_dev','-user=postgres','-configFiles='+str(REPO/'database/flyway.conf'),'-locations=filesystem:'+str(migrations),'-outputType=json']
 run([PG/'initdb','-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],stdout=subprocess.DEVNULL)
 run([PG/'pg_ctl','-D',data,'-l',root/'postgres.log','-o',f'-h 127.0.0.1 -p {port} -k {root}','-w','start'],stdout=subprocess.DEVNULL)
 try:
  run([PG/'createdb','-h','127.0.0.1','-p',port,'-U','postgres','loan_manager_dev'],stdout=subprocess.DEVNULL)
  run(psql+['-f',REPO/'scripts/database/Test-AgentAuditPrerequisites.sql'],stdout=subprocess.DEVNULL)
  run(psql+['-f',REPO/'scripts/database/Test-AppRolePrerequisites.sql'],stdout=subprocess.DEVNULL)
  run(psql+['-f',REPO/'scripts/database/Test-IamRolePrerequisites.sql'],stdout=subprocess.DEVNULL)
  if (args.pre_sql or args.pre_target) and not (args.pre_sql and args.pre_target):raise ValueError('Both pre-migration fixture and target are required')
  latest=max(int(f.name[1:].split('__')[0]) for f in migrations.glob('V*__*.sql'))
  first=dict(success=True,migrationsExecuted=0)
  for target,step in migration_plan(latest,args.pre_target):
   segment=json.loads(run(flyway+([f'-target={target}'] if target else [])+['migrate'],cwd=REPO,capture_output=True,text=True).stdout)
   assert segment['success']
   first['migrationsExecuted']+=segment['migrationsExecuted']
   if step=='pre':
    run(psql+['-f',REPO/args.pre_sql],cwd=REPO,stdout=subprocess.DEVNULL);first['migrationsExecuted']=0
   elif step:run(psql+['-q','-v','step='+step,'-f',REPO/'scripts/database/Test-ProdDefaultPrivileges.sql'],cwd=REPO,stdout=subprocess.DEVNULL)
  assert json.loads(run(flyway+['validate'],cwd=REPO,capture_output=True,text=True).stdout)['validationSuccessful']
  second=json.loads(run(flyway+['migrate'],cwd=REPO,capture_output=True,text=True).stdout)
  assert second['success'] and second['migrationsExecuted']==0
  if args.pre_target is None:
   # DB-SCHEMA-01: the clean full-chain rebuild (before any test SQL) must match the
   # committed database/current/public-functions.sql. MW_WRITE_PUBLIC_FUNCTIONS=1 rewrites it.
   subprocess.run([str(x) for x in [PWSH,'-NoProfile','-File',REPO/'scripts/database/Update-PublicFunctions.ps1','-Port',port]],env={**env,'MW_PG_BIN':str(PG),'MW_DB_TOOL_ROOT':str(SETUP)},cwd=REPO,check=True)
  with (root/'sql.log').open('w') as log:
   result=subprocess.run([str(x) for x in psql+['-f',REPO/args.sql]],env=env,cwd=REPO,stdout=log,stderr=log)
  if result.returncode:
   print((root/'sql.log').read_text()[-6000:]);raise RuntimeError('SQL regression failed: '+str(root))
  adapted=root/'concurrency';adapted.mkdir()
  for source in (REPO/'scripts/database').glob('*.sql'):(adapted/source.name).symlink_to(source)
  checks=[]
  for name in ([] if args.sql_only else ['BusinessExpenses','ExpenseReimbursement','PaymentCrud','ReceiptDelete','InterestReallocation','CorePayment','AtomicLoanClose','ChargeGeneration','DefaultLoan']):
   source=REPO/f'scripts/database/Test-{name}Concurrency.ps1'
   dest=adapted/source.name
   dest.write_text(source.read_text().replace('psql.exe','psql').replace(' -WindowStyle Hidden',''))
   with (root/(name+'.log')).open('w') as log:
    run([PWSH,'-NoProfile','-File',dest,'-PgBin',PG,'-Port',port,'-OutputDirectory',root,'-Database','loan_manager_dev'],stdout=log,stderr=log)
   checks.append(name)
  run([PG/'pg_dump','-h','127.0.0.1','-p',port,'-U','postgres','-d','loan_manager_dev','--schema-only','--no-owner','--no-privileges','--schema=public','--schema=assessment_lab','--exclude-table=public.flyway_schema_history','--file='+str(root/'rebuilt.sql')])
  run([PWSH,'-NoProfile','-File',REPO/'scripts/database/Normalize-Schema.ps1','-InputFile',root/'rebuilt.sql','-OutputFile',root/'rebuilt.normalized.sql'])
  # A one-migration upgrade (for example V68 -> V69) is not a V1-only rebuild.
  if args.pre_target is None and first['migrationsExecuted']==1:
   assert (root/'rebuilt.normalized.sql').read_bytes()==(REPO/'database/migrations/V1__existing_schema.sql').read_bytes()
  copies=root/'migrations';shutil.copytree(migrations,copies)
  v1=copies/'V1__existing_schema.sql';v1.write_text(v1.read_text().replace("'standard public schema'","'synthetic checksum mutation'"))
  mutation=subprocess.run([str(x) for x in flyway if not str(x).startswith('-locations=')]+['-locations=filesystem:'+str(copies),'validate'],env=env,cwd=REPO,capture_output=True,text=True)
  outcome=json.loads(mutation.stdout)
  assert not outcome['validationSuccessful'] and sum(m['errorDetails']['errorCode']=='CHECKSUM_MISMATCH' for m in outcome['invalidMigrations'])==1
  result=dict(migrations=first['migrationsExecuted'],pre_migration_target=args.pre_target,second_run=0,sql='passed',concurrency=checks,checksum_tampering_rejected=True,logs=str(root))
  print(json.dumps(result))
 finally:run([PG/'pg_ctl','-D',data,'-m','fast','-w','stop'],stdout=subprocess.DEVNULL)

if __name__=='__main__':main()
