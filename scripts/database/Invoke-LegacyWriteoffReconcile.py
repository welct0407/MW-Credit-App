"""R116 (V130) operator runbook: post the missing df10: pairs of the legacy defaulted loans.

Owner decision of 2 November 2026: the loans defaulted in the AppSheet era (DEV and PROD: 5,000 closed 2026-08-26 and
1,000 closed 2026-08-28) get their loss pair dated on the Close Date, and Daily Analytics is refreshed from that date
through today. The work is public.reconcile_legacy_default_postings (V130), owner-only, so this runs as the postgres
migration identity through the IAP tunnel of Invoke-CloudFlyway.py (scripts/database/cloud-db-tunnel.sh); the credential
comes from Secret Manager, stays in process memory, reaches psql only through PGPASSWORD and is never printed.

  --environment dev|prod --dry-run
      One READ ONLY transaction, rolled back: checks the database and identity, prints each loan id, recorded loss, ledger,
      amount to post and Close Date. Writes nothing.
  --environment dev|prod --apply --expected-count N --actor EMAIL [--approval-reference TEXT]   (prod needs the reference)
      One transaction: checks the database and identity, refuses unless the dry run lists exactly N loans, applies (the
      function posts the pairs, proves column = ledger and refreshes Daily Analytics), refuses unless the posted loans are
      the listed ones, prints them and commits. Then a READ ONLY dry run must list nothing.
Output carries loan ids, amounts and dates only, never a borrower name. An interrupted apply has an unknown outcome:
run --dry-run first; the function is idempotent, so the loans it still lists are the ones not posted.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]
_spec=importlib.util.spec_from_file_location('cloud_flyway',HERE/'Invoke-CloudFlyway.py')
cloud=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(cloud)
EMAIL=re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}$')

DRY_RUN_SQL="""BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SELECT 'target',current_database(),current_user;
SELECT 'row',loan,close_date,column_amount,ledger_amount,column_amount-ledger_amount FROM public.reconcile_legacy_default_postings(NULL,false);
ROLLBACK;
"""
# Values reach the server only as psql variables (:'name' quotes them); the checks run before any write.
APPLY_SQL="""BEGIN;
SET LOCAL statement_timeout='300s';
SET LOCAL lock_timeout='5s';
SET LOCAL idle_in_transaction_session_timeout='60s';
SELECT set_config('r116.database',:'database',true),set_config('r116.expected',:'expected',true) \\g /dev/null
DO $r116$BEGIN
 IF current_database()<>current_setting('r116.database') OR current_user<>'postgres' THEN RAISE EXCEPTION 'R116: unexpected database or identity'; END IF;
 IF (SELECT count(*) FROM public.reconcile_legacy_default_postings(NULL,false))<>current_setting('r116.expected')::integer THEN
  RAISE EXCEPTION 'R116: the dry run does not list the expected number of loans'; END IF;
END $r116$;
CREATE TEMP TABLE r116_listed ON COMMIT DROP AS SELECT loan FROM public.reconcile_legacy_default_postings(NULL,false);
CREATE TEMP TABLE r116_posted ON COMMIT DROP AS SELECT * FROM public.reconcile_legacy_default_postings(:'actor',true);
DO $r116$BEGIN
 IF (SELECT array_agg(loan ORDER BY loan) FROM r116_posted) IS DISTINCT FROM (SELECT array_agg(loan ORDER BY loan) FROM r116_listed)
  OR EXISTS(SELECT 1 FROM r116_posted WHERE action<>'posted') THEN RAISE EXCEPTION 'R116: the posted loans differ from the dry run'; END IF;
END $r116$;
SELECT 'target',current_database(),current_user;
SELECT 'row',loan,close_date,column_amount,ledger_amount,column_amount-ledger_amount,posting_id FROM r116_posted ORDER BY loan;
COMMIT;
"""


def parse(stdout,database):
    """The target line must name the expected database and identity; returns the listed rows (tab-separated fields)."""
    lines=[line.split('\t') for line in stdout.splitlines() if line.strip()]
    targets=[line for line in lines if line[0]=='target']
    if targets!=[['target',database,'postgres']]:raise RuntimeError('Unexpected database or identity; nothing is trusted')
    rows=[line[1:] for line in lines if line[0]=='row']
    if any(line[0] not in ('target','row') for line in lines):raise RuntimeError('Unexpected psql output')
    return rows


def psql_path(environ):
    base=Path(environ.get('MW_PG_BIN') or Path(environ.get('MW_DB_TOOL_ROOT') or '/workspace/.setup')/'postgresql-18.6/bin')
    path=base/'psql'
    if not path.is_file():raise ValueError('psql missing; run project/scripts/cloud-session-setup.sh')
    return path


def execute(sql,database,port,password,variables,runner,environ):
    argv=[str(psql_path(environ)),'-X','-q','-A','-t','-F','\t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',str(int(port)),'-U','postgres','-d',database]
    for name,value in variables.items():argv+=['-v',f'{name}={value}']
    child={k:v for k,v in environ.items() if not k.startswith(('PG','DATABASE_URL'))}
    child.update(PGPASSWORD=password,PGSSLMODE='disable',PGAPPNAME='r116-legacy-writeoff-reconcile',PGCONNECT_TIMEOUT='10')
    completed=runner(argv,input=sql,env=child,capture_output=True,text=True)
    if completed.returncode:
        # The server's message names no secret; psql's stderr is shown without the environment.
        errors=[line for line in (completed.stderr or '').splitlines() if 'ERROR:' in line][:1]
        raise RuntimeError('psql failed'+(': '+errors[0].split('ERROR:',1)[1].strip() if errors else ''))
    return completed.stdout


def show(rows,posted):
    header='loan\tclose_date\trecorded\tledger\tamount'+('\tposting_id' if posted else '')
    print(header)
    for row in rows:print('\t'.join(row))
    print(f'{len(rows)} loan(s) '+('posted' if posted else 'to post'))


def run(args,environ=None,runner=subprocess.run,secrets=cloud.secret_output,tunnel_factory=cloud.tunnel):
    environ=os.environ if environ is None else environ
    database=cloud.DATABASES[args.environment]
    if args.apply:
        if args.expected_count is None or args.expected_count<1:raise ValueError('--apply requires --expected-count N (the dry-run count, at least 1)')
        if not args.actor or not EMAIL.match(args.actor):raise ValueError('--apply requires --actor EMAIL (the owner who runs it)')
        if args.environment=='prod' and not (args.approval_reference or '').strip():raise ValueError('A production apply requires --approval-reference')
    with tunnel_factory(REPO,environ) as port:
        password=secrets(['gcloud','secrets','versions','access','latest','--secret='+cloud.ADMIN_SECRET,'--project='+cloud.PROJECT])
        try:
            if not args.apply:
                rows=parse(execute(DRY_RUN_SQL,database,port,password,{},runner,environ),database)
                show(rows,False);return rows
            try:
                posted=parse(execute(APPLY_SQL,database,port,password,{'database':database,'expected':str(args.expected_count),'actor':args.actor},runner,environ),database)
            except RuntimeError:
                print('Apply did not complete; its outcome is unknown until --dry-run is read (the function is idempotent).',file=sys.stderr)
                raise
            show(posted,True)
            remaining=parse(execute(DRY_RUN_SQL,database,port,password,{},runner,environ),database)
            if remaining:raise RuntimeError('A READ ONLY dry run after apply still lists loans; reconcile before any rerun')
            print('Post-apply dry run lists no loan.'+(f' Approval: {args.approval_reference.strip()}' if args.approval_reference else ''))
            return posted
        finally:
            del password


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--environment',choices=sorted(cloud.DATABASES),required=True)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run',action='store_true')
    mode.add_argument('--apply',action='store_true')
    parser.add_argument('--expected-count',type=int)
    parser.add_argument('--actor')
    parser.add_argument('--approval-reference')
    args=parser.parse_args(argv)
    try:run(args)
    except (ValueError,RuntimeError) as error:
        print(str(error),file=sys.stderr);return 1
    return 0


if __name__=='__main__':sys.exit(main())
